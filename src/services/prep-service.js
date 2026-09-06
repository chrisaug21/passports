import { getSupabase } from "../lib/supabase.js";

const TODO_SELECT = `
  id,
  trip_id,
  item_id,
  title,
  section,
  due_phase,
  is_complete,
  notes,
  source_suggestion,
  created_at,
  updated_at
`;

export async function createTripTodo({ tripId, title, section, sourceSuggestion }) {
  const normalizedTitle = String(title || "").trim();

  if (!normalizedTitle) {
    throw new Error("Please add a title.");
  }

  const now = new Date().toISOString();

  const { data, error } = await getSupabase()
    .from("trip_todos")
    .insert({
      id: crypto.randomUUID(),
      trip_id: tripId,
      title: normalizedTitle,
      section: section || null,
      source_suggestion: sourceSuggestion || null,
      created_at: now,
      updated_at: now,
    })
    .select(TODO_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateTripTodo({ todoId, title, section }) {
  const normalizedTitle = String(title || "").trim();

  if (!normalizedTitle) {
    throw new Error("Please add a title.");
  }

  const { data, error } = await getSupabase()
    .from("trip_todos")
    .update({
      title: normalizedTitle,
      section: section || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", todoId)
    .select(TODO_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function setTripTodoComplete({ todoId, isComplete }) {
  const { data, error } = await getSupabase()
    .from("trip_todos")
    .update({
      is_complete: Boolean(isComplete),
      updated_at: new Date().toISOString(),
    })
    .eq("id", todoId)
    .select(TODO_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function softDeleteTripTodo(todoId) {
  const { error } = await getSupabase()
    .from("trip_todos")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", todoId);

  if (error) {
    throw error;
  }
}
