const { getMissingEmailEnv, getAppBaseUrl, sendEmail } = require("../lib/email.js");
const { buildWelcomeEmail } = require("../lib/welcome-email.js");
const { buildSettingsUrl } = require("../lib/email-prefs.js");
const { pickHeroPhotoFor } = require("../lib/hero-photos.js");
const { json, getBearerToken } = require("../lib/admin-auth.js");
const admin = require("../lib/supabase-admin.js");

// An account only qualifies for its welcome email for its first week, so this
// endpoint can't be used to email an old account.
const MAX_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Called by the app once a session first exists after sign-up. Always
// best-effort: nothing here may affect the person's sign-up. Sends at most
// once per person ever (welcome_email_sends claims it), and it only ever
// emails the signed-in caller's own address.
exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  const missingEnv = getMissingEmailEnv(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "EMAIL_LINK_SECRET", "RESEND_API_KEY"]);
  if (missingEnv.length) {
    console.error(`send-welcome-email: not configured on this deploy. Missing: ${missingEnv.join(", ")}`);
    return json(503, { sent: false });
  }

  const caller = await admin.getUserFromToken(getBearerToken(event));
  if (!caller?.email) return json(401, { error: "Please sign in again." });

  const createdAt = new Date(caller.created_at).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > MAX_ACCOUNT_AGE_MS) return json(200, { sent: false });

  let claimed = false;
  try {
    const rows = await admin.insertIgnoringDuplicates("welcome_email_sends", { user_id: caller.id }, "user_id");
    claimed = rows.length > 0;
    if (!claimed) return json(200, { sent: false });

    const profiles = await admin.select("user_profiles", { select: "first_name", id: admin.eqId(caller.id) });
    const baseUrl = getAppBaseUrl(event);
    const { subject, html, text } = buildWelcomeEmail({
      firstName: profiles[0]?.first_name,
      baseUrl,
      photoUrl: `${baseUrl}${pickHeroPhotoFor(caller.id)}`,
      // Signed link to the email-settings page that works without signing in.
      settingsUrl: buildSettingsUrl(baseUrl, caller.id, process.env.EMAIL_LINK_SECRET),
    });
    const sent = await sendEmail({ to: caller.email, subject, html, text });

    if (!sent) {
      // Give the claim back so a later sign-in can try again.
      await admin.remove("welcome_email_sends", { user_id: admin.eqId(caller.id) });
    }
    return json(200, { sent });
  } catch (error) {
    console.error("send-welcome-email failed:", error);
    if (claimed) {
      try {
        await admin.remove("welcome_email_sends", { user_id: admin.eqId(caller.id) });
      } catch (releaseError) {
        console.error("send-welcome-email could not release its claim:", releaseError);
      }
    }
    return json(500, { sent: false });
  }
};
