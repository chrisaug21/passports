import { getSupabase } from "../lib/supabase.js";

export const PHOTO_BUCKET = "trip-photos";
export const PHOTO_CONTEXTS = {
  tripHero: "trip-hero",
  baseHero: "base-hero",
};

const PHOTO_SELECT = "id, trip_id, base_id, storage_path, is_primary, sort_order, updated_at";

// A photo is stored as 3 separate files sharing one base path, since
// Supabase's on-the-fly image resizing (getPublicUrl's `transform` option)
// requires a paid plan. "full" keeps the base path as-is (unchanged from
// before this scheme existed); "preview" and "card" are suffixed variants
// generated client-side at upload time (see src/lib/photo-upload.js) and
// read back out by getPhotoPreviewPublicUrl/getPhotoCardPublicUrl below.
const PHOTO_VARIANT_SUFFIXES = {
  full: "",
  preview: "-720x480",
  card: "-360x240",
};

export async function saveUploadedPrimaryPhoto({
  userId,
  tripId,
  baseId = null,
  context,
  photo,
}) {
  if (!userId || !tripId || !context || !photo?.full) {
    throw new Error("Missing photo upload details.");
  }

  const existingPhoto = await getPrimaryPhotoForSlot({ tripId, baseId });

  const storagePath = `${userId}/${tripId}/${context}/${Date.now()}.jpg`;
  try {
    await uploadPhotoVariants({ storagePath, photo, upsert: false });
  } catch (error) {
    // The three files upload in parallel, so one can fail after the others
    // landed. This path is brand new (nothing references it yet), so it's
    // safe to sweep up whatever did get uploaded.
    await removePhotoVariants(storagePath).catch(() => {});
    throw error;
  }

  // Remove the old DB row before inserting the new one — the trip_photos
  // unique constraint (one row per trip/base slot) blocks INSERT while the
  // old row is still present.
  if (existingPhoto) {
    const { error: deleteError } = await getSupabase()
      .from("trip_photos")
      .delete()
      .eq("id", existingPhoto.id);
    if (deleteError) {
      await removePhotoVariants(storagePath).catch(() => {});
      throw deleteError;
    }
  }

  let newPhoto;
  try {
    newPhoto = await insertPrimaryPhotoRecord({ tripId, baseId, storagePath });
  } catch (error) {
    await removePhotoVariants(storagePath).catch(() => {});
    throw error;
  }

  // Old storage files deleted only after DB update succeeds — best-effort cleanup.
  if (existingPhoto) {
    await removePhotoVariants(existingPhoto.storage_path).catch((err) => {
      console.warn("Failed to remove old photo from storage:", err);
    });
  }

  return newPhoto;
}

export async function replaceExistingPrimaryPhoto({
  userId,
  tripId,
  baseId = null,
  context,
  photo,
}) {
  return saveUploadedPrimaryPhoto({
    userId,
    tripId,
    baseId,
    context,
    photo,
  });
}

