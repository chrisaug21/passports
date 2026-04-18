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

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  console.log("createTripWithDefaults ownerId", ownerId);
  console.log("createTripWithDefaults tripInsertPayload", JSON.stringify(tripInsertPayload, null, 2));
  console.log(
    "createTripWithDefaults sessionSummary",
    JSON.stringify(
      {
        sessionError: sessionError
          ? {
              message: sessionError.message,
              status: sessionError.status,
              code: sessionError.code,
            }
          : null,
        hasSession: Boolean(session),
        sessionUserId: session?.user?.id ?? null,
        tokenSubject: session?.access_token ? parseJwtSub(session.access_token) : null,
        hasAccessToken: Boolean(session?.access_token),
      },
      null,
      2
    )
  );

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
    console.log("createTripWithDefaults tripInsertError", tripError);
    console.log("createTripWithDefaults tripInsertErrorJson", JSON.stringify(tripError, null, 2));
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

function parseJwtSub(token) {
  try {
    const [, payload] = token.split(".");

    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded));

    return decoded.sub ?? null;
  } catch (_error) {
    return null;
  }
}
