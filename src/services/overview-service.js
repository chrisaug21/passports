import { OVERVIEW_CATEGORIES } from "../config/constants.js";
import { getSupabase } from "../lib/supabase.js";

const OVERVIEW_BLOCK_SELECT = `
  id,
  trip_id,
  base_id,
  category,
  subtitle,
  body,
  sort_order,
  is_published,
  source,
  created_by,
  created_at,
  updated_at
`;

export async function fetchTripOverviewBlocks(tripId) {
  const { data, error } = await getSupabase()
    .from("trip_overview_blocks")
    .select(OVERVIEW_BLOCK_SELECT)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createOverviewBlock({
  tripId,
  baseId,
  category,
  subtitle,
  body,
  sortOrder,
  isPublished,
  createdBy,
  source = "human",
}) {
  const normalizedCategory = String(category || "").trim();

  if (!OVERVIEW_CATEGORIES.includes(normalizedCategory)) {
    throw new Error("Please choose a valid category.");
  }

  const now = new Date().toISOString();

  const { data, error } = await getSupabase()
    .from("trip_overview_blocks")
    .insert({
      id: crypto.randomUUID(),
      trip_id: tripId,
      base_id: baseId || null,
      category: normalizedCategory,
      subtitle,
      body: body || "",
      sort_order: sortOrder,
      is_published: Boolean(isPublished),
      source,
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    })
    .select(OVERVIEW_BLOCK_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateOverviewBlock({
  blockId,
  category,
  subtitle,
  body,
  isPublished,
}) {
  const normalizedCategory = String(category || "").trim();

  if (!OVERVIEW_CATEGORIES.includes(normalizedCategory)) {
    throw new Error("Please choose a valid category.");
  }

  const { data, error } = await getSupabase()
    .from("trip_overview_blocks")
    .update({
      category: normalizedCategory,
      subtitle,
      body: body || "",
      is_published: Boolean(isPublished),
      updated_at: new Date().toISOString(),
    })
    .eq("id", blockId)
    .select(OVERVIEW_BLOCK_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function softDeleteOverviewBlock(blockId) {
  const { error } = await getSupabase()
    .from("trip_overview_blocks")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", blockId);

  if (error) {
    throw error;
  }
}
