const crypto = require("crypto");
const { EMAIL_KINDS, buildUnsubscribeUrl } = require("../lib/email-prefs.js");
const { getMissingEmailEnv, getAppBaseUrl, sendEmailBatch } = require("../lib/email.js");
const { buildJournalReminderEmail } = require("../lib/journal-reminder-email.js");
const { buildEmailPhoto, heroPhotoParams } = require("../lib/trip-photo.js");
const { MS_PER_DAY, parseDate, toIsoDate, addDays, getTodayEastern } = require("../lib/trip-dates.js");
const admin = require("../lib/supabase-admin.js");

// The reminder goes out between 7 and 10 days after a trip's last day. The
// window is what makes this safe to run once a day: a missed day (an outage)
// is still caught the next morning, and a trip whose dates are entered or
// edited long after the fact falls outside it and is never emailed.
const MIN_DAYS_AFTER_END = 7;
const MAX_DAYS_AFTER_END = 10;
const KIND = "journal_reminder";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}

// A trip's end date is never stored — it's start date + trip length - 1 —
// so it's worked out fresh every sweep. That's how date edits are picked up
// with no extra bookkeeping.
function getTripEndDate(trip) {
  const start = parseDate(trip.start_date);
  const length = Number(trip.trip_length);
  if (!start || !Number.isInteger(length) || length < 1) return null;
  return toIsoDate(new Date(start.getTime() + (length - 1) * MS_PER_DAY));
}

function daysBetween(fromIso, toIso) {
  return Math.round((parseDate(toIso).getTime() - parseDate(fromIso).getTime()) / MS_PER_DAY);
}

// Returns the end date this trip's reminder would cover, or null if the trip
// isn't due today.
function getDueEndDate(trip, today) {
  const endDate = getTripEndDate(trip);
  if (!endDate) return null;
  const daysAfterEnd = daysBetween(endDate, today);
  return daysAfterEnd >= MIN_DAYS_AFTER_END && daysAfterEnd <= MAX_DAYS_AFTER_END ? endDate : null;
}