export async function recropExistingPrimaryPhoto({ photoId, storagePath, photo }) {
  if (!photoId || !storagePath || !photo?.full) {
    throw new Error("Missing photo update details.");
  }

  await uploadPhotoVariants({ storagePath, photo, upsert: true });

  const { data, error } = await getSupabase()
    .from("trip_photos")
    .update({
      is_primary: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", photoId)
    .select(PHOTO_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return withPublicUrl(data);
}

export async function removePrimaryPhotoForSlot({ tripId, baseId = null }) {
  const existingPhoto = await getPrimaryPhotoForSlot({ tripId, baseId });

  if (!existingPhoto) {
    return null;
  }

  await removePhotoVariants(existingPhoto.storage_path);

  const { error } = await getSupabase()
    .from("trip_photos")
    .delete()
    .eq("id", existingPhoto.id);

  if (error) {
    throw error;
  }

  return existingPhoto;
}

export async function getPrimaryPhotoForSlot({ tripId, baseId = null }) {
  if (!tripId) {
    return null;
  }

  let query = getSupabase()
    .from("trip_photos")
    .select(PHOTO_SELECT)
    .eq("trip_id", tripId)
    .eq("is_primary", true)
    .is("day_id", null)
    .is("item_id", null);

  query = baseId ? query.eq("base_id", baseId) : query.is("base_id", null);

  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return withPublicUrl(data);
}

// Copies the trip's hero photo and any carried-over base heroes onto a new
// trip. baseIdMap maps old base_id -> new base_id for bases being carried
// over; a base's photo is skipped if its base wasn't carried over.
export async function duplicatePrimaryPhotosForNewTrip({ sourceTripId, newTripId, ownerId, baseIdMap }) {
  const supabase = getSupabase();

  const { data: sourcePhotos, error } = await supabase
    .from("trip_photos")
    .select("base_id, storage_path, source, unsplash_id, unsplash_url, credit_name, credit_url, sort_order")
    .eq("trip_id", sourceTripId)
    .eq("is_primary", true)
    .is("day_id", null)
    .is("item_id", null);

  if (error) {
    throw error;
  }

  for (const photo of sourcePhotos || []) {
    const newBaseId = photo.base_id ? baseIdMap.get(photo.base_id) : null;

    if (photo.base_id && !newBaseId) {
      continue;
    }

    // Each photo is copied independently, so one failure (e.g. a bad storage
    // copy) doesn't block the rest — this is already a best-effort step from
    // the caller's point of view.
    try {
      let newStoragePath = photo.storage_path;

      if (photo.storage_path) {
        const context = photo.base_id ? PHOTO_CONTEXTS.baseHero : PHOTO_CONTEXTS.tripHero;
        newStoragePath = `${ownerId}/${newTripId}/${context}/${crypto.randomUUID()}.jpg`;

        // The full-size file is required. Preview/card files are best-effort:
        // photos uploaded before client-side variants existed (and not yet
        // backfilled) only have the full-size file, and the UI already falls
        // back to it when a variant is missing.
        const copyResults = await Promise.all(
          Object.keys(PHOTO_VARIANT_SUFFIXES).map((variant) =>
            supabase.storage
              .from(PHOTO_BUCKET)
              .copy(getVariantStoragePath(photo.storage_path, variant), getVariantStoragePath(newStoragePath, variant))
          )
        );

        // "full" is the first key of PHOTO_VARIANT_SUFFIXES, so it's first here.
        const [fullCopyResult] = copyResults;

        if (fullCopyResult.error) {
          throw fullCopyResult.error;
        }
      }

      const { error: insertError } = await supabase.from("trip_photos").insert({
        id: crypto.randomUUID(),
        trip_id: newTripId,
        base_id: newBaseId || null,
        day_id: null,
        item_id: null,
        source: photo.source,
        storage_path: newStoragePath,
        unsplash_id: photo.unsplash_id,
        unsplash_url: photo.unsplash_url,
        credit_name: photo.credit_name,
        credit_url: photo.credit_url,
        is_primary: true,
        sort_order: photo.sort_order,
      });

      if (insertError) {
        throw insertError;
      }
    } catch (photoError) {
      console.error("Failed to copy a trip photo:", photoError);
    }
  }
}

export function getPhotoPublicUrl(storagePath, cacheKey = "") {
  if (!storagePath) {
    return "";
  }

  const { data } = getSupabase()
    .storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(storagePath);

  if (!data?.publicUrl) {
    return "";
  }

  if (!cacheKey) {
    return data.publicUrl;
  }

  return `${data.publicUrl}${data.publicUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(cacheKey))}`;
}

export function getPhotoCardPublicUrl(storagePath, cacheKey = "") {
  if (!storagePath) {
    return "";
  }

  return getPhotoPublicUrl(getVariantStoragePath(storagePath, "card"), cacheKey);
}

export function getPhotoPreviewPublicUrl(storagePath, cacheKey = "") {
  if (!storagePath) {
    return "";
  }

  return getPhotoPublicUrl(getVariantStoragePath(storagePath, "preview"), cacheKey);
}

// Derives a variant's file path from the full-size photo's storage_path
// (the only path trip_photos actually stores) by inserting a size suffix
// before the extension — e.g. ".../1234.jpg" -> ".../1234-360x240.jpg".
function getVariantStoragePath(storagePath, variant) {
  const suffix = PHOTO_VARIANT_SUFFIXES[variant];

  if (!suffix) {
    return storagePath;
  }

  return storagePath.replace(/(\.[^./]+)$/, `${suffix}$1`);
}

async function insertPrimaryPhotoRecord({ tripId, baseId, storagePath }) {
  const normalizedBaseId = baseId || null;
  const { data, error } = await getSupabase()
    .from("trip_photos")
    .insert({
      id: crypto.randomUUID(),
      trip_id: tripId,
      base_id: normalizedBaseId,
      day_id: null,
      item_id: null,
      source: "upload",
      storage_path: storagePath,
      unsplash_id: null,
      unsplash_url: null,
      credit_name: null,
      credit_url: null,
      is_primary: true,
      sort_order: 0,
    })
    .select(PHOTO_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return withPublicUrl(data);
}

async function uploadPhotoVariants({ storagePath, photo, upsert }) {
  const results = await Promise.all(
    Object.keys(PHOTO_VARIANT_SUFFIXES).map((variant) =>
      getSupabase()
        .storage
        .from(PHOTO_BUCKET)
        .upload(getVariantStoragePath(storagePath, variant), photo[variant], {
          contentType: "image/jpeg",
          upsert,
        })
    )
  );

  const failed = results.find((result) => result.error);

  if (failed) {
    throw failed.error;
  }
}

async function removePhotoVariants(storagePath) {
  if (!storagePath) {
    return;
  }

  const paths = Object.keys(PHOTO_VARIANT_SUFFIXES).map((variant) => getVariantStoragePath(storagePath, variant));

  const { error } = await getSupabase()
    .storage
    .from(PHOTO_BUCKET)
    .remove(paths);

  if (error) {
    throw error;
  }
}

function withPublicUrl(photo) {
  if (!photo) {
    return null;
  }

  const cacheKey = photo.updated_at || photo.id;

  return {
    ...photo,
    public_url: getPhotoPublicUrl(photo.storage_path, cacheKey),
    preview_url: getPhotoPreviewPublicUrl(photo.storage_path, cacheKey),
    card_url: getPhotoCardPublicUrl(photo.storage_path, cacheKey),
  };
}
