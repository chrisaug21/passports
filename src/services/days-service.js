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
    .select("id, trip_id, base_id, day_number, title, location_name, journal_notes, sort_order")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
