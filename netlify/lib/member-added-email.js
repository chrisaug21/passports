const { escapeHtml, renderEmailLayout, renderButton, COLORS } = require("./email.js");
const { getTripPhase, formatShortDate, formatDateRange } = require("./trip-dates.js");

// Wording depends on when the trip is. Most people are added to a trip that
// hasn't happened yet, but someone added afterward (to see the plan, or to
// add their own journal memories) shouldn't be told to "help get it ready".
function getCopy(phase, title, end) {
  switch (phase) {
    case "active":
      return {
        eyebrow: "Happening now",
        message: `is happening right now. Open the itinerary to see what's planned for today.`,
        cta: "Open itinerary",
        destination: "guide",
      };
    case "past":
      return {
        eyebrow: "You're on this trip",
        message: `wrapped up on ${formatShortDate(end, true)}. Look back at the itinerary and add your own memories to the journal.`,
        cta: "View the trip",
        destination: "guide",
      };
    case "undated":
      return {
        eyebrow: "You're on this trip",
        message: "is still taking shape. Jump in and help decide where it goes.",
        cta: "Open trip",
        destination: "plan",
      };
    default:
      return {
        eyebrow: "You're going",
        message: "is coming up. You can see the plan, add ideas, and help get it ready.",
        cta: "Open trip",
        destination: "plan",
      };
  }
}

// Builds the whole "you've been added to a trip" email. Pure: no network, no
// environment, so it can be previewed and tested on its own.
function buildMemberAddedEmail({
  trip,
  inviterName,
  recipientFirstName,
  photo,
  baseUrl,
  unsubscribeUrl,
  today,
  settingsUrl,
}) {
  const { phase, start, end } = getTripPhase({ startDate: trip.start_date, tripLength: trip.trip_length }, today);
  const copy = getCopy(phase, trip.title, end);

  const tripUrl = `${baseUrl}/app/trip/${trip.id}${copy.destination === "guide" ? "/guide?from=email" : ""}`;
  const greeting = recipientFirstName ? `Hi ${escapeHtml(recipientFirstName)},` : "Hi,";
  const meta = start
    ? `${formatDateRange(start, end)} · ${trip.trip_length} ${Number(trip.trip_length) === 1 ? "day" : "days"}`
    : "";

  const heroHtml = photo?.url
    ? `<img src="${escapeHtml(photo.url)}" alt="" width="520" style="display:block;width:100%;height:auto;border:0;" />${
        photo.creditName
          ? `<div style="padding:6px 28px 0;font-size:11px;color:${COLORS.muted};">Photo by ${escapeHtml(photo.creditName)} on Unsplash</div>`
          : ""
      }`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.action};">${escapeHtml(copy.eyebrow)}</p>
    <h1 style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;font-weight:700;color:${COLORS.text};">${escapeHtml(trip.title)}</h1>
    ${meta ? `<p style="margin:0 0 22px;font-size:14px;color:${COLORS.muted};">${escapeHtml(meta)}</p>` : `<div style="height:16px;"></div>`}
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 26px;"><strong>${escapeHtml(inviterName)}</strong> added you to <strong>${escapeHtml(trip.title)}</strong>, which ${escapeHtml(copy.message)}</p>
    <p style="margin:0;">${renderButton(tripUrl, copy.cta)}</p>
  `;

  const html = renderEmailLayout({
    preheader: `${inviterName} added you to ${trip.title}.`,
    heroHtml,
    bodyHtml,
    unsubscribeUrl,
    unsubscribeLabel: "Stop emails when I'm added to a trip",
    settingsUrl: settingsUrl || `${baseUrl}/app`,
  });

  const text = [
    recipientFirstName ? `Hi ${recipientFirstName},` : "Hi,",
    "",
    `${inviterName} added you to "${trip.title}", which ${copy.message}`,
    meta ? `\n${meta}` : "",
    "",
    `${copy.cta}: ${tripUrl}`,
    "",
    `Stop emails when I'm added to a trip: ${unsubscribeUrl}`,
  ].join("\n");

  return {
    subject: `You've been added to a trip to ${trip.title}`,
    html,
    text,
  };
}

module.exports = { buildMemberAddedEmail };
