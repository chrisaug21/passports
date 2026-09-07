import { getSupabase } from "../lib/supabase.js";

function normalizeNullableId(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue === "" ? null : normalizedValue;
}

async function fetchActiveTripDaysForAllocation(tripId) {
  const { data, error } = await getSupabase()
    .from("trip_days")
    .select("id, trip_id, base_id, day_number, title, location_name, sort_order, created_at")
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
      .select("id, trip_id, base_id, day_number, title, location_name, sort_order");

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
