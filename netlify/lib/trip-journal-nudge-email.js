const { escapeHtml, renderEmailLayout, renderButton } = require("./email.js");
const { formatYearsAgo, renderPhotoHero, renderHeading } = require("./trip-memories-email.js");

// The "add a memory" email: the same anniversary look-back, for a past trip
// whose journal is still completely empty. Pure: no network, no environment.
function buildTripJournalNudgeEmail({ trip, recipientFirstName, yearsAgo, place, dayNumber, dateLabel, photo, baseUrl, unsubscribeUrl, settingsUrl }) {
  const dayUrl = `${baseUrl}/app/trip/${trip.id}/guide?from=email&day=${dayNumber}#journal`;
  const greeting = recipientFirstName ? `Hi ${escapeHtml(recipientFirstName)},` : "Hi,";

  const bodyHtml = `
    ${renderHeading({ yearsAgo, place, trip, dayNumber, dateLabel })}
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 26px;">There's nothing in your journal for this trip yet. What do you remember about this day?</p>
    <p style="margin:0;">${renderButton(dayUrl, "Add a memory")}</p>
  `;

  const html = renderEmailLayout({
    preheader: `${formatYearsAgo(yearsAgo)} you were in ${place}. What do you remember?`,
    heroHtml: renderPhotoHero(photo),
    bodyHtml,
    unsubscribeUrl,
    unsubscribeLabel: "Stop memory emails",
    settingsUrl: settingsUrl || `${baseUrl}/app`,
  });

  const text = [
    recipientFirstName ? `Hi ${recipientFirstName},` : "Hi,",
    "",
    `${formatYearsAgo(yearsAgo)} you were in ${place} (${trip.title}, Day ${dayNumber}, ${dateLabel}).`,
    "",
    "There's nothing in your journal for this trip yet. What do you remember about this day?",
    "",
    `Add a memory: ${dayUrl}`,
    "",
    `Stop memory emails: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject: `${formatYearsAgo(yearsAgo)}: ${place}`, html, text };
}

module.exports = { buildTripJournalNudgeEmail };
