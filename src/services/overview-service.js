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
      subtitle: subtitle || null,
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
      subtitle: subtitle || null,
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

export async function reorderOverviewBlocks(updates) {
  if (!Array.isArray(updates) || updates.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const supabase = getSupabase();

  return Promise.all(
    updates.map(async ({ id, sortOrder }) => {
      const { data, error } = await supabase
        .from("trip_overview_blocks")
        .update({
          sort_order: sortOrder,
          updated_at: now,
        })
        .eq("id", id)
        .select(OVERVIEW_BLOCK_SELECT)
        .single();

      if (error) {
        throw error;
      }

      return data;
    })
  );
}

// Copies overview blocks onto a new trip, skipping any category in
// excludeCategories. baseIdMap maps old base_id -> new base_id for bases
// being carried over; a base-scoped block is skipped if its base wasn't.
export async function duplicateOverviewBlocksForNewTrip({
  sourceTripId,
  newTripId,
  ownerId,
  baseIdMap,
  excludeCategories = [],
}) {
  const supabase = getSupabase();

  const { data: sourceBlocks, error } = await supabase
    .from("trip_overview_blocks")
    .select(OVERVIEW_BLOCK_SELECT)
    .eq("trip_id", sourceTripId)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  const blocksToCopy = (sourceBlocks || []).filter((block) => {
    if (excludeCategories.includes(block.category)) {
      return false;
    }
    return !block.base_id || baseIdMap.get(block.base_id);
  });

  if (blocksToCopy.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const insertPayload = blocksToCopy.map((block) => ({
    id: crypto.randomUUID(),
    trip_id: newTripId,
    base_id: block.base_id ? baseIdMap.get(block.base_id) : null,
    category: block.category,
    subtitle: block.subtitle,
    body: block.body,
    sort_order: block.sort_order,
    is_published: block.is_published,
    source: block.source,
    created_by: ownerId,
    created_at: now,
    updated_at: now,
  }));

  const { error: insertError } = await supabase.from("trip_overview_blocks").insert(insertPayload);

  if (insertError) {
    throw insertError;
  }
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
