const { json, requireAdmin } = require("../lib/admin-auth.js");

// Tells the browser whether to show the "Passports admin" menu item. This
// is the one admin endpoint that answers non-admins with a normal "no" (it has
// to, so the menu can stay hidden); every other admin-* function answers
// non-admins as if the page didn't exist.
exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });

  try {
    const result = await requireAdmin(event);
    if (result.error) return json(200, { isAdmin: false, isOwner: false });
    return json(200, { isAdmin: true, isOwner: result.isOwner });
  } catch (error) {
    console.error("admin-whoami failed:", error);
    return json(200, { isAdmin: false, isOwner: false });
  }
};
