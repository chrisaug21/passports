import { getSupabase } from "../lib/supabase.js";

export async function fetchTripMembersWithEmails(tripId) {
  const { data, error } = await getSupabase()
    .rpc("get_trip_members", { p_trip_id: tripId });

  if (error) throw error;

  const members = data || [];
  const uniqueIds = [...new Set(members.map((m) => m.user_id))];

  const emailEntries = await Promise.all(
    uniqueIds.map((userId) =>
      getSupabase()
        .rpc("get_user_email_by_id", { p_user_id: userId })
        .then(({ data: email }) => [userId, email || null])
        .catch(() => [userId, null])
    )
  );

  const emailMap = new Map(emailEntries);

  return members.map((member) => ({ ...member, email: emailMap.get(member.user_id) ?? null }));
}

export async function addTripMember({ tripId, userId }) {
  const now = new Date().toISOString();
  const { error } = await getSupabase()
    .from("trip_members")
    .insert({
      trip_id: tripId,
      user_id: userId,
      role: "planner",
      invited_at: now,
      accepted_at: now,
    });

  if (error) throw error;
}

export async function removeTripMember({ tripId, userId }) {
  const { error } = await getSupabase()
    .from("trip_members")
    .update({ deleted_at: new Date().toISOString() })
    .eq("trip_id", tripId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function getUserIdByEmail(email) {
  const { data, error } = await getSupabase()
    .rpc("get_user_id_by_email", { p_email: email });

  if (error) throw error;
  return data;
}
