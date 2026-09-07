import { DEFAULT_BASE_TIMEZONE } from "../config/constants.js";
import { getSupabase } from "../lib/supabase.js";
import { deriveTripStatus } from "../lib/derive.js";
import { duplicatePrimaryPhotosForNewTrip, getPhotoPublicUrl } from "./photos-service.js";
import { duplicateOverviewBlocksForNewTrip } from "./overview-service.js";
import { TRIP_ITEM_SELECT } from "./items-service.js";

const TRIP_ROW_SELECT = `
  id,
  owner_id,
  title,
  description,
  trip_length,
  start_date,
  target_year,
  target_month,
  sort_order,
  status,
  is_public,
  cover_photo_url,
  created_at,
  updated_at,
  deleted_at
`;

// Corrects trips.status against what the trip's dates say it should be,
// writing any corrections back to the database. Never touches "destinations"
// -- the one genuinely manual, dateless state (see passports-destinations-spec.md,
// "Phase 0"). "done" is NOT protected: nothing in the app sets it manually
// today, it's just as date-derived as planning/active, so editing a done
// trip's dates back into the future should bring it back out of done too.
// Returns the trips with corrected status values applied, without waiting
// for the writes to land.
async function reconcileTripStatuses(trips, today = new Date()) {
  if (!Array.isArray(trips) || trips.length === 0) {
    return trips;
  }

  const supabase = getSupabase();
  const corrections = [];

  const reconciled = trips.map((trip) => {
    if (trip.status === "destinations") {
      return trip;
    }

    const expectedStatus = deriveTripStatus(trip, today);

    if (expectedStatus === trip.status) {
      return trip;
    }

    corrections.push({ id: trip.id, status: expectedStatus });
    return { ...trip, status: expectedStatus };
  });

  if (corrections.length > 0) {
    const now = new Date().toISOString();

    await Promise.all(
      corrections.map(async ({ id, status }) => {
        const { error } = await supabase
          .from("trips")
          .update({ status, updated_at: now })
          .eq("id", id);

        if (error) {
          console.error("Failed to correct trip status:", error);
        }
      })
    );
  }

  return reconciled;
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
          target_year,
          target_month,
          sort_order,
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

  const reconciledTrips = await reconcileTripStatuses(trips);

  return attachPrimaryTripHeroPhotos(reconciledTrips);
}

// Splits tripLength days as evenly as possible across baseDefs (in order),
// handing the first `tripLength % baseCount` bases one extra day each.
async function insertTripBasesAndDays(supabase, { tripId, tripLength, baseDefs }) {
  const now = new Date().toISOString();

  const baseRows = baseDefs.map((def, index) => ({
    id: def.id || crypto.randomUUID(),
    trip_id: tripId,
    name: def.name,
    location_name: def.locationName || null,
    local_timezone: def.localTimezone || DEFAULT_BASE_TIMEZONE,
    sort_order: index,
    created_at: now,
    updated_at: now,
  }));

  const { error: baseError } = await supabase.from("trip_bases").insert(baseRows);

  if (baseError) {
    throw baseError;
  }

  const baseCount = baseRows.length;
  const dayRows = [];
  let dayNumber = 1;

  baseRows.forEach((base, index) => {
    const dayCount = Math.floor(tripLength / baseCount) + (index < tripLength % baseCount ? 1 : 0);

    for (let i = 0; i < dayCount; i += 1) {
      dayRows.push({
        id: crypto.randomUUID(),
        trip_id: tripId,
        base_id: base.id,
        day_number: dayNumber,
        sort_order: dayNumber - 1,
        created_at: now,
        updated_at: now,
      });
      dayNumber += 1;
    }
  });

  if (dayRows.length > 0) {
    const { error: dayError } = await supabase.from("trip_days").insert(dayRows);

    if (dayError) {
      throw dayError;
    }
  }
}

