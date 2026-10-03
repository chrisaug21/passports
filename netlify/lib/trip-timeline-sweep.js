const { EMAIL_KINDS, buildUnsubscribeUrl } = require("./email-prefs.js");
const { sendEmailBatch } = require("./email.js");
const { buildTripDayTwoEmail } = require("./trip-day-two-email.js");
const { buildTripStartsSoonEmail } = require("./trip-starts-soon-email.js");
const { buildEmailPhoto, heroPhotoParams } = require("./trip-photo.js");
const { addDays } = require("./trip-dates.js");
const admin = require("./supabase-admin.js");

// The two emails that hang off a trip's calendar, both sent on the traveler's
// LOCAL clock. Netlify schedules run in UTC, so this sweep runs every hour and
// each trip is checked against the time it is where the traveler will be.
//
//   trip_day_two      the evening of day 2 (a nudge to start journaling)
//   trip_starts_soon  the morning 3 days before day 1 (Guide link + open to-dos)
//
// A window (not an exact hour) is what makes an hourly run safe: if one run is
// missed, the next hour still lands inside the window. `trip_email_sends`
// keeps a trip from being emailed twice for the same date.
const DEFAULT_TIMEZONE = "America/New_York";
const DAY_TWO_WINDOW = { fromHour: 19, beforeHour: 23 };
const STARTS_SOON_WINDOW = { fromHour: 9, beforeHour: 12 };
const STARTS_SOON_DAYS_AHEAD = 3;
const MIN_TRIP_LENGTH_FOR_DAY_TWO = 3;
const PACKING_SECTION = "Packing";

function inList(ids) {
  return `in.(${ids.join(",")})`;
}

// The calendar date (YYYY-MM-DD) and hour (0-23) at `timeZone` right now. A
// timezone the system doesn't recognize falls back to the default rather than
// failing the whole sweep.
function getLocalDateAndHour(now, timeZone) {
  const read = (zone) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const value = (type) => parts.find((part) => part.type === type).value;
    return { date: `${value("year")}-${value("month")}-${value("day")}`, hour: Number(value("hour")) };
  };
  try {
    return read(timeZone || DEFAULT_TIMEZONE);
  } catch {
    return read(DEFAULT_TIMEZONE);
  }
}

// The timezone where the traveler is on trip day `dayNumber`: that day's base,
// else the trip's first base, else the default.
function getTripTimezone({ bases, days }, dayNumber) {
  const day = days.find((candidate) => Number(candidate.day_number) === dayNumber);
  const dayBase = day && bases.find((base) => base.id === day.base_id);
  return (dayBase || bases[0])?.local_timezone || DEFAULT_TIMEZONE;
}

// What would be sent for this trip right now, or null. Returns the date the
// send is "for" (the day-2 date / the start date) — the key in trip_email_sends.
function getDueSend(kind, trip, geography, now) {
  if (kind === "trip_day_two") {
    if (Number(trip.trip_length) < MIN_TRIP_LENGTH_FOR_DAY_TWO) return null;
    const forDate = addDays(trip.start_date, 1);
    const local = getLocalDateAndHour(now, getTripTimezone(geography, 2));
    const inWindow = local.hour >= DAY_TWO_WINDOW.fromHour && local.hour < DAY_TWO_WINDOW.beforeHour;
    return local.date === forDate && inWindow ? forDate : null;
  }

  const local = getLocalDateAndHour(now, getTripTimezone(geography, 1));
  const inWindow = local.hour >= STARTS_SOON_WINDOW.fromHour && local.hour < STARTS_SOON_WINDOW.beforeHour;
  return local.date === addDays(trip.start_date, -STARTS_SOON_DAYS_AHEAD) && inWindow ? trip.start_date : null;
}

// Claims this trip+kind+date. The unique constraint means that if a sweep
// already did (or is doing) this one, nothing is inserted and this returns false.
async function claimSend(tripId, kind, forDate) {
  const claimed = await admin.insertIgnoringDuplicates(
    "trip_email_sends",
    { trip_id: tripId, kind, for_end_date: forDate },
    "trip_id,kind,for_end_date"
  );
  return claimed.length > 0;
}

