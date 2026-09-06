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
