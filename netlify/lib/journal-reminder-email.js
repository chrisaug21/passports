const { escapeHtml, renderEmailLayout, renderButton, COLORS } = require("./email.js");
const { parseDate, formatShortDate, formatDateRange } = require("./trip-dates.js");

// Builds the "add your memories to the trip journal" email. Pure: no network,
// no environment, so it can be previewed and tested on its own.
function buildJournalReminderEmail({ trip, endDate, recipientFirstName, photo, baseUrl, unsubscribeUrl }) {
  const start = parseDate(trip.start_date);
  const end = parseDate(endDate);
  const length = Number(trip.trip_length);

  const meta = start && end ? `${formatDateRange(start, end)} · ${length} ${length === 1 ? "day" : "days"}` : "";
  // Opens the Guide straight on its Journal tab (the Guide reads "#journal").
  const journalUrl = `${baseUrl}/app/trip/${trip.id}/guide?from=email#journal`;
  const greeting = recipientFirstName ? `Hi ${escapeHtml(recipientFirstName)},` : "Hi,";
  const wrapped = end ? `wrapped up on ${formatShortDate(end, true)}` : "has wrapped up";

  const heroHtml = photo?.url
    ? `<img src="${escapeHtml(photo.url)}" alt="" width="520" style="display:block;width:100%;height:auto;border:0;" />${
        photo.creditName
          ? `<div style="padding:6px 28px 0;font-size:11px;color:${COLORS.muted};">Photo by ${escapeHtml(photo.creditName)} on Unsplash</div>`
          : ""
      }`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.action};">Trip journal</p>
    <h1 style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;font-weight:700;color:${COLORS.text};">${escapeHtml(trip.title)}</h1>
    ${meta ? `<p style="margin:0 0 22px;font-size:14px;color:${COLORS.muted};">${escapeHtml(meta)}</p>` : `<div style="height:16px;"></div>`}
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 26px;"><strong>${escapeHtml(trip.title)}</strong> ${escapeHtml(wrapped)}. Memories fade fast. Jot down your favorite moments, add a few photos, and note what you'd do again while it's still fresh.</p>
    <p style="margin:0;">${renderButton(journalUrl, "Open the journal")}</p>
  `;

  const html = renderEmailLayout({
    preheader: `${trip.title} is over. Add your memories to the journal.`,
    heroHtml,
    bodyHtml,
    unsubscribeUrl,
    unsubscribeLabel: "Stop journal reminder emails",
    settingsUrl: `${baseUrl}/app`,
  });

  const text = [
    recipientFirstName ? `Hi ${recipientFirstName},` : "Hi,",
    "",
    `"${trip.title}" ${wrapped}. Memories fade fast. Jot down your favorite moments, add a few photos, and note what you'd do again while it's still fresh.`,
    meta ? `\n${meta}` : "",
    "",
    `Open the journal: ${journalUrl}`,
    "",
    `Stop journal reminder emails: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject: `Add your memories from ${trip.title}`, html, text };
}

module.exports = { buildJournalReminderEmail };
