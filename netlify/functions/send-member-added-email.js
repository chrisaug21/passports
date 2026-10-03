const { EMAIL_KINDS, buildUnsubscribeUrl } = require("../lib/email-prefs.js");
const { getMissingEmailEnv, getAppBaseUrl, sendEmail } = require("../lib/email.js");
const { buildMemberAddedEmail } = require("../lib/member-added-email.js");
const { buildEmailPhoto, heroPhotoParams } = require("../lib/trip-photo.js");
const admin = require("../lib/supabase-admin.js");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A membership only qualifies for its welcome email for a short while after
// it's created, so a signed-in user can't use this endpoint to email someone
// who joined a trip long ago.
const MAX_MEMBERSHIP_AGE_MS = 10 * 60 * 1000;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

function formatName(profile) {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
}

// Called by the app right after a planner adds someone to a trip. Always
// best-effort: the member is already added by the time this runs, so nothing
// here may make that look like it failed.
exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  const linkSecret = process.env.EMAIL_LINK_SECRET;
  const missingEnv = getMissingEmailEnv(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "EMAIL_LINK_SECRET", "RESEND_API_KEY"]);
  if (missingEnv.length) {
    console.error(`send-member-added-email: not configured on this deploy. Missing: ${missingEnv.join(", ")}`);
    return json(503, { sent: false });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request." });
  }

  const { tripId, userId } = payload;
  if (!UUID_PATTERN.test(tripId || "") || !UUID_PATTERN.test(userId || "")) {
    return json(400, { error: "Invalid request." });
  }

  const accessToken = (event.headers?.authorization || event.headers?.Authorization || "").replace(/^Bearer\s+/i, "");
  const caller = await admin.getUserFromToken(accessToken);
  if (!caller) return json(401, { error: "Please sign in again." });
  if (caller.id === userId) return json(200, { sent: false });

  try {
    // The caller must be an active member of this trip themselves.
    const callerMembership = await admin.select("trip_members", {
      select: "id",
      trip_id: `eq.${tripId}`,
      user_id: `eq.${caller.id}`,
      deleted_at: "is.null",
    });
    if (!callerMembership.length) return json(403, { error: "Not allowed." });

    // Claim the one-time right to email this member. If the filters match
    // nothing (already emailed, too old, or not a member) there is nothing to
    // send — and a repeat call can never send a second email.
    const claimed = await admin.update(
      "trip_members",
      {
        trip_id: `eq.${tripId}`,
        user_id: `eq.${userId}`,
        deleted_at: "is.null",
        added_email_sent_at: "is.null",
        invited_at: `gte.${new Date(Date.now() - MAX_MEMBERSHIP_AGE_MS).toISOString()}`,
      },
      { added_email_sent_at: new Date().toISOString() }
    );
    if (!claimed.length) return json(200, { sent: false });

    const kind = EMAIL_KINDS.member_added;
    const [trips, recipientProfiles, inviterProfiles, recipientEmail, photos] = await Promise.all([
      admin.select("trips", { select: "id,title,start_date,trip_length", id: `eq.${tripId}`, deleted_at: "is.null" }),
      admin.select("user_profiles", { select: `first_name,${kind.column}`, id: `eq.${userId}` }),
      admin.select("user_profiles", { select: "first_name,last_name", id: `eq.${caller.id}` }),
      admin.getEmailForUser(userId),
      admin.select("trip_photos", heroPhotoParams(tripId)),
    ]);

    const trip = trips[0];
    const recipientProfile = recipientProfiles[0];
    if (!trip || !recipientEmail) return json(200, { sent: false });

    // No profile row yet means they've never touched their settings: default on.
    if (recipientProfile && recipientProfile[kind.column] === false) return json(200, { sent: false });

    const baseUrl = getAppBaseUrl();
    const unsubscribeUrl = buildUnsubscribeUrl(baseUrl, userId, "member_added", linkSecret);

    const photo = await buildEmailPhoto(photos[0]);

    const { subject, html, text } = buildMemberAddedEmail({
      trip,
      inviterName: formatName(inviterProfiles[0]) || "Someone",
      recipientFirstName: recipientProfile?.first_name,
      photo,
      baseUrl,
      unsubscribeUrl,
    });

    const sent = await sendEmail({
      to: recipientEmail,
      subject,
      html,
      text,
      unsubscribeUrl,
    });

    return json(200, { sent });
  } catch (error) {
    console.error("send-member-added-email failed:", error);
    return json(500, { sent: false });
  }
};
