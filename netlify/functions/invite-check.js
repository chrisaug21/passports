const crypto = require("crypto");
const { json, readJsonBody } = require("../lib/admin-auth.js");
const admin = require("../lib/supabase-admin.js");

// Public courtesy check for the sign-up form: is this invite code usable?
// The database trigger is what really enforces the gate; this only lets the
// form give a helpful message before the sign-up is attempted.
//
// It's the one guessable surface (codes like "VIP" are guessable on purpose),
// so it's rate limited: 10 checks per address per 10 minutes. The real cap on
// abuse is each code's seat count and expiry.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_CHECKS_PER_WINDOW = 10;

function clientAddress(event) {
  const headers = event.headers || {};
  return headers["x-nf-client-connection-ip"] || String(headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
}

// Only a salted hash of the address is stored, never the address itself.
function hashAddress(address) {
  return crypto.createHash("sha256").update(`${process.env.EMAIL_LINK_SECRET || ""}:${address}`).digest("hex");
}

async function isRateLimited(ipHash) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const recent = await admin.select("signup_attempts", { select: "id", ip_hash: `eq.${ipHash}`, created_at: `gte.${since}`, limit: String(MAX_CHECKS_PER_WINDOW) });
  if (recent.length >= MAX_CHECKS_PER_WINDOW) return true;

  await admin.insert("signup_attempts", { ip_hash: ipHash });
  // Tidy up old rows now and then so the log doesn't grow forever.
  if (Math.random() < 0.05) {
    await admin.remove("signup_attempts", { created_at: `lt.${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}` });
  }
  return false;
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  const body = readJsonBody(event);
  const code = String(body?.code || "").trim().toUpperCase();
  if (!code || code.length > 64) return json(200, { valid: false, reason: "invalid" });

  try {
    if (await isRateLimited(hashAddress(clientAddress(event)))) {
      return json(429, { error: "You've tried a lot of codes. Please wait a few minutes and try again." });
    }

    const rows = await admin.select("invite_codes", {
      select: "active,max_uses,redeemed_count,expires_at",
      code_normalized: `eq.${code}`,
      deleted_at: "is.null",
    });
    const row = rows[0];

    // "Turned off" looks the same as "doesn't exist" so a visitor can't tell
    // which codes are real.
    if (!row || !row.active) return json(200, { valid: false, reason: "invalid" });
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return json(200, { valid: false, reason: "expired" });
    if (row.max_uses !== null && row.redeemed_count >= row.max_uses) return json(200, { valid: false, reason: "used_up" });
    return json(200, { valid: true });
  } catch (error) {
    console.error("invite-check failed:", error);
    // Can't check right now — let the sign-up proceed; the trigger decides.
    return json(200, { valid: true, unchecked: true });
  }
};
