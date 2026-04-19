import { DEFAULT_BASE_NAME, DEFAULT_BASE_TIMEZONE, ITEM_STATUSES } from "../config/constants.js";
import { getSupabase } from "../lib/supabase.js";

function normalizeNullableId(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue === "" ? null : normalizedValue;
}

function getValidatedTimezone(value) {
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedValue) {
    return DEFAULT_BASE_TIMEZONE;
  }

  if (typeof Intl?.supportedValuesOf === "function") {
    try {
      const supportedTimezones = Intl.supportedValuesOf("timeZone");
      return supportedTimezones.includes(normalizedValue) ? normalizedValue : DEFAULT_BASE_TIMEZONE;
    } catch (_error) {
      // Fall through to the formatter-based validation below.
    }
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: normalizedValue });
    return formatter.resolvedOptions().timeZone ? normalizedValue : DEFAULT_BASE_TIMEZONE;
  } catch (_error) {
    return DEFAULT_BASE_TIMEZONE;
  }
}

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
      .select("id, trip_id, name, location_name, local_timezone, sort_order, notes")
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
}) {
  const supabase = getSupabase();
  const normalizedStatus = String(status || "").trim();

  if (!ITEM_STATUSES.includes(normalizedStatus)) {
    throw new Error("Please choose a valid item status.");
  }

  const { data, error } = await supabase
    .from("trip_items")
    .update({
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
      time_is_estimated: Boolean(timeIsEstimated),
      cost_low: costLow === "" ? null : costLow,
      cost_high: costHigh === "" ? null : costHigh,
      url: url || null,
      notes: notes || null,
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

export async function updateTripSettings({
  tripId,
  title,
  description,
  startDate,
  tripLength,
}) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data: existingDays, error: existingDaysError } = await supabase
    .from("trip_days")
    .select("id, base_id, day_number, sort_order")
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("day_number", { ascending: true });

  if (existingDaysError) {
    throw existingDaysError;
  }

  const activeDays = existingDays || [];
  const currentTripLength = activeDays.length;

  if (tripLength < currentTripLength) {
    const { error: shrinkError } = await supabase.rpc("shrink_trip_length", {
      p_trip_id: tripId,
      p_new_length: tripLength,
    });

    if (shrinkError) {
      throw shrinkError;
    }
  }

  if (tripLength > currentTripLength) {
    const lastActiveDay = activeDays[activeDays.length - 1] || null;
    const fallbackBaseId = lastActiveDay?.base_id || null;

    const insertedDays = Array.from({ length: tripLength - currentTripLength }, (_value, index) => ({
      id: crypto.randomUUID(),
      trip_id: tripId,
      base_id: fallbackBaseId,
      day_number: currentTripLength + index + 1,
      sort_order: currentTripLength + index,
      created_at: now,
      updated_at: now,
    }));

    const { error: insertDaysError } = await supabase
      .from("trip_days")
      .insert(insertedDays);

    if (insertDaysError) {
      throw insertDaysError;
    }
  }

  const { data, error } = await supabase
    .from("trips")
    .update({
      title,
      description: description || null,
      start_date: startDate || null,
      trip_length: tripLength,
      updated_at: now,
    })
    .eq("id", tripId)
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

  if (error) {
    throw error;
  }

  return data;
}

export async function createTripBase({
  tripId,
  name,
  locationName,
  localTimezone,
  sortOrder,
}) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const validatedTimezone = getValidatedTimezone(localTimezone);

  const { data, error } = await supabase
    .from("trip_bases")
    .insert({
      id: crypto.randomUUID(),
      trip_id: tripId,
      name,
      location_name: locationName || null,
      local_timezone: validatedTimezone,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
    })
    .select("id, trip_id, name, location_name, local_timezone, sort_order, notes")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateTripBase({
  baseId,
  name,
  locationName,
  localTimezone,
}) {
  const supabase = getSupabase();
  const validatedTimezone = getValidatedTimezone(localTimezone);

  const { data, error } = await supabase
    .from("trip_bases")
    .update({
      name,
      location_name: locationName || null,
      local_timezone: validatedTimezone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", baseId)
    .select("id, trip_id, name, location_name, local_timezone, sort_order, notes")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchActiveTripDaysForAllocation(tripId) {
  const { data, error } = await getSupabase()
    .from("trip_days")
    .select("id, trip_id, base_id, day_number, title, location_name, journal_notes, sort_order, created_at")
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("day_number", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function saveTripDayAllocations({ tripId, allocations }) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return [];
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();
  const activeDays = await fetchActiveTripDaysForAllocation(tripId);
  const activeDayMap = new Map(activeDays.map((day) => [day.day_number, day]));

  const rowsToSave = allocations.map(({ dayNumber, toBaseId }) => {
    const existingDay = activeDayMap.get(dayNumber);

    if (!existingDay) {
      throw new Error(`Could not find Day ${dayNumber}.`);
    }

    return {
      id: existingDay.id,
      trip_id: existingDay.trip_id,
      base_id: normalizeNullableId(toBaseId),
      day_number: existingDay.day_number,
      title: existingDay.title || null,
      location_name: existingDay.location_name || null,
      journal_notes: existingDay.journal_notes || null,
      sort_order: existingDay.sort_order,
      created_at: existingDay.created_at,
      updated_at: now,
    };
  });

  const { data, error } = await supabase
    .from("trip_days")
    .upsert(rowsToSave, { onConflict: "id" })
    .select("id, trip_id, base_id, day_number, title, location_name, journal_notes, sort_order");

  if (error) {
    throw error;
  }

  return data || [];
}

export async function reallocateDay(tripId, fromBaseId, toBaseId, dayNumber) {
  return saveTripDayAllocations({
    tripId,
    allocations: [
      {
        dayNumber,
        fromBaseId,
        toBaseId,
      },
    ],
  });
}
