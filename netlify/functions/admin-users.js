const { json, notFound, readJsonBody, requireAdmin } = require("../lib/admin-auth.js");
const admin = require("../lib/supabase-admin.js");

const PAGE_SIZE = 50;
const AUTH_PAGE_SIZE = 200;
// Safety stop on how many pages of accounts one request will walk through.
const MAX_AUTH_PAGES = 25;

async function loadAllAuthUsers() {
  const users = [];
  for (let page = 1; page <= MAX_AUTH_PAGES; page += 1) {
    const batch = await admin.listAuthUsers({ page, perPage: AUTH_PAGE_SIZE });
    users.push(...batch);
    if (batch.length < AUTH_PAGE_SIZE) break;
  }
  return users;
}

function displayName(profile) {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
}

// GET ?page=1&q=<email search>: newest accounts first, 50 per page.
async function listUsers(query) {
  const search = String(query.q || "").trim().toLowerCase();
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const [authUsers, profiles, memberships, redemptions, codes, admins] = await Promise.all([
    loadAllAuthUsers(),
    admin.select("user_profiles", { select: "id,first_name,last_name", limit: "10000" }),
    admin.select("trip_members", { select: "user_id", deleted_at: "is.null", limit: "50000" }),
    admin.select("invite_redemptions", { select: "user_id,code_id", limit: "10000" }),
    admin.select("invite_codes", { select: "id,code,label", limit: "10000" }),
    admin.select("app_admins", { select: "user_id,is_owner" }),
  ]);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const codeById = new Map(codes.map((code) => [code.id, code]));
  const redemptionByUser = new Map(redemptions.map((row) => [row.user_id, row]));
  const adminById = new Map(admins.map((row) => [row.user_id, row]));
  const tripCounts = new Map();
  for (const row of memberships) tripCounts.set(row.user_id, (tripCounts.get(row.user_id) || 0) + 1);

  const matching = authUsers
    .filter((user) => !search || String(user.email || "").toLowerCase().includes(search))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  const rows = matching.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((user) => {
    const redemption = redemptionByUser.get(user.id);
    const code = redemption && codeById.get(redemption.code_id);
    const adminRow = adminById.get(user.id);
    return {
      id: user.id,
      name: displayName(profileById.get(user.id)),
      email: user.email || "",
      joinedAt: user.created_at,
      lastSignInAt: user.last_sign_in_at || null,
      tripCount: tripCounts.get(user.id) || 0,
      joinedVia: code ? code.label || code.code : null,
      isAdmin: Boolean(adminRow),
      isOwner: Boolean(adminRow?.is_owner),
    };
  });

  return json(200, { users: rows, total: matching.length, page, pageSize: PAGE_SIZE });
}

// PUT { userId, isAdmin }: make someone an admin, or take it away.
async function setAdmin(body, callerId) {
  if (!body || typeof body.isAdmin !== "boolean") return json(400, { error: "Invalid request." });
  const userId = String(body.userId || "");
  admin.eqId(userId); // throws "Invalid id." for anything that isn't a UUID

  if (body.isAdmin) {
    if (!(await admin.getEmailForUser(userId))) return json(404, { error: "That account no longer exists." });
    await admin.insertIgnoringDuplicates("app_admins", { user_id: userId, granted_by: callerId }, "user_id");
    return json(200, { isAdmin: true });
  }

  const rows = await admin.select("app_admins", { select: "is_owner", user_id: admin.eqId(userId) });
  if (rows[0]?.is_owner) return json(403, { error: "The owner can't be removed as an admin." });

  // The extra is_owner filter means even a bug above could never delete the
  // owner row; the database has its own rule too.
  await admin.remove("app_admins", { user_id: admin.eqId(userId), is_owner: "eq.false" });
  return json(200, { isAdmin: false });
}

exports.handler = async function handler(event) {
  try {
    const result = await requireAdmin(event);
    if (result.error) return result.error;

    if (event.httpMethod === "GET") return await listUsers(event.queryStringParameters || {});
    if (event.httpMethod === "PUT") return await setAdmin(readJsonBody(event), result.caller.id);
    return notFound();
  } catch (error) {
    if (error.message === "Invalid id.") return json(400, { error: "Invalid request." });
    console.error("admin-users failed:", error);
    return json(500, { error: "Something went wrong. Please try again." });
  }
};
