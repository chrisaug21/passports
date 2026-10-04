const admin = require("./supabase-admin.js");

// Shared by every admin-* function. The checks here are the real control: the
// admin menu item being hidden in the browser is cosmetic only.

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

// Non-admins get the same answer as a page that doesn't exist, so these
// endpoints don't advertise themselves.
function notFound() {
  return json(404, { error: "Not found." });
}

function getBearerToken(event) {
  return (event.headers?.authorization || event.headers?.Authorization || "").replace(/^Bearer\s+/i, "");
}

function readJsonBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch {
    return null;
  }
}

// Who is calling, and whether they're an admin right now (re-checked on every
// request). Returns { caller, isOwner } for admins, or { error } to send back.
async function requireAdmin(event) {
  const caller = await admin.getUserFromToken(getBearerToken(event));
  if (!caller) return { error: notFound() };

  // A removed admin (deleted_at set) is no longer an admin.
  const rows = await admin.select("app_admins", { select: "user_id,is_owner", user_id: admin.eqId(caller.id), deleted_at: "is.null" });
  if (!rows.length) return { error: notFound() };
  return { caller, isOwner: Boolean(rows[0].is_owner) };
}

module.exports = { json, notFound, getBearerToken, readJsonBody, requireAdmin };
