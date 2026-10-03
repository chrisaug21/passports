const { EMAIL_KINDS, buildUnsubscribeUrl } = require("./email-prefs.js");
const { sendEmailBatch } = require("./email.js");
const { buildJournalReminderEmail } = require("./journal-reminder-email.js");
const { buildEmailPhoto, heroPhotoParams } = require("./trip-photo.js");
const { MS_PER_DAY, parseDate, toIsoDate, addDays } = require("./trip-dates.js");
const admin = require("./supabase-admin.js");

// The reminder goes out between 7 and 10 days after a trip's last day. The
// window is what makes this safe to run once a day: a missed day (an outage)
// is still caught the next morning, and a trip whose dates are entered or
// edited long after the fact falls outside it and is never emailed.
const MIN_DAYS_AFTER_END = 7;
const MAX_DAYS_AFTER_END = 10;
const KIND = "journal_reminder";

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

function inList(ids) {
  return `in.(${ids.join(",")})`;
}

// Claims this trip+end date. The unique constraint means that if a sweep
// already did (or is doing) this one, nothing is inserted and this returns false.
async function claimReminder(tripId, endDate) {
  const claimed = await admin.insertIgnoringDuplicates(
    "trip_email_sends",
    { trip_id: tripId, kind: KIND, for_end_date: endDate },
    "trip_id,kind,for_end_date"
  );
  return claimed.length > 0;
}

// Gives a claim back so tomorrow's sweep (still inside the window) tries
// again, rather than silently losing this trip's reminders.
async function releaseReminder(tripId, endDate) {
  await admin
    .remove("trip_email_sends", { trip_id: `eq.${tripId}`, kind: `eq.${KIND}`, for_end_date: `eq.${endDate}` })
    .catch((releaseError) => console.error("journal-reminder: couldn't release claim:", releaseError));
}

// Who on this trip should get the reminder, and why anyone was left out.
async function loadRecipientData(tripId) {
  const members = await admin.select("trip_members", {
    select: "user_id",
    trip_id: `eq.${tripId}`,
    deleted_at: "is.null",
  });
  const userIds = [...new Set(members.map((member) => member.user_id))];
  if (!userIds.length) return null;

  const column = EMAIL_KINDS[KIND].column;
  const [profiles, entries, photoUploads, heroRows] = await Promise.all([
    admin.select("user_profiles", { select: `id,first_name,${column}`, id: inList(userIds) }),
    // Someone who has already written in this trip's journal doesn't need
    // reminding.
    admin.select("journal_entries", { select: "user_id", trip_id: `eq.${tripId}`, user_id: inList(userIds), deleted_at: "is.null" }),
    admin.select("journal_item_photos", { select: "user_id", trip_id: `eq.${tripId}`, user_id: inList(userIds), deleted_at: "is.null" }),
    admin.select("trip_photos", heroPhotoParams(tripId)),
  ]);

  return {
    userIds,
    column,
    profileById: new Map(profiles.map((profile) => [profile.id, profile])),
    alreadyJournaled: new Set([...entries, ...photoUploads].map((row) => row.user_id)),
    photo: await buildEmailPhoto(heroRows[0]),
  };
}

// Why a member is left out of the reminder, or null if they should get it.
function getSkipReason(profile, column, userId, alreadyJournaled) {
  // No profile row means they've never touched their settings: default on.
  if (profile && profile[column] === false) return "opted out";
  if (alreadyJournaled.has(userId)) return "already journaled";
  return null;
}

async function buildMessages({ trip, endDate, data, baseUrl, linkSecret, summary }) {
  const messages = [];
  for (const userId of data.userIds) {
    const profile = data.profileById.get(userId);
    const skipReason = getSkipReason(profile, data.column, userId, data.alreadyJournaled);
    if (skipReason) {
      summary.skipped.push(skipReason);
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
      photo: data.photo,
      baseUrl,
      unsubscribeUrl,
    });
    messages.push({ to: email, subject, html, text, unsubscribeUrl });
    summary.recipients.push(email);
  }
  return messages;
}

// Sends the reminder for one trip. Returns a summary row for the sweep report.
async function remindTrip({ trip, endDate, dryRun, baseUrl, linkSecret }) {
  const summary = { tripId: trip.id, title: trip.title, endDate, recipients: [], skipped: [] };

  if (!dryRun && !(await claimReminder(trip.id, endDate))) return { ...summary, skipped: ["already sent"] };

  try {
    const data = await loadRecipientData(trip.id);
    if (!data) return summary;

    const messages = await buildMessages({ trip, endDate, data, baseUrl, linkSecret, summary });
    if (dryRun) return summary;

    if (!(await sendEmailBatch(messages))) throw new Error("Resend rejected the batch.");
    return summary;
  } catch (error) {
    console.error(`journal-reminder: trip ${trip.id} failed:`, error);
    if (!dryRun) await releaseReminder(trip.id, endDate);
    return { ...summary, recipients: [], skipped: [...summary.skipped, "failed — will retry next sweep"] };
  }
}

// One sweep: find every trip due today and send its reminder. Shared by the
// daily scheduled function and the secret-protected manual trigger.
//   today          YYYY-MM-DD, the day to treat as "today"
//   dryRun         work out who would be emailed, but claim and send nothing
//   onlyTripFilter a PostgREST id filter ("eq.<uuid>") to limit to one trip
async function runSweep({ today, dryRun = false, onlyTripFilter = null, baseUrl, linkSecret }) {
  // Only trips that started at least MIN days ago can be due (the end date is
  // never before the start date). Whether one is really due, and hasn't been
  // reminded for its current end date, is worked out below.
  const candidates = await admin.select("trips", {
    select: "id,title,start_date,trip_length",
    deleted_at: "is.null",
    journal_reminders_enabled: "eq.true",
    start_date: `lte.${addDays(today, -MIN_DAYS_AFTER_END)}`,
    ...(onlyTripFilter ? { id: onlyTripFilter } : {}),
  });

  const due = candidates
    .map((trip) => ({ trip, endDate: getDueEndDate(trip, today) }))
    .filter((entry) => entry.endDate);

  const results = [];
  for (const { trip, endDate } of due) {
    results.push(await remindTrip({ trip, endDate, dryRun, baseUrl, linkSecret }));
  }

  const emails = results.reduce((total, result) => total + result.recipients.length, 0);
  console.log(`journal-reminder: ${today}${dryRun ? " (dry run)" : ""} — ${due.length} trip(s) due, ${emails} email(s)`);
  return { today, dryRun, tripsDue: due.length, emails, results };
}

module.exports = { runSweep, getDueEndDate };
