import { getSupabase } from "../lib/supabase.js";

const CONNECTION_SELECT_FIELDS = "id, label, status, created_at, last_used_at";

export async function fetchMcpConnections() {
  const { data, error } = await getSupabase()
    .from("mcp_connections")
    .select(CONNECTION_SELECT_FIELDS)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function revokeMcpConnection(connectionId) {
  const { error } = await getSupabase()
    .from("mcp_connections")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", connectionId);

  if (error) {
    throw error;
  }
}
