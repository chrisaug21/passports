const crypto = require("crypto");
const { getMissingEmailEnv, getAppBaseUrl } = require("../lib/email.js");
const { runSweep } = require("../lib/trip-timeline-sweep.js");
const admin = require("../lib/supabase-admin.js");

// Runs the trip-timeline sweep by hand, over HTTP. Needs the secret in every
// case, because it can send real email on demand. Options (all optional):
//   now=<ISO time>     pretend it's this instant, e.g. 2026-11-02T00:30:00Z
//                      (default: the real current time). The sweep works on
//                      each trip's LOCAL clock, so the hour matters.
//   dry_run=1          show who would be emailed; claim and send nothing
//   trip=<trip id>     limit to one trip
//   kind=trip_day_two | trip_starts_soon   limit to one email
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
    console.error(`trip-timeline-run: not configured on this deploy. Missing: ${missingEnv.join(", ")}`);
    return json(503, { error: "Not configured." });
  }

  const query = event.queryStringParameters || {};

  let now = new Date();
  if (query.now) {
    now = new Date(query.now);
    if (Number.isNaN(now.getTime())) return json(400, { error: "Invalid time." });
  }

  const onlyKind = query.kind || null;
  if (onlyKind && onlyKind !== "trip_day_two" && onlyKind !== "trip_starts_soon") {
    return json(400, { error: "Invalid kind." });
  }

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
      now,
      dryRun: query.dry_run === "1",
      onlyTripFilter,
      onlyKind,
      baseUrl: getAppBaseUrl(event),
      linkSecret: process.env.EMAIL_LINK_SECRET,
    });
    return json(200, summary);
  } catch (error) {
    console.error("trip-timeline-run failed:", error);
    return json(500, { error: "Sweep failed." });
  }
};
