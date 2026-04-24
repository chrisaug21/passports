import { getSupabase } from "../lib/supabase.js";

export async function fetchTripMembersWithEmails(tripId) {
  const [membersResult, emailsResult] = await Promise.all([
    getSupabase()
      .from("trip_members")
      .select("id, trip_id, user_id, role, invited_at, accepted_at")
      .eq("trip_id", tripId)
      .order("invited_at", { ascending: true }),
    getSupabase()
      .rpc("get_trip_member_emails", { p_trip_id: tripId }),
  ]);

  if (membersResult.error) throw membersResult.error;

  const members = membersResult.data || [];
  const emailMap = new Map(
    (emailsResult.data || []).map((row) => [row.user_id, row.email])
  );

  return members.map((member) => ({
    ...member,
    email: emailMap.get(member.user_id) || null,
  }));
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
