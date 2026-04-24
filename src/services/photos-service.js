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

  await removePrimaryPhotoForSlot({ tripId, baseId });

  const storagePath = `${userId}/${tripId}/${context}/${Date.now()}.jpg`;
  await uploadPhotoBlob({ storagePath, blob, upsert: false });

  try {
    return await insertPrimaryPhotoRecord({
      tripId,
      baseId,
      storagePath,
    });
  } catch (error) {
    await removeStorageFile(storagePath).catch(() => {});
    throw error;
  }
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

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return withPublicUrl(data);
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
