const crypto = require("crypto");

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
};

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
  if (!userId || !EMAIL_KINDS[kind]) return null;
  return { userId, kind };
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
};
