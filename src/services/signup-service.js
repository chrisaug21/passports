import { getSupabase } from "../lib/supabase.js";

// Whether Create Account needs an invite code right now. If the answer can't
// be fetched, treat sign-up as open: the database enforces the real rule.
export async function fetchSignupPolicy() {
  try {
    const response = await fetch("/api/signup-policy");
    if (!response.ok) return { requiresInvite: false };
    const { requiresInvite } = await response.json();
    return { requiresInvite: Boolean(requiresInvite) };
  } catch {
    return { requiresInvite: false };
  }
}

// { valid, reason?: "invalid" | "expired" | "used_up", rateLimited? }
export async function checkInviteCode(code) {
  try {
    const response = await fetch("/api/invite-check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (response.status === 429) return { valid: false, rateLimited: true };
    if (!response.ok) return { valid: true };
    return await response.json();
  } catch {
    // Can't check right now: let the sign-up try; the database decides.
    return { valid: true };
  }
}

// Asks the server to send the one-time welcome email. Best-effort by design:
// the server only ever sends once per person, and a failure here must never
// show up as an error.
export async function sendWelcomeEmail() {
  try {
    const { data } = await getSupabase().auth.getSession();
    const accessToken = data?.session?.access_token;
    if (!accessToken) return;

    await fetch("/api/send-welcome-email", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });
  } catch (error) {
    console.error(error);
  }
}
