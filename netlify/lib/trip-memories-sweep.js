const crypto = require("crypto");
const { EMAIL_KINDS, buildUnsubscribeUrl, buildSettingsUrl } = require("./email-prefs.js");
const { sendEmailBatch } = require("./email.js");
const { buildTripMemoriesEmail } = require("./trip-memories-email.js");
const { buildTripJournalNudgeEmail } = require("./trip-journal-nudge-email.js");
const { buildEmailPhoto, heroPhotoParams } = require("./trip-photo.js");
const { MS_PER_DAY, parseDate, formatShortDate, addDays } = require("./trip-dates.js");
const admin = require("./supabase-admin.js");

// The "X years ago today" emails. The unit is a trip DAY: on the calendar date
// of a day from a past trip (same month and day, an earlier year), each member
// gets a look back at that day.
//
//   trip_memories       the day has journal memories: show one, link to the day
//   trip_journal_nudge  the whole trip's journal is empty: ask for a memory
//
// Both are controlled by the one `email_trip_memories` switch and share the
// person-level limits below. Everything is worked out fresh each run from the
// trip's dates and the journal, and `user_email_sends` is both the log that
// prevents repeats and the history the rotation and spacing rules read.
const MEMORIES_KIND = "trip_memories";
const NUDGE_KIND = "trip_journal_nudge";

// No person gets two emails of EITHER kind closer together than this.
const MIN_DAYS_BETWEEN = 14;
// The empty-journal nudge is the one most likely to feel naggy, so it also has
// its own, longer spacing: at most one every six weeks per person.
const NUDGE_MIN_DAYS_BETWEEN = 42;
const EXCERPT_LENGTH = 200;
const BATCH_SIZE = 100;

