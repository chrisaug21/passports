import { getSupabase } from "../lib/supabase.js";

export const PHOTO_BUCKET = "trip-photos";
export const PHOTO_CONTEXTS = {
  tripHero: "trip-hero",
  baseHero: "base-hero",
};

const PHOTO_SELECT = "id, trip_id, base_id, storage_path, is_primary, sort_order, updated_at";

export async function saveUploadedPrimaryPhoto({
  userId,
  tripId,
  baseId = null,
  context,
  blob,
}) {
  if (!userId || !tripId || !context || !blob) {
    throw new Error("Missing photo upload details.");
  }

  const existingPhoto = await getPrimaryPhotoForSlot({ tripId, baseId });

  const storagePath = `${userId}/${tripId}/${context}/${Date.now()}.jpg`;
  await uploadPhotoBlob({ storagePath, blob, upsert: false });

  // Remove the old DB row before inserting the new one — the trip_photos
  // unique constraint (one row per trip/base slot) blocks INSERT while the
  // old row is still present.
  if (existingPhoto) {
    const { error: deleteError } = await getSupabase()
      .from("trip_photos")
      .delete()
      .eq("id", existingPhoto.id);
    if (deleteError) {
      await removeStorageFile(storagePath).catch(() => {});
      throw deleteError;
    }
  }

  let newPhoto;
  try {
    newPhoto = await insertPrimaryPhotoRecord({ tripId, baseId, storagePath });
  } catch (error) {
    await removeStorageFile(storagePath).catch(() => {});
    throw error;
  }

  // Old storage file deleted only after DB update succeeds — best-effort cleanup.
  if (existingPhoto) {
    await removeStorageFile(existingPhoto.storage_path).catch((err) => {
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
  blob,
}) {
  return saveUploadedPrimaryPhoto({
    userId,
    tripId,
    baseId,
    context,
    blob,
  });
}

export async function recropExistingPrimaryPhoto({ photoId, storagePath, blob }) {
  if (!photoId || !storagePath || !blob) {
    throw new Error("Missing photo update details.");
  }

  await uploadPhotoBlob({
    storagePath,
    blob,
    upsert: true,
  });

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

  await removeStorageFile(existingPhoto.storage_path);

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

        const { error: copyError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .copy(photo.storage_path, newStoragePath);

        if (copyError) {
          throw copyError;
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

async function uploadPhotoBlob({ storagePath, blob, upsert }) {
  const { error } = await getSupabase()
    .storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, blob, {
      contentType: "image/jpeg",
      upsert,
    });

  if (error) {
    throw error;
  }
}

async function removeStorageFile(storagePath) {
  if (!storagePath) {
    return;
  }

  const { error } = await getSupabase()
    .storage
    .from(PHOTO_BUCKET)
    .remove([storagePath]);

  if (error) {
    throw error;
  }
}

function withPublicUrl(photo) {
  if (!photo) {
    return null;
  }

  return {
    ...photo,
    public_url: getPhotoPublicUrl(photo.storage_path, photo.updated_at || photo.id),
  };
}
