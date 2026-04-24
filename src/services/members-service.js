import { getSupabase } from "../lib/supabase.js";

export async function fetchTripMembersWithEmails(tripId) {
  const { data, error } = await getSupabase()
    .from("trip_members")
    .select("id, trip_id, user_id, role, invited_at, accepted_at")
    .eq("trip_id", tripId)
    .order("invited_at", { ascending: true });

  if (error) throw error;

  const members = data || [];

  const emails = await Promise.all(
    members.map((member) =>
      getSupabase()
        .rpc("get_user_email_by_id", { p_user_id: member.user_id })
        .then(({ data: email }) => email || null)
        .catch(() => null)
    )
  );

  return members.map((member, i) => ({ ...member, email: emails[i] }));
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
    .delete()
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
