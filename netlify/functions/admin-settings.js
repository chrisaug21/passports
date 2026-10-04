const { json, notFound, readJsonBody, requireAdmin } = require("../lib/admin-auth.js");
const admin = require("../lib/supabase-admin.js");

const SIGNUP_KEY = "signup_requires_invite";

async function readSignupSetting() {
  const rows = await admin.select("app_settings", { select: "value,updated_at", key: `eq.${SIGNUP_KEY}` });
  return { requiresInvite: rows[0]?.value === true, updatedAt: rows[0]?.updated_at || null };
}

// GET: current sign-up policy. PUT { requiresInvite: boolean }: change it.
exports.handler = async function handler(event) {
  try {
    const result = await requireAdmin(event);
    if (result.error) return result.error;

    if (event.httpMethod === "GET") return json(200, await readSignupSetting());

    if (event.httpMethod === "PUT") {
      const body = readJsonBody(event);
      if (!body || typeof body.requiresInvite !== "boolean") return json(400, { error: "Invalid request." });

      await admin.upsert(
        "app_settings",
        { key: SIGNUP_KEY, value: body.requiresInvite, updated_at: new Date().toISOString(), updated_by: result.caller.id },
        "key"
      );
      return json(200, await readSignupSetting());
    }

    return notFound();
  } catch (error) {
    console.error("admin-settings failed:", error);
    return json(500, { error: "Something went wrong. Please try again." });
  }
};
