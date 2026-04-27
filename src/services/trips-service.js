import {
  DEFAULT_BASE_TIMEZONE,
  ITEM_STATUSES,
} from "../config/constants.js";
import { getSupabase } from "../lib/supabase.js";
import { getPhotoPublicUrl } from "./photos-service.js";

const TRIP_ITEM_SELECT = `
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
  check_out_date,
  created_at,
  updated_at
`;

function normalizeNullableId(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue === "" ? null : normalizedValue;
}

async function attachPrimaryTripHeroPhotos(trips) {
  if (!Array.isArray(trips) || trips.length === 0) {
    return trips;
  }

  const tripIds = trips.map((trip) => trip.id).filter(Boolean);

  if (tripIds.length === 0) {
    return trips;
  }

  const { data, error } = await getSupabase()
    .from("trip_photos")
    .select("id, trip_id, base_id, storage_path, is_primary, sort_order, updated_at")
    .in("trip_id", tripIds)
    .eq("is_primary", true)
    .is("base_id", null)
    .is("day_id", null)
    .is("item_id", null)
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  const photosByTripId = new Map((data || []).map((photo) => [photo.trip_id, photo]));

  return trips.map((trip) => {
    const photo = photosByTripId.get(trip.id) || null;
    const publicUrl = photo ? getPhotoPublicUrl(photo.storage_path, photo.updated_at || photo.id) : "";

    return {
      ...trip,
      hero_photo_url: publicUrl,
      hero_photo: photo ? { ...photo, public_url: publicUrl } : null,
    };
  });
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
        trips!inner (
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

  const trips = (data || [])
    .filter((row) => row?.trips?.id)
    .map((row) => ({
      ...row.trips,
      membership_role: row.role,
    }));

  return attachPrimaryTripHeroPhotos(trips);
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
        name: title,
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

  const [tripResult, basesResult, daysResult, itemsResult, photosResult] = await Promise.all([
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
      .select(TRIP_ITEM_SELECT)
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_photos")
      .select("id, trip_id, base_id, storage_path, is_primary, sort_order, updated_at")
      .eq("trip_id", tripId)
      .eq("is_primary", true)
      .is("day_id", null)
      .is("item_id", null)
      .order("updated_at", { ascending: false }),
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

  if (photosResult.error) {
    throw photosResult.error;
  }

  const photos = photosResult.data || [];
  const tripHeroPhoto = photos.find((photo) => !photo.base_id) || null;
  const baseHeroPhotoByBaseId = new Map(
    photos
      .filter((photo) => photo.base_id)
      .map((photo) => [photo.base_id, photo])
  );
  const tripHeroPublicUrl = tripHeroPhoto ? getPhotoPublicUrl(tripHeroPhoto.storage_path, tripHeroPhoto.updated_at || tripHeroPhoto.id) : "";

  return {
    trip: {
      ...tripResult.data,
      hero_photo_url: tripHeroPublicUrl,
      hero_photo: tripHeroPhoto ? { ...tripHeroPhoto, public_url: tripHeroPublicUrl } : null,
    },
    bases: (basesResult.data || []).map((base) => {
      const photo = baseHeroPhotoByBaseId.get(base.id) || null;
      const publicUrl = photo ? getPhotoPublicUrl(photo.storage_path, photo.updated_at || photo.id) : "";

      return {
        ...base,
        hero_photo_url: publicUrl,
        hero_photo: photo ? { ...photo, public_url: publicUrl } : null,
      };
    }),
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
  notes,
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
  const { data, error } = await getSupabase()
    .from("trip_items")
    .upsert(
      itemUpdates.map((item) => ({
        ...item,
        updated_at: item.updated_at || now,
      })),
      {
        onConflict: "id",
      }
    )
    .is("deleted_at", null)
    .select(TRIP_ITEM_SELECT);

  if (error) {
    throw error;
  }

  return data || [];
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

export async function softDeleteTripBase(baseId) {
  const { error } = await getSupabase().rpc("soft_delete_trip_base", {
    p_base_id: baseId,
  });

  if (error) {
    if (error.message === "BASE_HAS_ASSIGNED_DAYS") {
      throw new Error("BASE_HAS_ASSIGNED_DAYS");
    }

    throw error;
  }
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
  const groupedDayIds = new Map();
  const savedDays = [];

  for (const { dayNumber, toBaseId } of allocations) {
    const existingDay = activeDayMap.get(dayNumber);

    if (!existingDay) {
      throw new Error(`Could not find Day ${dayNumber}.`);
    }

    const normalizedBaseId = normalizeNullableId(toBaseId);
    const groupKey = normalizedBaseId ?? "__unassigned__";
    const existingGroup = groupedDayIds.get(groupKey);

    if (existingGroup) {
      existingGroup.ids.push(existingDay.id);
      continue;
    }

    groupedDayIds.set(groupKey, {
      baseId: normalizedBaseId,
      ids: [existingDay.id],
    });
  }

  for (const { baseId, ids } of groupedDayIds.values()) {
    const { data, error } = await supabase
      .from("trip_days")
      .update({
        base_id: baseId,
        updated_at: now,
      })
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .in("id", ids)
      .select("id, trip_id, base_id, day_number, title, location_name, journal_notes, sort_order");

    if (error) {
      throw error;
    }

    if (data?.length) {
      savedDays.push(...data);
    }
  }

  return savedDays;
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

export async function softDeleteTrip(tripId) {
  const { error } = await getSupabase().rpc("soft_delete_trip_cascade", {
    p_trip_id: tripId,
  });

  if (error) {
    throw error;
  }
}
