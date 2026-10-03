const crypto = require("crypto");
const { getMissingEmailEnv, getAppBaseUrl } = require("../lib/email.js");
const { getTodayEastern } = require("../lib/trip-dates.js");
const { runSweep } = require("../lib/journal-reminder-sweep.js");
const admin = require("../lib/supabase-admin.js");

// Runs the journal-reminder sweep by hand, over HTTP. Needs the secret in
// every case, because it can send real email on demand. Options (all optional):
//   today=YYYY-MM-DD   pretend it's this day (default: today, US Eastern)
//   dry_run=1          show who would be emailed; claim and send nothing
//   trip=<trip id>     limit to one trip
function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

function isAuthorized(event) {
  const secret = process.env.EMAIL_LINK_SECRET || "";
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  const provided = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return secret.length > 0 && provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

exports.handler = async function handler(event) {
  if (!isAuthorized(event)) return json(401, { error: "Not allowed." });

  const missingEnv = getMissingEmailEnv(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "EMAIL_LINK_SECRET", "RESEND_API_KEY"]);
  if (missingEnv.length) {
    console.error(`journal-reminder-run: not configured on this deploy. Missing: ${missingEnv.join(", ")}`);
    return json(503, { error: "Not configured." });
  }

  const query = event.queryStringParameters || {};
  const today = query.today && /^\d{4}-\d{2}-\d{2}$/.test(query.today) ? query.today : getTodayEastern();

  // A malformed trip id is a bad request, not a server failure.
  let onlyTripFilter = null;
  if (query.trip) {
    try {
      onlyTripFilter = admin.eqId(query.trip);
    } catch {
      return json(400, { error: "Invalid trip." });
    }
  }

  try {
    const summary = await runSweep({
      today,
      dryRun: query.dry_run === "1",
      onlyTripFilter,
      baseUrl: getAppBaseUrl(event),
      linkSecret: process.env.EMAIL_LINK_SECRET,
    });
    return json(200, summary);
  } catch (error) {
    console.error("journal-reminder-run failed:", error);
    return json(500, { error: "Sweep failed." });
  }
};