async function insertTripRow(
  supabase,
  { ownerId, title, description, tripLength, startDate = null, status = "planning", targetYear = null, targetMonth = null, sortOrder = 0 }
) {
  const { data, error } = await supabase
    .from("trips")
    .insert({
      owner_id: ownerId,
      title,
      description: description || null,
      trip_length: tripLength,
      start_date: startDate || null,
      target_year: targetYear || null,
      target_month: targetMonth || null,
      sort_order: sortOrder,
      status,
      is_public: false,
    })
    .select(TRIP_ROW_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createTripWithDefaults({ ownerId, title, description, tripLength, startDate }) {
  const supabase = getSupabase();
  const tripData = await insertTripRow(supabase, { ownerId, title, description, tripLength, startDate });
  const tripId = tripData.id;

  try {
    await insertTripBasesAndDays(supabase, {
      tripId,
      tripLength,
      baseDefs: [{ name: title, locationName: title, localTimezone: DEFAULT_BASE_TIMEZONE }],
    });

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

export async function createDestination({ ownerId, title, description, targetYear = null, targetMonth = null }) {
  const trips = await listTripsForCurrentUser(ownerId);
  const wishlistTrips = trips.filter((trip) => trip.status === "destinations" && !trip.target_year);
  const nextSortOrder = wishlistTrips.reduce((max, trip) => Math.max(max, Number(trip.sort_order) || 0), -1) + 1;
  const tripData = await insertTripRow(getSupabase(), {
    ownerId,
    title,
    description,
    tripLength: 1,
    status: "destinations",
    targetYear,
    targetMonth,
    sortOrder: nextSortOrder,
  });

  return {
    ...tripData,
    membership_role: "planner",
  };
}

export async function fetchTripDetailBundle(tripId) {
  const supabase = getSupabase();

  const [tripResult, basesResult, daysResult, itemsResult, photosResult, overviewBlocksResult, notesResult, todosResult] = await Promise.all([
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
          target_year,
          target_month,
          sort_order,
          status,
          is_public,
          is_journal_public,
          is_planning_public,
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
      .select("id, trip_id, base_id, day_number, title, location_name, sort_order")
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
    supabase
      .from("trip_overview_blocks")
      .select("id, trip_id, base_id, category, subtitle, body, sort_order, is_published, source, created_by, created_at, updated_at")
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_notes")
      .select("id, trip_id, title, body, url, is_pinned, created_by, created_at, updated_at")
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("trip_todos")
      .select("id, trip_id, item_id, title, section, due_phase, is_complete, notes, source_suggestion, created_at, updated_at")
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
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

  if (overviewBlocksResult.error) {
    throw overviewBlocksResult.error;
  }

  if (notesResult.error) {
    throw notesResult.error;
  }

  if (todosResult.error) {
    throw todosResult.error;
  }

  const photos = photosResult.data || [];
  const tripHeroPhoto = photos.find((photo) => !photo.base_id) || null;
  const baseHeroPhotoByBaseId = new Map(
    photos
      .filter((photo) => photo.base_id)
      .map((photo) => [photo.base_id, photo])
  );
  const tripHeroPublicUrl = tripHeroPhoto ? getPhotoPublicUrl(tripHeroPhoto.storage_path, tripHeroPhoto.updated_at || tripHeroPhoto.id) : "";
  const [reconciledTrip] = await reconcileTripStatuses([tripResult.data]);

  return {
    trip: {
      ...reconciledTrip,
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
    overviewBlocks: overviewBlocksResult.data || [],
    notes: notesResult.data || [],
    todos: todosResult.data || [],
  };
}

export async function updateTripSettings({
  tripId,
  title,
  description,
  startDate,
  tripLength,
  isPublic,
  isJournalPublic,
  isPlanningPublic,
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

  const tripUpdate = {
    title,
    description: description || null,
    start_date: startDate || null,
    trip_length: tripLength,
    is_public: Boolean(isPublic),
    updated_at: now,
  };

  if (typeof isJournalPublic !== "undefined") {
    tripUpdate.is_journal_public = Boolean(isPublic) ? Boolean(isJournalPublic) : false;
  }

  if (typeof isPlanningPublic !== "undefined") {
    tripUpdate.is_planning_public = Boolean(isPlanningPublic);
  }

  const { data, error } = await supabase
    .from("trips")
    .update(tripUpdate)
    .eq("id", tripId)
    .select(
      `
        id,
        owner_id,
        title,
        description,
        trip_length,
        start_date,
        target_year,
        target_month,
        sort_order,
        status,
        is_public,
        is_journal_public,
        is_planning_public,
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

async function insertDaysForExistingBases(supabase, { tripId, tripLength, bases }) {
  const now = new Date().toISOString();
  const baseRows = bases.length > 0
    ? bases
    : [{ id: null }];
  const baseCount = baseRows.length;
  const dayRows = [];
  let dayNumber = 1;

  baseRows.forEach((base, index) => {
    const dayCount = Math.floor(tripLength / baseCount) + (index < tripLength % baseCount ? 1 : 0);

    for (let i = 0; i < dayCount; i += 1) {
      dayRows.push({
        id: crypto.randomUUID(),
        trip_id: tripId,
        base_id: base.id,
        day_number: dayNumber,
        sort_order: dayNumber - 1,
        created_at: now,
        updated_at: now,
      });
      dayNumber += 1;
    }
  });

  if (dayRows.length === 0) {
    return;
  }

  const { error } = await supabase.from("trip_days").insert(dayRows);

  if (error) {
    throw error;
  }
}

export async function promoteDestinationToTrip({ tripId, title, description, tripLength, startDate }) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const normalizedTripLength = Math.max(Number(tripLength) || 1, 1);

  const { data: existingBases, error: basesError } = await supabase
    .from("trip_bases")
    .select("id, name, location_name, local_timezone, sort_order")
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (basesError) {
    throw basesError;
  }

  const { data: existingDays, error: daysError } = await supabase
    .from("trip_days")
    .select("id")
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .limit(1);

  if (daysError) {
    throw daysError;
  }

  if ((existingDays || []).length === 0) {
    if ((existingBases || []).length > 0) {
      await insertDaysForExistingBases(supabase, {
        tripId,
        tripLength: normalizedTripLength,
        bases: existingBases,
      });
    } else {
      await insertTripBasesAndDays(supabase, {
        tripId,
        tripLength: normalizedTripLength,
        baseDefs: [{ name: title, locationName: title, localTimezone: DEFAULT_BASE_TIMEZONE }],
      });
    }
  }

  const { data, error } = await supabase
    .from("trips")
    .update({
      title,
      description: description || null,
      start_date: startDate || null,
      trip_length: normalizedTripLength,
      status: "planning",
      updated_at: now,
    })
    .eq("id", tripId)
    .select(TRIP_ROW_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function moveTripToWishlist({ tripId }) {
  const { data, error } = await getSupabase()
    .from("trips")
    .update({
      start_date: null,
      status: "destinations",
      updated_at: new Date().toISOString(),
    })
    .eq("id", tripId)
    .select(TRIP_ROW_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateDestinationSortOrders(trips) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const savedTrips = await Promise.all(
    trips.map(async (trip) => {
      const { data, error } = await supabase
        .from("trips")
        .update({
          sort_order: Number(trip.sort_order) || 0,
          updated_at: now,
        })
        .eq("id", trip.id)
        .select(TRIP_ROW_SELECT)
        .single();

      if (error) {
        throw error;
      }

      return data;
    })
  );

  return savedTrips;
}

async function resolveMovableItemsAndBases(supabase, { sourceTripId, scope }) {
  const { data: candidateItems, error: itemsError } = await supabase
    .from("trip_items")
    .select(TRIP_ITEM_SELECT)
    .eq("trip_id", sourceTripId)
    .is("deleted_at", null);

  if (itemsError) {
    throw itemsError;
  }

  const itemsToMove = (candidateItems || []).filter((item) =>
    scope === "not_done" ? !item.is_done : !item.day_id
  );

  const sourceBaseIds = [...new Set(itemsToMove.map((item) => item.base_id).filter(Boolean))];

  if (sourceBaseIds.length === 0) {
    return { itemsToMove, sourceBases: [] };
  }

  const { data: baseRows, error: basesError } = await supabase
    .from("trip_bases")
    .select("id, name, location_name, local_timezone, sort_order")
    .in("id", sourceBaseIds)
    .is("deleted_at", null);

  if (basesError) {
    throw basesError;
  }

  const sourceBases = (baseRows || []).sort((left, right) => left.sort_order - right.sort_order);

  return { itemsToMove, sourceBases };
}

async function insertMovedTripItems(supabase, { newTripId, ownerId, itemsToMove, baseIdMap }) {
  if (itemsToMove.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const insertPayload = itemsToMove.map((item, index) => ({
    id: crypto.randomUUID(),
    trip_id: newTripId,
    base_id: baseIdMap.get(item.base_id) || null,
    day_id: null,
    created_by: ownerId,
    title: item.title,
    item_type: item.item_type,
    status: "idea",
    is_anchor: false,
    is_done: false,
    done_by: null,
    done_at: null,
    meal_slot: item.meal_slot,
    activity_type: item.activity_type,
    transport_mode: item.transport_mode,
    transport_origin: item.transport_origin,
    transport_destination: item.transport_destination,
    time_start: null,
    time_end: null,
    time_is_estimated: false,
    cost_low: item.cost_low,
    cost_high: item.cost_high,
    confirmation_ref: null,
    url: item.url,
    notes: item.notes,
    address: item.address,
    sort_order: index,
    check_out_date: null,
    created_at: now,
    updated_at: now,
  }));

  const { error: insertError } = await supabase.from("trip_items").insert(insertPayload);

  if (insertError) {
    throw insertError;
  }

  const { error: deleteError } = await supabase
    .from("trip_items")
    .update({ deleted_at: now, updated_at: now })
    .in(
      "id",
      itemsToMove.map((item) => item.id)
    );

  if (deleteError) {
    throw deleteError;
  }
}

// Recreates the bases referenced by the moved items on the new trip (falling
// back to one base named after the new trip when none are referenced), and
// returns a map of old base_id -> new base_id for the carried-over ones.
async function createBasesForNextTrip(supabase, { newTripId, newTitle, tripLength, sourceBases }) {
  const baseDefs = sourceBases.length > 0
    ? sourceBases.map((base) => ({
        id: crypto.randomUUID(),
        sourceId: base.id,
        name: base.name,
        locationName: base.location_name,
        localTimezone: base.local_timezone,
      }))
    : [{ id: crypto.randomUUID(), sourceId: null, name: newTitle, locationName: newTitle, localTimezone: DEFAULT_BASE_TIMEZONE }];

  await insertTripBasesAndDays(supabase, { tripId: newTripId, tripLength, baseDefs });

  return new Map(baseDefs.filter((def) => def.sourceId).map((def) => [def.sourceId, def.id]));
}

function logBestEffort(promise, message) {
  return promise.catch((error) => {
    console.error(message, error);
  });
}

export async function moveItemsToNextTrip({ sourceTrip, ownerId, scope }) {
  const supabase = getSupabase();
  const newTitle = `Next Trip to ${sourceTrip.title || "Untitled trip"}`;

  const { itemsToMove, sourceBases } = await resolveMovableItemsAndBases(supabase, {
    sourceTripId: sourceTrip.id,
    scope,
  });

  const newTripData = await insertTripRow(supabase, {
    ownerId,
    title: newTitle,
    description: sourceTrip.description,
    tripLength: sourceTrip.trip_length,
  });
  const newTripId = newTripData.id;

  try {
    const baseIdMap = await createBasesForNextTrip(supabase, {
      newTripId,
      newTitle,
      tripLength: sourceTrip.trip_length,
      sourceBases,
    });

    await insertMovedTripItems(supabase, { newTripId, ownerId, itemsToMove, baseIdMap });

    await logBestEffort(
      duplicatePrimaryPhotosForNewTrip({ sourceTripId: sourceTrip.id, newTripId, ownerId, baseIdMap }),
      "Failed to copy trip photos to the new trip:"
    );

    await logBestEffort(
      duplicateOverviewBlocksForNewTrip({
        sourceTripId: sourceTrip.id,
        newTripId,
        ownerId,
        baseIdMap,
        excludeCategories: ["summary"],
      }),
      "Failed to copy overview content to the new trip:"
    );

    return { trip: newTripData, movedCount: itemsToMove.length };
  } catch (error) {
    await supabase
      .from("trips")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", newTripId);

    throw error;
  }
}

export async function softDeleteTrip(tripId) {
  const { error } = await getSupabase().rpc("soft_delete_trip_cascade", {
    p_trip_id: tripId,
  });

  if (error) {
    throw error;
  }
}
