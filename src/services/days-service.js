import { getSupabase } from "../lib/supabase.js";

export async function updateTripDayTitle({ dayId, title }) {
  const normalizedTitle = String(title || "").trim();

  const { data, error } = await getSupabase()
    .from("trip_days")
    .update({
      title: normalizedTitle || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dayId)
    .select("id, trip_id, base_id, day_number, title, location_name, sort_order")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listDaysForTrips(tripIds) {
  if (!Array.isArray(tripIds) || tripIds.length === 0) {
    return [];
  }

  const { data, error } = await getSupabase()
    .from("trip_days")
    .select("id, trip_id, base_id, day_number, sort_order")
    .in("trip_id", tripIds)
    .is("deleted_at", null)
    .order("day_number", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}