function inList(ids) {
  return `in.(${ids.join(",")})`;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysBetween(fromIso, toIso) {
  return Math.round((parseDate(toIso).getTime() - parseDate(fromIso).getTime()) / MS_PER_DAY);
}

// Is `dayDate` (YYYY-MM-DD) an anniversary of `today`: the same month and day
// in an earlier year? A Feb 29 day is marked on Feb 28 in non-leap years.
function isAnniversary(dayDate, today) {
  const dayYear = Number(dayDate.slice(0, 4));
  const todayYear = Number(today.slice(0, 4));
  if (dayYear >= todayYear) return false;
  const dayMonthDay = dayDate.slice(5);
  const todayMonthDay = today.slice(5);
  if (dayMonthDay === todayMonthDay) return true;
  return dayMonthDay === "02-29" && todayMonthDay === "02-28" && !isLeapYear(todayYear);
}

// A stable pseudo-random ordering key: the same inputs always give the same
// answer, so a day's pick doesn't change between daily runs until it is sent.
function stableHash(...parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function pickFirst(list, sortKeys) {
  return [...list].sort((a, b) => {
    const [aLast, aHash] = sortKeys(a);
    const [bLast, bHash] = sortKeys(b);
    // Not `aLast - bLast`: two "never sent" values are -Infinity, and
    // -Infinity - -Infinity is NaN.
    if (aLast !== bLast) return aLast < bLast ? -1 : 1;
    return aHash < bHash ? -1 : aHash > bHash ? 1 : 0;
  })[0];
}

function memoryCountText(count, own) {
  const noun = count === 1 ? "memory" : "memories";
  return own ? `You saved ${count} ${noun} on this day.` : `${count} ${noun} saved on this day.`;
}

// One tidy ~200 character excerpt, cut at a word boundary.
function makeExcerpt(notes) {
  const text = String(notes || "").replace(/\s+/g, " ").trim();
  if (text.length <= EXCERPT_LENGTH) return text;
  const cut = text.slice(0, EXCERPT_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), EXCERPT_LENGTH / 2)).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

// Trips with a day on today's month/day in an earlier year, plus everything
// needed to judge them. A trip's whole span is loaded (not just the matching
// day) because which day is "featured" is chosen from all of its days.
async function loadTrips({ today, onlyTripFilter }) {
  const todayYear = Number(today.slice(0, 4));
  const trips = await admin.select("trips", {
    select: "id,title,start_date,trip_length",
    deleted_at: "is.null",
    status: "eq.done",
    // A matching day must fall in an earlier year, so a trip that started this
    // year can't be due.
    start_date: `lt.${todayYear}-01-01`,
    ...(onlyTripFilter ? { id: onlyTripFilter } : {}),
  });

  const spansToday = (trip) => {
    const length = Number(trip.trip_length);
    if (!parseDate(trip.start_date) || !Number.isInteger(length) || length < 1) return false;
    for (let offset = 0; offset < length; offset += 1) {
      if (isAnniversary(addDays(trip.start_date, offset), today)) return true;
    }
    return false;
  };
  return trips.filter(spansToday);
}

async function loadTripDetails(trips) {
  const tripIds = trips.map((trip) => trip.id);
  const tripFilter = inList(tripIds);
  const [days, bases, members, items, entries, photos] = await Promise.all([
    admin.select("trip_days", { select: "id,trip_id,base_id,day_number,location_name", trip_id: tripFilter, deleted_at: "is.null", order: "day_number.asc" }),
    admin.select("trip_bases", { select: "id,trip_id,name,location_name", trip_id: tripFilter, deleted_at: "is.null" }),
    admin.select("trip_members", { select: "trip_id,user_id", trip_id: tripFilter, deleted_at: "is.null" }),
    admin.select("trip_items", { select: "id,trip_id,day_id", trip_id: tripFilter, deleted_at: "is.null" }),
    admin.select("journal_entries", { select: "trip_id,day_id,item_id,user_id,notes", trip_id: tripFilter, deleted_at: "is.null", order: "created_at.asc" }),
    admin.select("journal_item_photos", { select: "trip_id,item_id,user_id,public_url", trip_id: tripFilter, deleted_at: "is.null", order: "created_at.asc" }),
  ]);

  const itemDay = new Map(items.map((item) => [item.id, item.day_id]));
  const baseById = new Map(bases.map((base) => [base.id, base]));

  const byTrip = new Map(
    trips.map((trip) => [trip.id, { trip, days: [], memberIds: new Set(), memoriesByDay: new Map(), totalMemories: 0 }])
  );
  const memoriesFor = (detail, dayId) => {
    if (!detail.memoriesByDay.has(dayId)) detail.memoriesByDay.set(dayId, { entries: [], photos: [] });
    return detail.memoriesByDay.get(dayId);
  };

  for (const day of days) {
    const detail = byTrip.get(day.trip_id);
    if (!detail) continue;
    const base = baseById.get(day.base_id);
    detail.days.push({ ...day, date: addDays(detail.trip.start_date, Number(day.day_number) - 1), place: base?.name || base?.location_name || day.location_name || "" });
  }
  for (const member of members) byTrip.get(member.trip_id)?.memberIds.add(member.user_id);

  // A memory belongs to a day directly (a day note) or through an item on it.
  for (const entry of entries) {
    const detail = byTrip.get(entry.trip_id);
    const dayId = entry.day_id || itemDay.get(entry.item_id);
    if (!detail) continue;
    detail.totalMemories += 1;
    if (dayId) memoriesFor(detail, dayId).entries.push(entry);
  }
  for (const photo of photos) {
    const detail = byTrip.get(photo.trip_id);
    const dayId = itemDay.get(photo.item_id);
    if (!detail) continue;
    detail.totalMemories += 1;
    if (dayId) memoriesFor(detail, dayId).photos.push(photo);
  }

  return byTrip;
}

async function loadPeople(userIds, authorIds) {
  const column = EMAIL_KINDS[MEMORIES_KIND].column;
  const everyone = [...new Set([...userIds, ...authorIds])];
  const [profiles, sends] = await Promise.all([
    admin.select("user_profiles", { select: `id,first_name,${column}`, id: inList(everyone) }),
    admin.select("user_email_sends", { select: "user_id,kind,trip_id,day_id,for_year,sent_at", user_id: inList(userIds), kind: `in.(${MEMORIES_KIND},${NUDGE_KIND})` }),
  ]);
  return {
    column,
    profileById: new Map(profiles.map((profile) => [profile.id, profile])),
    sendsByUser: userIds.reduce((map, id) => map.set(id, sends.filter((row) => row.user_id === id)), new Map()),
  };
}

// ---------------------------------------------------------------------------
// Choosing what each person gets
// ---------------------------------------------------------------------------

function latestSent(sends, predicate) {
  return sends.filter(predicate).reduce((latest, row) => Math.max(latest, Date.parse(row.sent_at)), -Infinity);
}

// What (if anything) this person is due on `today`, and why not otherwise.
// Returns { pick } or { skipped }.
function chooseForPerson({ userId, details, sends, today }) {
  const year = Number(today.slice(0, 4));
  const memoryCandidates = [];
  const nudgeCandidates = [];

  for (const detail of details) {
    if (!detail.memberIds.has(userId)) continue;
    const { trip } = detail;
    // One email per trip per person per year, whichever day was featured.
    if (sends.some((row) => row.trip_id === trip.id && row.for_year === year)) continue;

    const usableDays = detail.days.filter((day) => Number(day.date.slice(0, 4)) < year);
    if (detail.totalMemories > 0) {
      // Days worth looking back at, least recently shown to this person first.
      const withMemories = usableDays.filter((day) => detail.memoriesByDay.has(day.id));
      if (!withMemories.length) continue;
      const featured = pickFirst(withMemories, (day) => [
        latestSent(sends, (row) => row.kind === MEMORIES_KIND && row.day_id === day.id),
        stableHash(userId, trip.id, year, day.id),
      ]);
      if (isAnniversary(featured.date, today)) memoryCandidates.push({ detail, day: featured });
    } else if (usableDays.length) {
      // No memories to rank by: the stable hash alone varies the day by year.
      const featured = pickFirst(usableDays, (day) => [0, stableHash(userId, trip.id, year, day.id)]);
      if (isAnniversary(featured.date, today)) nudgeCandidates.push({ detail, day: featured });
    }
  }

  if (!memoryCandidates.length && !nudgeCandidates.length) return { skipped: null };

  const lastAny = latestSent(sends, () => true);
  if (lastAny > -Infinity && daysBetween(new Date(lastAny).toISOString().slice(0, 10), today) < MIN_DAYS_BETWEEN) {
    return { skipped: `within ${MIN_DAYS_BETWEEN} days of their last memory email` };
  }

  // Trips not featured to this person before come first (a never-sent trip
  // sorts as -Infinity), then the stable hash settles ties.
  const rank = (kind) => ({ detail }) => [
    latestSent(sends, (row) => row.kind === kind && row.trip_id === detail.trip.id),
    stableHash(userId, detail.trip.id, year, "trip"),
  ];
  if (memoryCandidates.length) return { pick: { kind: MEMORIES_KIND, ...pickFirst(memoryCandidates, rank(MEMORIES_KIND)) } };

  const lastNudge = latestSent(sends, (row) => row.kind === NUDGE_KIND);
  if (lastNudge > -Infinity && daysBetween(new Date(lastNudge).toISOString().slice(0, 10), today) < NUDGE_MIN_DAYS_BETWEEN) {
    return { skipped: `within ${NUDGE_MIN_DAYS_BETWEEN} days of their last "add your memories" nudge` };
  }
  return { pick: { kind: NUDGE_KIND, ...pickFirst(nudgeCandidates, rank(NUDGE_KIND)) } };
}

// ---------------------------------------------------------------------------
// Building and sending
// ---------------------------------------------------------------------------

function displayName(profile) {
  return profile?.first_name || "Someone on the trip";
}

async function buildMessage({ pick, userId, today, people, heroPhotoFor, baseUrl, linkSecret }) {
  const { detail, day, kind } = pick;
  const { trip } = detail;
  const profile = people.profileById.get(userId);
  const email = await admin.getEmailForUser(userId);
  if (!email) return null;

  const yearsAgo = Number(today.slice(0, 4)) - Number(day.date.slice(0, 4));
  const place = day.place || trip.title;
  const dateLabel = formatShortDate(parseDate(day.date), true);
  const unsubscribeUrl = buildUnsubscribeUrl(baseUrl, userId, MEMORIES_KIND, linkSecret);
  const common = {
    trip,
    recipientFirstName: profile?.first_name,
    yearsAgo,
    place,
    dayNumber: day.day_number,
    dateLabel,
    baseUrl,
    unsubscribeUrl,
    settingsUrl: buildSettingsUrl(baseUrl, userId, linkSecret),
  };

  let built;
  if (kind === NUDGE_KIND) {
    built = buildTripJournalNudgeEmail({ ...common, photo: await heroPhotoFor(trip.id) });
  } else {
    const memories = detail.memoriesByDay.get(day.id);
    const own = (row) => row.user_id === userId;
    const withNotes = memories.entries.filter((entry) => String(entry.notes || "").trim());
    const noteRow = withNotes.find(own) || withNotes[0];
    const excerpt = noteRow
      ? { text: makeExcerpt(noteRow.notes), authorName: own(noteRow) ? null : displayName(people.profileById.get(noteRow.user_id)) }
      : null;
    const ownCount = memories.entries.filter(own).length + memories.photos.filter(own).length;
    const total = memories.entries.length + memories.photos.length;
    const dayPhoto = memories.photos.filter((photo) => photo.public_url);
    const chosenPhoto = dayPhoto.find(own) || dayPhoto[0];

    built = buildTripMemoriesEmail({
      ...common,
      photo: chosenPhoto ? { url: chosenPhoto.public_url, creditName: null } : await heroPhotoFor(trip.id),
      excerpt,
      countLine: ownCount ? memoryCountText(ownCount, true) : memoryCountText(total, false),
    });
  }

  return {
    message: { to: email, subject: built.subject, html: built.html, text: built.text, unsubscribeUrl },
    claim: { user_id: userId, kind, trip_id: trip.id, day_id: day.id, for_year: Number(today.slice(0, 4)) },
    report: { kind, tripId: trip.id, title: trip.title, dayNumber: day.day_number, recipient: email },
  };
}

async function claimSend(claim) {
  const claimed = await admin.insertIgnoringDuplicates("user_email_sends", claim, "user_id,kind,trip_id,for_year");
  return claimed.length > 0;
}

// Gives a claim back after a failed send so a later run can try again.
async function releaseSend(claim) {
  await admin
    .remove("user_email_sends", { user_id: `eq.${claim.user_id}`, kind: `eq.${claim.kind}`, trip_id: `eq.${claim.trip_id}`, for_year: `eq.${claim.for_year}` })
    .catch((releaseError) => console.error("trip-memories: couldn't release claim:", releaseError));
}

// Claims and sends in batches of up to 100. A failed batch releases only its
// own claims, so a batch that already went out isn't sent again.
async function claimAndSend(entries) {
  const sent = [];
  const failed = [];
  for (let index = 0; index < entries.length; index += BATCH_SIZE) {
    const claimed = [];
    for (const entry of entries.slice(index, index + BATCH_SIZE)) {
      if (await claimSend(entry.claim)) claimed.push(entry);
      else failed.push({ ...entry.report, skipped: "already sent" });
    }
    if (!claimed.length) continue;

    let ok = false;
    try {
      ok = await sendEmailBatch(claimed.map((entry) => entry.message));
    } catch (error) {
      console.error("trip-memories: batch threw:", error);
    }
    if (ok) {
      sent.push(...claimed);
    } else {
      for (const entry of claimed) {
        await releaseSend(entry.claim);
        failed.push({ ...entry.report, skipped: "failed to send" });
      }
    }
  }
  return { sent, failed };
}

// One sweep. Shared by the daily scheduled function and the manual trigger.
//   today          YYYY-MM-DD (US Eastern), the date to treat as "today"
//   dryRun         work out who would be emailed, but claim and send nothing
//   onlyTripFilter a PostgREST id filter ("eq.<uuid>") to limit to one trip
//   onlyUserId     a user id to limit to one person
async function runSweep({ today, dryRun = false, onlyTripFilter = null, onlyUserId = null, baseUrl, linkSecret }) {
  const empty = { today, dryRun, tripsDue: 0, emails: 0, results: [] };
  const trips = await loadTrips({ today, onlyTripFilter });
  if (!trips.length) return empty;

  const detailsByTrip = await loadTripDetails(trips);
  const details = [...detailsByTrip.values()];
  const userIds = [...new Set(details.flatMap((detail) => [...detail.memberIds]))].filter((id) => !onlyUserId || id === onlyUserId);
  if (!userIds.length) return { ...empty, tripsDue: trips.length };

  const authorIds = details.flatMap((detail) => [...detail.memoriesByDay.values()].flatMap((m) => m.entries.map((entry) => entry.user_id)));
  const people = await loadPeople(userIds, authorIds);

  const heroCache = new Map();
  const heroPhotoFor = (tripId) => {
    if (!heroCache.has(tripId)) {
      heroCache.set(tripId, admin.select("trip_photos", heroPhotoParams(tripId)).then((rows) => buildEmailPhoto(rows[0])));
    }
    return heroCache.get(tripId);
  };

  const results = [];
  const entries = [];
  for (const userId of userIds) {
    const profile = people.profileById.get(userId);
    // No profile row means they've never touched their settings: default on.
    if (profile && profile[people.column] === false) continue;

    const choice = chooseForPerson({ userId, details, sends: people.sendsByUser.get(userId) || [], today });
    if (choice.skipped) results.push({ userId, skipped: choice.skipped });
    if (!choice.pick) continue;

    try {
      const built = await buildMessage({ pick: choice.pick, userId, today, people, heroPhotoFor, baseUrl, linkSecret });
      if (built) entries.push(built);
      else results.push({ userId, skipped: "no email on file" });
    } catch (error) {
      console.error(`trip-memories: couldn't build the email for ${userId}:`, error);
      results.push({ userId, skipped: "couldn't build the email" });
    }
  }

  let emails = entries.length;
  if (dryRun) {
    results.push(...entries.map((entry) => entry.report));
  } else {
    const { sent, failed } = await claimAndSend(entries);
    emails = sent.length;
    results.push(...sent.map((entry) => entry.report), ...failed);
  }

  console.log(`trip-memories: ${today}${dryRun ? " (dry run)" : ""} — ${trips.length} trip(s) with a matching day, ${emails} email(s)`);
  return { today, dryRun, tripsDue: trips.length, emails, results };
}

module.exports = { runSweep, isAnniversary, MIN_DAYS_BETWEEN, NUDGE_MIN_DAYS_BETWEEN };