// Gives a claim back so the next hourly run (still inside the window) tries
// again, rather than silently losing this trip's email.
async function releaseSend(tripId, kind, forDate) {
  await admin
    .remove("trip_email_sends", { trip_id: `eq.${tripId}`, kind: `eq.${kind}`, for_end_date: `eq.${forDate}` })
    .catch((releaseError) => console.error("trip-timeline: couldn't release claim:", releaseError));
}

async function loadRecipientData(kind, tripId) {
  const members = await admin.select("trip_members", { select: "user_id", trip_id: `eq.${tripId}`, deleted_at: "is.null" });
  const userIds = [...new Set(members.map((member) => member.user_id))];
  if (!userIds.length) return null;

  const column = EMAIL_KINDS[kind].column;
  const [profiles, entries, photoUploads, heroRows, todos] = await Promise.all([
    admin.select("user_profiles", { select: `id,first_name,${column}`, id: inList(userIds) }),
    // Someone who has already written in this trip's journal doesn't need the
    // day-2 nudge.
    kind === "trip_day_two"
      ? admin.select("journal_entries", { select: "user_id", trip_id: `eq.${tripId}`, user_id: inList(userIds), deleted_at: "is.null" })
      : [],
    kind === "trip_day_two"
      ? admin.select("journal_item_photos", { select: "user_id", trip_id: `eq.${tripId}`, user_id: inList(userIds), deleted_at: "is.null" })
      : [],
    admin.select("trip_photos", heroPhotoParams(tripId)),
    // To-dos belong to the trip, not a person, so everyone sees the same list.
    kind === "trip_starts_soon"
      ? admin.select("trip_todos", {
          select: "title,section,due_phase,created_at",
          trip_id: `eq.${tripId}`,
          deleted_at: "is.null",
          is_complete: "eq.false",
          order: "created_at.asc",
        })
      : [],
  ]);

  // Packing is just the to-dos in the "Packing" section; everything else
  // still due before the trip is "still to do".
  const openPacking = todos.filter((todo) => todo.section === PACKING_SECTION).map((todo) => todo.title);
  const openTodos = todos.filter((todo) => todo.section !== PACKING_SECTION && todo.due_phase === "before_trip").map((todo) => todo.title);

  return {
    userIds,
    column,
    profileById: new Map(profiles.map((profile) => [profile.id, profile])),
    alreadyJournaled: new Set([...entries, ...photoUploads].map((row) => row.user_id)),
    photo: await buildEmailPhoto(heroRows[0]),
    openTodos,
    openPacking,
  };
}

// Why a member is left out, or null if they should get the email.
function getSkipReason(profile, column, userId, alreadyJournaled) {
  // No profile row means they've never touched their settings: default on.
  if (profile && profile[column] === false) return "opted out";
  if (alreadyJournaled.has(userId)) return "already journaled";
  return null;
}

async function buildMessages({ kind, trip, data, baseUrl, linkSecret, summary }) {
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

    const unsubscribeUrl = buildUnsubscribeUrl(baseUrl, userId, kind, linkSecret);
    const common = { trip, recipientFirstName: profile?.first_name, photo: data.photo, baseUrl, unsubscribeUrl };
    const { subject, html, text } =
      kind === "trip_day_two"
        ? buildTripDayTwoEmail(common)
        : buildTripStartsSoonEmail({ ...common, openTodos: data.openTodos, openPacking: data.openPacking });
    messages.push({ to: email, subject, html, text, unsubscribeUrl });
    summary.recipients.push(email);
  }
  return messages;
}

