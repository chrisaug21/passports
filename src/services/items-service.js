import { ITEM_STATUSES } from "../config/constants.js";
import { getSupabase } from "../lib/supabase.js";

export const TRIP_ITEM_SELECT = `
  id,
  trip_id,
  base_id,
  day_id,
  created_by,
  title,
  item_type,
  status,
  is_done,
  done_by,
  done_at,
  is_anchor,
  meal_slot,
  activity_type,
  transport_mode,
  transport_origin,
  transport_destination,
  time_start,
  time_end,
  time_is_estimated,
  cost_low,
  cost_high,
  confirmation_ref,
  url,
  notes,
  address,
  sort_order,
  check_out_date,
  created_at,
  updated_at
`;

function normalizeNullableId(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue === "" ? null : normalizedValue;
}

export async function createTripItem({ tripId, createdBy, title, itemType, sortOrder }) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("trip_items")
    .insert({
      id: crypto.randomUUID(),
      trip_id: tripId,
      base_id: null,
      day_id: null,
      created_by: createdBy,
      title,
      item_type: itemType,
      status: "idea",
      is_anchor: false,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
    })
    .select(TRIP_ITEM_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createDetailedTripItem({
  tripId,
  createdBy,
  title,
  itemType,
  status,
  isAnchor,
  baseId,
  dayId,
  checkOutDate,
  mealSlot,
  activityType,
  transportMode,
  transportOrigin,
  transportDestination,
  timeStart,
  timeEnd,
  costLow,
  costHigh,
  url,
  confirmationRef,
  notes,
  address,
  sortOrder,
}) {
  const normalizedStatus = String(status || "idea").trim();

  if (!ITEM_STATUSES.includes(normalizedStatus)) {
    throw new Error("Please choose a valid item status.");
  }

  const { data, error } = await getSupabase()
    .from("trip_items")
    .insert({
      id: crypto.randomUUID(),
      trip_id: tripId,
      base_id: normalizeNullableId(baseId),
      day_id: normalizeNullableId(dayId),
      created_by: createdBy,
      title,
      item_type: itemType,
      status: normalizedStatus,
      is_anchor: Boolean(isAnchor),
      check_out_date: checkOutDate || null,
      meal_slot: mealSlot || null,
      activity_type: activityType || null,
      transport_mode: transportMode || null,
      transport_origin: transportOrigin || null,
      transport_destination: transportDestination || null,
      time_start: timeStart || null,
      time_end: timeEnd || null,
      cost_low: costLow === "" ? null : costLow,
      cost_high: costHigh === "" ? null : costHigh,
      url: url || null,
      confirmation_ref: confirmationRef || null,
      notes: notes || null,
      address: address || null,
      sort_order: sortOrder,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(TRIP_ITEM_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateTripItem({
  itemId,
  title,
  itemType,
  status,
  isAnchor,
  baseId,
  dayId,
  mealSlot,
  activityType,
  transportMode,
  transportOrigin,
  transportDestination,
  timeStart,
  timeEnd,
  timeIsEstimated,
  costLow,
  costHigh,
  url,
  notes,
  address,
}) {
  const supabase = getSupabase();
  const normalizedStatus = String(status || "").trim();

  if (!ITEM_STATUSES.includes(normalizedStatus)) {
    throw new Error("Please choose a valid item status.");
  }

  const updatePayload = {
    title,
    item_type: itemType,
    status: normalizedStatus,
    is_anchor: isAnchor,
    base_id: normalizeNullableId(baseId),
    day_id: normalizeNullableId(dayId),
    meal_slot: mealSlot || null,
    activity_type: activityType || null,
    transport_mode: transportMode || null,
    transport_origin: transportOrigin || null,
    transport_destination: transportDestination || null,
    time_start: timeStart || null,
    time_end: timeEnd || null,
    cost_low: costLow === "" ? null : costLow,
    cost_high: costHigh === "" ? null : costHigh,
    url: url || null,
    notes: notes || null,
    address: address || null,
    updated_at: new Date().toISOString(),
  };

  if (timeIsEstimated !== undefined) {
    updatePayload.time_is_estimated = Boolean(timeIsEstimated);
  }

  const { data, error } = await supabase
    .from("trip_items")
    .update(updatePayload)
    .eq("id", itemId)
    .select(TRIP_ITEM_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function batchUpdateTripItems(itemUpdates) {
  if (!Array.isArray(itemUpdates) || itemUpdates.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const supabase = getSupabase();

  return Promise.all(
    itemUpdates.map(async (item) => {
      const { data, error } = await supabase
        .from("trip_items")
        .update({
          title: item.title,
          item_type: item.item_type,
          status: item.status,
          is_done: Boolean(item.is_done),
          done_by: item.done_by || null,
          done_at: item.done_at || null,
          is_anchor: item.is_anchor,
          base_id: item.base_id,
          day_id: item.day_id,
          meal_slot: item.meal_slot,
          activity_type: item.activity_type,
          transport_mode: item.transport_mode,
          transport_origin: item.transport_origin,
          transport_destination: item.transport_destination,
          time_start: item.time_start,
          time_end: item.time_end,
          time_is_estimated: item.time_is_estimated,
          cost_low: item.cost_low,
          cost_high: item.cost_high,
          confirmation_ref: item.confirmation_ref,
          url: item.url,
          notes: item.notes,
          address: item.address,
          sort_order: item.sort_order,
          check_out_date: item.check_out_date,
          updated_at: now,
        })
        .eq("id", item.id)
        .select(TRIP_ITEM_SELECT)
        .single();

      if (error) {
        throw error;
      }

      return data;
    })
  );
}

export async function softDeleteTripItem(itemId) {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("trip_items")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) {
    throw error;
  }
}
