import { getSupabase } from "../lib/supabase.js";

// Calls to the admin-only server functions. Each one sends the signed-in
// person's access token; the server re-checks they're an admin every time.
async function adminFetch(path, { method = "GET", body } = {}) {
  const { data } = await getSupabase().auth.getSession();
  const accessToken = data?.session?.access_token;
  if (!accessToken) throw new Error("Please sign in again.");

  const response = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Something went wrong. Please try again.");
  return payload;
}

// { isAdmin, isOwner }. Never throws: any problem just means "not an admin".
export async function fetchAdminStatus() {
  try {
    const { isAdmin, isOwner } = await adminFetch("/api/admin-whoami");
    return { isAdmin: Boolean(isAdmin), isOwner: Boolean(isOwner) };
  } catch {
    return { isAdmin: false, isOwner: false };
  }
}

export function fetchSignupSetting() {
  return adminFetch("/api/admin-settings");
}

export function saveSignupSetting(requiresInvite) {
  return adminFetch("/api/admin-settings", { method: "PUT", body: { requiresInvite } });
}

export async function fetchInviteCodes() {
  return (await adminFetch("/api/admin-codes")).codes;
}

export async function fetchCodeRedemptions(id) {
  return (await adminFetch(`/api/admin-codes?id=${encodeURIComponent(id)}`)).redemptions;
}

export function createInviteCode(fields) {
  return adminFetch("/api/admin-codes", { method: "POST", body: fields });
}

export function updateInviteCode(id, fields) {
  return adminFetch("/api/admin-codes", { method: "PATCH", body: { id, ...fields } });
}

export function removeInviteCode(id) {
  return adminFetch(`/api/admin-codes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fetchAdminUsers({ page = 1, search = "" } = {}) {
  const params = new URLSearchParams({ page: String(page) });
  if (search) params.set("q", search);
  return adminFetch(`/api/admin-users?${params}`);
}

export function setUserAdmin(userId, isAdmin) {
  return adminFetch("/api/admin-users", { method: "PUT", body: { userId, isAdmin } });
}
