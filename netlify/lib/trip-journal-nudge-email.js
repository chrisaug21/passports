const { escapeHtml, renderEmailLayout, renderButton } = require("./email.js");
const { formatYearsAgo, renderPhotoHero, renderHeading } = require("./trip-memories-email.js");

// The "add your memories" email: the same anniversary look-back, for a past trip
// whose journal is still completely empty. It asks for memories from the whole
// trip; the button just opens the journal at the anniversary day as a starting point. Pure: no network, no environment.
function buildTripJournalNudgeEmail({ trip, recipientFirstName, yearsAgo, place, dayNumber, dateLabel, photo, baseUrl, unsubscribeUrl, settingsUrl }) {
  const dayUrl = `${baseUrl}/app/trip/${trip.id}/guide?from=email&day=${dayNumber}#journal`;
  const greeting = recipientFirstName ? `Hi ${escapeHtml(recipientFirstName)},` : "Hi,";

  const bodyHtml = `
    ${renderHeading({ yearsAgo, place, trip, dayNumber, dateLabel })}
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">We were all set to send you a look back at this trip, but there's nothing in your journal yet, so we've got nothing to show you!</p>
    <p style="margin:0 0 12px;">What do you remember? The meal you're still thinking about, the wrong turn that turned out great, the thing that made everyone laugh. A few words or a photo from any day of the trip is plenty.</p>
    <p style="margin:0 0 26px;">Add a few memories now and we'll bring them back to you on future anniversaries.</p>
    <p style="margin:0;">${renderButton(dayUrl, "Add your memories")}</p>
  `;

  const html = renderEmailLayout({
    preheader: `${formatYearsAgo(yearsAgo)} you were in ${place}. Got any memories to add?`,
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
    "We were all set to send you a look back at this trip, but there's nothing in your journal yet, so we've got nothing to show you!",
    "",
    "What do you remember? The meal you're still thinking about, the wrong turn that turned out great, the thing that made everyone laugh. A few words or a photo from any day of the trip is plenty.",
    "",
    "Add a few memories now and we'll bring them back to you on future anniversaries.",
    "",
    `Add your memories: ${dayUrl}`,
    "",
    `Stop memory emails: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject: `${formatYearsAgo(yearsAgo)} you were in ${place}. Got any memories?`, html, text };
}

module.exports = { buildTripJournalNudgeEmail };