// Real sweeps (the daily schedule, or anyone hitting the URL) always use the
// real date and really send. Testing overrides — a pretend "today", a dry
// run, a single trip — need the secret, since they could otherwise be used to
// poke at the system.
function isAuthorizedForOverrides(event) {
  const secret = process.env.EMAIL_LINK_SECRET || "";
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  const provided = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return secret.length > 0 && provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function inList(ids) {
  return `in.(${ids.join(",")})`;
}

// Sends the reminder for one trip. Returns a summary row for the sweep report.
async function remindTrip({ trip, endDate, dryRun, baseUrl, linkSecret }) {
  const summary = { tripId: trip.id, title: trip.title, endDate, recipients: [], skipped: [] };

  // Claim this trip+end date. The unique constraint means that if a sweep
  // already did (or is doing) this one, nothing is inserted and we stop.
  if (!dryRun) {
    const claimed = await admin.insertIgnoringDuplicates(
      "trip_email_sends",
      { trip_id: trip.id, kind: KIND, for_end_date: endDate },
      "trip_id,kind,for_end_date"
    );
    if (!claimed.length) return { ...summary, skipped: ["already sent"] };
  }

  try {
    const members = await admin.select("trip_members", {
      select: "user_id",
      trip_id: `eq.${trip.id}`,
      deleted_at: "is.null",
    });
    const userIds = [...new Set(members.map((member) => member.user_id))];
    if (!userIds.length) return summary;

    const column = EMAIL_KINDS[KIND].column;
    const [profiles, entries, photoUploads, heroRows] = await Promise.all([
      admin.select("user_profiles", { select: `id,first_name,${column}`, id: inList(userIds) }),
      // Someone who has already written in this trip's journal doesn't need
      // reminding.
      admin.select("journal_entries", { select: "user_id", trip_id: `eq.${trip.id}`, user_id: inList(userIds), deleted_at: "is.null" }),
      admin.select("journal_item_photos", { select: "user_id", trip_id: `eq.${trip.id}`, user_id: inList(userIds), deleted_at: "is.null" }),
      admin.select("trip_photos", heroPhotoParams(trip.id)),
    ]);

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const alreadyJournaled = new Set([...entries, ...photoUploads].map((row) => row.user_id));
    const photo = await buildEmailPhoto(heroRows[0]);

    const messages = [];
    for (const userId of userIds) {
      const profile = profileById.get(userId);
      // No profile row means they've never touched their settings: default on.
      if (profile && profile[column] === false) {
        summary.skipped.push("opted out");
        continue;
      }
      if (alreadyJournaled.has(userId)) {
        summary.skipped.push("already journaled");
        continue;
      }

      const email = await admin.getEmailForUser(userId);
      if (!email) {
        summary.skipped.push("no email on file");
        continue;
      }

      const unsubscribeUrl = buildUnsubscribeUrl(baseUrl, userId, KIND, linkSecret);
      const { subject, html, text } = buildJournalReminderEmail({
        trip,
        endDate,
        recipientFirstName: profile?.first_name,
        photo,
        baseUrl,
        unsubscribeUrl,
      });
      messages.push({ to: email, subject, html, text, unsubscribeUrl });
      summary.recipients.push(email);
    }

    if (dryRun) return summary;

    const sent = await sendEmailBatch(messages);
    if (!sent) throw new Error("Resend rejected the batch.");
    return summary;
  } catch (error) {
    // Give the claim back so tomorrow's sweep (still inside the window) tries
    // again, rather than silently losing this trip's reminders.
    console.error(`journal-reminder: trip ${trip.id} failed:`, error);
    if (!dryRun) {
      await admin
        .remove("trip_email_sends", { trip_id: `eq.${trip.id}`, kind: `eq.${KIND}`, for_end_date: `eq.${endDate}` })
        .catch((releaseError) => console.error("journal-reminder: couldn't release claim:", releaseError));
    }
    return { ...summary, recipients: [], skipped: [...summary.skipped, "failed — will retry next sweep"] };
  }
}

exports.handler = async function handler(event) {
  const missingEnv = getMissingEmailEnv(["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "EMAIL_LINK_SECRET", "RESEND_API_KEY"]);
  if (missingEnv.length) {
    console.error(`journal-reminder: not configured on this deploy. Missing: ${missingEnv.join(", ")}`);
    return json(503, { error: "Not configured." });
  }

  const query = event.queryStringParameters || {};
  const wantsOverrides = Boolean(query.today || query.dry_run || query.trip);
  if (wantsOverrides && !isAuthorizedForOverrides(event)) return json(401, { error: "Not allowed." });

  const today = query.today && /^\d{4}-\d{2}-\d{2}$/.test(query.today) ? query.today : getTodayEastern();
  const dryRun = query.dry_run === "1";
  const onlyTripId = query.trip || null;
  const baseUrl = getAppBaseUrl();
  const linkSecret = process.env.EMAIL_LINK_SECRET;

  try {
    // Only trips that started at least MIN days ago can be due (the end date
    // is never before the start date). Whether one is really due, and hasn't
    // been reminded for its current end date, is worked out below.
    const candidates = await admin.select("trips", {
      select: "id,title,start_date,trip_length",
      deleted_at: "is.null",
      journal_reminders_enabled: "eq.true",
      start_date: `lte.${addDays(today, -MIN_DAYS_AFTER_END)}`,
      ...(onlyTripId ? { id: `eq.${onlyTripId}` } : {}),
    });

    const due = candidates
      .map((trip) => ({ trip, endDate: getDueEndDate(trip, today) }))
      .filter((entry) => entry.endDate);

    const results = [];
    for (const { trip, endDate } of due) {
      results.push(await remindTrip({ trip, endDate, dryRun, baseUrl, linkSecret }));
    }

    const sentCount = results.reduce((total, result) => total + result.recipients.length, 0);
    console.log(`journal-reminder: ${today}${dryRun ? " (dry run)" : ""} — ${due.length} trip(s) due, ${sentCount} email(s)`);
    return json(200, { today, dryRun, tripsDue: due.length, emails: sentCount, results });
  } catch (error) {
    console.error("journal-reminder failed:", error);
    return json(500, { error: "Sweep failed." });
  }
};

exports.getDueEndDate = getDueEndDate;
