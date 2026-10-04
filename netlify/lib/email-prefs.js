const crypto = require("crypto");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every email Passports can send, keyed by a short id. `column` is the
// boolean on user_profiles that switches it on/off for a person.
//
// Adding a new email type: add it here (title/description show on the
// unsubscribe page) AND in EMAIL_PREFERENCE_OPTIONS in src/config/constants.js (the browser can't import this file — no build
// step), add the column in a sql/ migration (see sql/add_email_notifications.sql
// for the default-value rule), and send it with an unsubscribe link built by
// buildUnsubscribeUrl().
const EMAIL_KINDS = {
  member_added: {
    column: "email_member_added",
    label: "being added to a trip",
    title: "Added to a trip",
    description: "When someone adds you to one of their trips.",
  },
  journal_reminder: {
    column: "email_journal_reminder",
    label: "journal reminders",
    title: "Journal reminders",
    description: "About a week after a trip ends, a nudge to add your memories.",
  },
  trip_day_two: {
    column: "email_trip_day_two",
    label: "trip check-in emails",
    title: "Trip check-in",
    description: "The evening of the second day of a trip, a nudge to start journaling.",
  },
  trip_starts_soon: {
    column: "email_trip_starts_soon",
    label: "trip countdown emails",
    title: "Trip countdown",
    description: "Three days before a trip starts, a link to your itinerary and what's still to do.",
  },
  // One switch for both the "X years ago today" email and the "add your
  // memories" nudge (they share this unsubscribe kind).
  trip_memories: {
    column: "email_trip_memories",
    label: "trip memory emails",
    title: "Trip memories",
    description: "On the anniversary of a day from a past trip, a look back at your journal or a nudge to add your memories.",
  },
};

// A signed link that opens the email-settings page with nothing switched off —
// for emails that have no switch of their own (the welcome email), so a
// recipient can still reach their settings without signing in.
const SETTINGS_LINK_KIND = "settings";

const ALL_EMAIL_COLUMNS = Object.values(EMAIL_KINDS).map((kind) => kind.column);

// ---------------------------------------------------------------------------
// Unsubscribe links
//
// A link carries "<user id>.<email kind>" plus an HMAC signature made with a
// server-only secret, so nobody can build a link that unsubscribes someone
// else. Links don't expire — an old email's unsubscribe link should keep
// working.
// ---------------------------------------------------------------------------

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createUnsubscribeToken(userId, kind, secret) {
  const payload = base64Url(`${userId}.${kind}`);
  return `${payload}.${sign(payload, secret)}`;
}

function verifyUnsubscribeToken(token, secret) {
  const [payload, signature, ...extra] = String(token || "").split(".");
  if (!payload || !signature || extra.length) return null;

  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  const [userId, kind] = Buffer.from(payload, "base64url").toString("utf8").split(".");
  if (!UUID_PATTERN.test(userId || "") || (kind !== SETTINGS_LINK_KIND && !Object.hasOwn(EMAIL_KINDS, kind))) return null;
  return { userId, kind };
}

function buildSettingsUrl(baseUrl, userId, secret) {
  return buildUnsubscribeUrl(baseUrl, userId, SETTINGS_LINK_KIND, secret);
}

function buildUnsubscribeUrl(baseUrl, userId, kind, secret) {
  return `${baseUrl}/api/email-unsubscribe?t=${createUnsubscribeToken(userId, kind, secret)}`;
}

module.exports = {
  EMAIL_KINDS,
  ALL_EMAIL_COLUMNS,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  buildSettingsUrl,
  SETTINGS_LINK_KIND,
};
