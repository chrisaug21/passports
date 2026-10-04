const { json, notFound, readJsonBody, requireAdmin } = require("../lib/admin-auth.js");
const admin = require("../lib/supabase-admin.js");

const PAGE_SIZE = 50;

// GET ?page=1&q=<email search>: newest accounts first, 50 per page. One
// database call does the whole join (see sql/add_admin_list_users.sql).
async function listUsers(query) {
  const search = String(query.q || "").trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);

  const result = await admin.rpc("admin_list_users", {
    p_search: search,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });

  const users = (result.users || []).map((user) => ({
    id: user.id,
    name: user.name || "",
    email: user.email || "",
    joinedAt: user.created_at,
    lastSignInAt: user.last_sign_in_at || null,
    tripCount: Number(user.trip_count) || 0,
    joinedVia: user.joined_via || null,
    isAdmin: Boolean(user.is_admin),
    isOwner: Boolean(user.is_owner),
  }));

  return json(200, { users, total: Number(result.total) || 0, page, pageSize: PAGE_SIZE });
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