async function sendForTrip({ kind, trip, forDate, dryRun, baseUrl, linkSecret }) {
  const summary = { kind, tripId: trip.id, title: trip.title, forDate, recipients: [], skipped: [] };

  if (!dryRun && !(await claimSend(trip.id, kind, forDate))) return { ...summary, skipped: ["already sent"] };

  try {
    const data = await loadRecipientData(kind, trip.id);
    if (!data) return summary;

    const messages = await buildMessages({ kind, trip, data, baseUrl, linkSecret, summary });
    if (dryRun) return summary;

    if (!(await sendEmailBatch(messages))) throw new Error("Resend rejected the batch.");
    return summary;
  } catch (error) {
    console.error(`trip-timeline: ${kind} for trip ${trip.id} failed:`, error);
    if (!dryRun) await releaseSend(trip.id, kind, forDate);
    return { ...summary, recipients: [], skipped: [...summary.skipped, "failed — will retry next run"] };
  }
}

// Bases and the day-1/day-2 rows for a set of trips, grouped by trip id.
async function loadGeography(tripIds) {
  const [bases, days] = await Promise.all([
    admin.select("trip_bases", { select: "id,trip_id,local_timezone,sort_order", trip_id: inList(tripIds), deleted_at: "is.null", order: "sort_order.asc" }),
    admin.select("trip_days", { select: "trip_id,base_id,day_number", trip_id: inList(tripIds), day_number: "in.(1,2)", deleted_at: "is.null" }),
  ]);
  const byTrip = new Map(tripIds.map((id) => [id, { bases: [], days: [] }]));
  bases.forEach((base) => byTrip.get(base.trip_id)?.bases.push(base));
  days.forEach((day) => byTrip.get(day.trip_id)?.days.push(day));
  return byTrip;
}

// One sweep: find every trip whose local moment has arrived and send its
// email. Shared by the hourly scheduled function and the manual trigger.
//   now            a Date, the instant to treat as "now"
//   dryRun         work out who would be emailed, but claim and send nothing
//   onlyTripFilter a PostgREST id filter ("eq.<uuid>") to limit to one trip
//   onlyKind       "trip_day_two" or "trip_starts_soon" to run just one
async function runSweep({ now = new Date(), dryRun = false, onlyTripFilter = null, onlyKind = null, baseUrl, linkSecret }) {
  // Local dates differ from the UTC date by at most a day either way, so
  // trips starting from 2 days before to 4 days after UTC "today" are the only
  // ones that can be due; the exact local check happens below.
  const utcToday = now.toISOString().slice(0, 10);
  const candidates = await admin.select("trips", {
    select: "id,title,start_date,trip_length,status",
    deleted_at: "is.null",
    journal_reminders_enabled: "eq.true",
    // Planning and active trips only: a Wishlist ("destinations") entry can pick
    // up a start date in trip settings without being promoted, and a done trip
    // is over.
    status: "in.(planning,active)",
    and: `(start_date.gte.${addDays(utcToday, -2)},start_date.lte.${addDays(utcToday, STARTS_SOON_DAYS_AHEAD + 1)})`,
    ...(onlyTripFilter ? { id: onlyTripFilter } : {}),
  });

  const kinds = onlyKind ? [onlyKind] : ["trip_day_two", "trip_starts_soon"];
  const geography = candidates.length ? await loadGeography(candidates.map((trip) => trip.id)) : new Map();

  const due = [];
  for (const trip of candidates) {
    for (const kind of kinds) {
      const forDate = getDueSend(kind, trip, geography.get(trip.id), now);
      if (forDate) due.push({ kind, trip, forDate });
    }
  }

  const results = [];
  for (const entry of due) {
    results.push(await sendForTrip({ ...entry, dryRun, baseUrl, linkSecret }));
  }

  const emails = results.reduce((total, result) => total + result.recipients.length, 0);
  // Quiet hours (nothing due) are the normal case — only log when something is.
  if (due.length) console.log(`trip-timeline: ${now.toISOString()}${dryRun ? " (dry run)" : ""} — ${due.length} due, ${emails} email(s)`);
  return { now: now.toISOString(), dryRun, due: due.length, emails, results };
}

module.exports = { runSweep, getDueSend, getLocalDateAndHour };
