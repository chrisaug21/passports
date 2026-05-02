import { getSupabase } from "../lib/supabase.js";

const JOURNAL_ENTRY_SELECT = "id, trip_id, user_id, day_id, item_id, notes, created_at, updated_at";
const JOURNAL_PHOTO_SELECT = "id, trip_id, user_id, item_id, storage_path, public_url, created_at, updated_at";
const USER_PROFILE_SELECT = "id, first_name, last_name, updated_at";
const JOURNAL_ITEM_STATE_SELECT = "id, is_done, done_by, done_at";

export const JOURNAL_PHOTO_BUCKET = "journal-photos";
export const JOURNAL_PHOTO_MAX_PX = 1200;
export const JOURNAL_PHOTO_QUALITY = 0.82;

// ---------------------------------------------------------------------------
// Fetch all journal data for a trip (entries, photos, profiles)
// ---------------------------------------------------------------------------

export async function fetchJournalData(tripId, memberUserIds, doneUserIds = []) {
  const supabase = getSupabase();

  const [entriesResult, photosResult] = await Promise.all([
    supabase
      .from("journal_entries")
      .select(JOURNAL_ENTRY_SELECT)
      .eq("trip_id", tripId)
      .is("deleted_at", null),
    supabase
      .from("journal_item_photos")
      .select(JOURNAL_PHOTO_SELECT)
      .eq("trip_id", tripId)
      .is("deleted_at", null),
  ]);

  if (entriesResult.error) throw entriesResult.error;
  if (photosResult.error) throw photosResult.error;

  const authorUserIds = new Set(memberUserIds);
  doneUserIds.forEach((userId) => authorUserIds.add(userId));
  (entriesResult.data || []).forEach((entry) => authorUserIds.add(entry.user_id));
  (photosResult.data || []).forEach((photo) => authorUserIds.add(photo.user_id));

  const profileQuery = authorUserIds.size > 0
    ? supabase.from("user_profiles").select(USER_PROFILE_SELECT).in("id", [...authorUserIds])
    : Promise.resolve({ data: [], error: null });

  const profilesResult = await profileQuery;
  if (profilesResult.error) throw profilesResult.error;

  return {
    entries: entriesResult.data || [],
    photos: photosResult.data || [],
    profiles: profilesResult.data || [],
  };
}

export async function fetchJournalRefreshData(tripId, memberUserIds, doneUserIds = []) {
  const supabase = getSupabase();
  const [journalData, itemStatesResult] = await Promise.all([
    fetchJournalData(tripId, memberUserIds, doneUserIds),
    supabase
      .from("trip_items")
      .select(JOURNAL_ITEM_STATE_SELECT)
      .eq("trip_id", tripId)
      .is("deleted_at", null),
  ]);

  if (itemStatesResult.error) {
    throw itemStatesResult.error;
  }

  return {
    ...journalData,
    itemStates: itemStatesResult.data || [],
  };
}

// ---------------------------------------------------------------------------
// Journal entries
// ---------------------------------------------------------------------------

export async function upsertJournalEntry({ existingId, tripId, userId, dayId, itemId, notes }) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const payload = {
    id: existingId || crypto.randomUUID(),
    trip_id: tripId,
    user_id: userId,
    day_id: dayId || null,
    item_id: itemId || null,
    notes,
    updated_at: now,
    deleted_at: null,
  };

  if (!existingId) {
    payload.created_at = now;
  }

  const { data, error } = await supabase
    .from("journal_entries")
    .upsert(
      payload,
      { onConflict: itemId ? "user_id,item_id" : "user_id,day_id" }
    )
    .select(JOURNAL_ENTRY_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function softDeleteJournalEntry(entryId) {
  const { error } = await getSupabase()
    .from("journal_entries")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", entryId);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Journal item photos
// ---------------------------------------------------------------------------

export async function uploadJournalPhoto({ tripId, userId, itemId, blob }) {
  const storagePath = `${userId}/${tripId}/${itemId}/${Date.now()}.jpg`;

  const { error: uploadError } = await getSupabase()
    .storage
    .from(JOURNAL_PHOTO_BUCKET)
    .upload(storagePath, blob, { contentType: "image/jpeg", upsert: false });

  if (uploadError) throw uploadError;

  const { data: urlData } = getSupabase()
    .storage
    .from(JOURNAL_PHOTO_BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = urlData?.publicUrl || "";
  const now = new Date().toISOString();

  const { data, error: insertError } = await getSupabase()
    .from("journal_item_photos")
    .insert({
      id: crypto.randomUUID(),
      trip_id: tripId,
      user_id: userId,
      item_id: itemId,
      storage_path: storagePath,
      public_url: publicUrl,
      created_at: now,
      updated_at: now,
    })
    .select(JOURNAL_PHOTO_SELECT)
    .single();

  if (insertError) {
    await getSupabase().storage.from(JOURNAL_PHOTO_BUCKET).remove([storagePath]).catch(() => {});
    throw insertError;
  }

  return data;
}

export async function deleteJournalPhoto({ photoId, storagePath }) {
  const { error: storageError } = await getSupabase()
    .storage
    .from(JOURNAL_PHOTO_BUCKET)
    .remove([storagePath]);

  if (storageError) throw storageError;

  const { error: dbError } = await getSupabase()
    .from("journal_item_photos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", photoId);

  if (dbError) throw dbError;
}

// ---------------------------------------------------------------------------
// User profiles
// ---------------------------------------------------------------------------

export async function fetchUserProfile(userId) {
  const { data, error } = await getSupabase()
    .from("user_profiles")
    .select(USER_PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertUserProfile({ userId, firstName, lastName }) {
  const { data, error } = await getSupabase()
    .from("user_profiles")
    .upsert(
      {
        id: userId,
        first_name: firstName || null,
        last_name: lastName || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select(USER_PROFILE_SELECT)
    .single();

  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Item completion — mark done
// ---------------------------------------------------------------------------

export async function updateJournalItemCompletion({ itemId, isDone, doneBy, doneAt }) {
  const { data, error } = await getSupabase()
    .from("trip_items")
    .update({
      is_done: Boolean(isDone),
      done_by: isDone ? doneBy || null : null,
      done_at: isDone ? doneAt || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------
// Client-side image compression (resize to JOURNAL_PHOTO_MAX_PX, no crop)
// ---------------------------------------------------------------------------

export function compressJournalPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      const MAX = JOURNAL_PHOTO_MAX_PX;

      if (width > MAX || height > MAX) {
        if (width >= height) {
          height = Math.round((height / width) * MAX);
          width = MAX;
        } else {
          width = Math.round((width / height) * MAX);
          height = MAX;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not compress image."));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        JOURNAL_PHOTO_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image."));
    };

    img.src = objectUrl;
  });
}
