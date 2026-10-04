const { json } = require("../lib/admin-auth.js");
const admin = require("../lib/supabase-admin.js");

// Public: tells the login page whether Create Account needs an invite code.
// Returns just the one yes/no and nothing else. If it can't be read, the page
// treats sign-up as open — the database is what actually enforces the gate.
exports.handler = async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed." });

  try {
    const rows = await admin.select("app_settings", { select: "value", key: "eq.signup_requires_invite" });
    return json(200, { requiresInvite: rows[0]?.value === true });
  } catch (error) {
    console.error("signup-policy failed:", error);
    return json(200, { requiresInvite: false });
  }
};
