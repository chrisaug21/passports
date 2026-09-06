import { getSupabase } from "../lib/supabase.js";

const NOTE_SELECT = `
  id,
  trip_id,
  title,
  body,
  url,
  is_pinned,
  created_by,
  created_at,
  updated_at
`;

export async function fetchTripNotes(tripId) {
  const { data, error } = await getSupabase()
    .from("trip_notes")
    .select(NOTE_SELECT)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createTripNote({ tripId, title, body, url, createdBy }) {
  const normalizedTitle = String(title || "").trim();

  if (!normalizedTitle) {
    throw new Error("Please add a title.");
  }

  const now = new Date().toISOString();

  const { data, error } = await getSupabase()
    .from("trip_notes")
    .insert({
      id: crypto.randomUUID(),
      trip_id: tripId,
      title: normalizedTitle,
      body: body || "",
      url: url || null,
      is_pinned: false,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    })
    .select(NOTE_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateTripNote({ noteId, title, body, url }) {
  const normalizedTitle = String(title || "").trim();

  if (!normalizedTitle) {
    throw new Error("Please add a title.");
  }

  const { data, error } = await getSupabase()
    .from("trip_notes")
    .update({
      title: normalizedTitle,
      body: body || "",
      url: url || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select(NOTE_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function setTripNotePinned({ noteId, isPinned }) {
  const { data, error } = await getSupabase()
    .from("trip_notes")
    .update({
      is_pinned: Boolean(isPinned),
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId)
    .select(NOTE_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function softDeleteTripNote(noteId) {
  const { error } = await getSupabase()
    .from("trip_notes")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", noteId);

  if (error) {
    throw error;
  }
}
