import { DEFAULT_BASE_NAME, DEFAULT_BASE_TIMEZONE } from "../config/constants.js";
import { getSupabase } from "../lib/supabase.js";

export async function listTripsForCurrentUser(userId) {
  const { data, error } = await getSupabase()
    .from("trip_members")
    .select(
      `
        role,
        trips (
          id,
          owner_id,
          title,
          description,
          trip_length,
          start_date,
          status,
          is_public,
          cover_photo_url,
          created_at,
          updated_at,
          deleted_at
        )
      `
    )
    .eq("user_id", userId)
    .is("trips.deleted_at", null)
    .order("start_date", { ascending: true, foreignTable: "trips", nullsFirst: false })
    .order("created_at", { ascending: false, foreignTable: "trips" });

  if (error) {
    throw error;
  }

  return (data || [])
    .map((row) => ({
      ...row.trips,
      membership_role: row.role,
    }))
    .filter(Boolean);
}

export async function createTripWithDefaults({ ownerId, title, description, tripLength, startDate }) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const baseId = crypto.randomUUID();
  const tripInsertPayload = {
    owner_id: ownerId,
    title,
    description: description || null,
    trip_length: tripLength,
    start_date: startDate || null,
    status: "planning",
    is_public: false,
  };

  const { data: tripData, error: tripError } = await supabase
    .from("trips")
    .insert(tripInsertPayload)
    .select(
      `
        id,
        owner_id,
        title,
        description,
        trip_length,
        start_date,
        status,
        is_public,
        cover_photo_url,
        created_at,
        updated_at,
        deleted_at
      `
    )
    .single();

  if (tripError) {
    throw tripError;
  }

  const tripId = tripData.id;

  try {
    const { data: baseData, error: baseError } = await supabase
      .from("trip_bases")
      .insert({
        id: baseId,
        trip_id: tripId,
        name: DEFAULT_BASE_NAME,
        location_name: title,
        local_timezone: DEFAULT_BASE_TIMEZONE,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (baseError) {
      throw baseError;
    }

    const dayRows = Array.from({ length: tripLength }, (_value, index) => ({
      id: crypto.randomUUID(),
      trip_id: tripId,
      base_id: baseData.id,
      day_number: index + 1,
      sort_order: index,
      created_at: now,
      updated_at: now,
    }));

    const { error: dayError } = await supabase.from("trip_days").insert(dayRows);

    if (dayError) {
      throw dayError;
    }

    return {
      ...tripData,
      membership_role: "planner",
    };
  } catch (error) {
    await supabase
      .from("trips")
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq("id", tripId);

    throw error;
  }
}

export async function fetchTripDetailBundle(tripId) {
  const supabase = getSupabase();

  const [tripResult, basesResult, daysResult, itemsResult] = await Promise.all([
    supabase
      .from("trips")
      .select(
        `
          id,
          owner_id,
          title,
          description,
          trip_length,
          start_date,
          status,
          is_public,
          cover_photo_url,
          created_at,
          updated_at,
          deleted_at
        `
      )
      .eq("id", tripId)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("trip_bases")
      .select("id, trip_id, name, location_name, local_timezone, date_start, date_end, sort_order, notes")
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_days")
      .select("id, trip_id, base_id, day_number, title, location_name, journal_notes, sort_order")
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("day_number", { ascending: true }),
    supabase
      .from("trip_items")
      .select(
        `
          id,
          trip_id,
          base_id,
          day_id,
          created_by,
          title,
          item_type,
          status,
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
          sort_order,
          created_at,
          updated_at
        `
      )
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
  ]);

  if (tripResult.error) {
    throw tripResult.error;
  }

  if (basesResult.error) {
    throw basesResult.error;
  }

  if (daysResult.error) {
    throw daysResult.error;
  }

  if (itemsResult.error) {
    throw itemsResult.error;
  }

  return {
    trip: tripResult.data,
    bases: basesResult.data || [],
    days: daysResult.data || [],
    items: itemsResult.data || [],
  };
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
    .select(
      `
        id,
        trip_id,
        base_id,
        day_id,
        created_by,
        title,
        item_type,
        status,
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
        sort_order,
        created_at,
        updated_at
      `
    )
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
}) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("trip_items")
    .update({
      title,
      item_type: itemType,
      status,
      is_anchor: isAnchor,
      base_id: baseId || null,
      day_id: dayId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .select(
      `
        id,
        trip_id,
        base_id,
        day_id,
        created_by,
        title,
        item_type,
        status,
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
        sort_order,
        created_at,
        updated_at
      `
    )
    .single();

  if (error) {
    throw error;
  }

  return data;
}
