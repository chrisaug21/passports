import { DEFAULT_BASE_TIMEZONE } from "../config/constants.js";
import { getSupabase } from "../lib/supabase.js";

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

export async function createTripBase({
  tripId,
  name,
  locationName,
  lat = null,
  lng = null,
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
      lat,
      lng,
      local_timezone: validatedTimezone,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
    })
    .select("id, trip_id, name, location_name, lat, lng, local_timezone, sort_order, notes")
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
  lat,
  lng,
  localTimezone,
}) {
  const supabase = getSupabase();
  const validatedTimezone = getValidatedTimezone(localTimezone);
  const patch = {
    name,
    location_name: locationName || null,
    local_timezone: validatedTimezone,
    updated_at: new Date().toISOString(),
  };

  if (typeof lat !== "undefined" && typeof lng !== "undefined") {
    patch.lat = lat;
    patch.lng = lng;
  }

  const { data, error } = await supabase
    .from("trip_bases")
    .update(patch)
    .eq("id", baseId)
    .select("id, trip_id, name, location_name, lat, lng, local_timezone, sort_order, notes")
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

export async function listBasesForTrips(tripIds) {
  if (!Array.isArray(tripIds) || tripIds.length === 0) {
    return [];
  }

  const { data, error } = await getSupabase()
    .from("trip_bases")
    .select("id, trip_id, name, location_name, lat, lng, local_timezone, sort_order")
    .in("trip_id", tripIds)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}
