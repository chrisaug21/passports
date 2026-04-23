import { getSupabase } from "../lib/supabase.js";

export const PHOTO_BUCKET = "trip-photos";
export const PHOTO_CONTEXTS = {
  tripHero: "trip-hero",
  baseHero: "base-hero",
};

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

  const supabase = getSupabase();
  const storagePath = `${userId}/${tripId}/${context}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase
    .storage
    .from(PHOTO_BUCKET)
    .upload(storagePath, blob, {
      contentType: "image/jpeg",
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const normalizedBaseId = baseId || null;
  let existingPrimaryQuery = supabase
    .from("trip_photos")
    .update({
      is_primary: false,
    })
    .eq("trip_id", tripId)
    .eq("is_primary", true)
    .is("day_id", null)
    .is("item_id", null);

  existingPrimaryQuery = normalizedBaseId
    ? existingPrimaryQuery.eq("base_id", normalizedBaseId)
    : existingPrimaryQuery.is("base_id", null);

  const { error: updateError } = await existingPrimaryQuery;

  if (updateError) {
    throw updateError;
  }

  const { data, error: insertError } = await supabase
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
    .select("id, trip_id, base_id, storage_path, is_primary, sort_order")
    .single();

  if (insertError) {
    throw insertError;
  }

  return {
    ...data,
    public_url: getPhotoPublicUrl(data.storage_path),
  };
}

export function getPhotoPublicUrl(storagePath) {
  if (!storagePath) {
    return "";
  }

  const { data } = getSupabase()
    .storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(storagePath);

  return data?.publicUrl || "";
}
