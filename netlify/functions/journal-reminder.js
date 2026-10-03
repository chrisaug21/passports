const { getMissingEmailEnv, getAppBaseUrl } = require("../lib/email.js");
const { getTodayEastern } = require("../lib/trip-dates.js");
const { runSweep, getDueEndDate } = require("../lib/journal-reminder-sweep.js");

// The daily scheduled sweep (see netlify.toml for the time). Netlify does not
// let anything call a scheduled function from a web address, so it can only
// run on its schedule — to run one by hand (testing, or re-running after an
// outage) use journal-reminder-run.
function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

exports.handler = async function handler(event) {
  const missingEnv = getMissingEmailEnv(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "EMAIL_LINK_SECRET", "RESEND_API_KEY"]);
  if (missingEnv.length) {
    console.error(`journal-reminder: not configured on this deploy. Missing: ${missingEnv.join(", ")}`);
    return json(503, { error: "Not configured." });
  }

  try {
    const summary = await runSweep({
      today: getTodayEastern(),
      baseUrl: getAppBaseUrl(event),
      linkSecret: process.env.EMAIL_LINK_SECRET,
    });
    return json(200, summary);
  } catch (error) {
    console.error("journal-reminder failed:", error);
    return json(500, { error: "Sweep failed." });
  }
};

exports.getDueEndDate = getDueEndDate;
