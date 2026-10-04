const { escapeHtml, renderEmailLayout, renderButton, COLORS } = require("./email.js");

// "One year ago today" / "4 years ago today".
function formatYearsAgo(years) {
  return years === 1 ? "One year ago today" : `${years} years ago today`;
}

// The photo block at the top of both memory emails. The credit line only
// appears for Unsplash hero photos; a traveler's own photo has none.
function renderPhotoHero(photo) {
  if (!photo?.url) return "";
  const credit = photo.creditName
    ? `<div style="padding:6px 28px 0;font-size:11px;color:${COLORS.muted};">Photo by ${escapeHtml(photo.creditName)} on Unsplash</div>`
    : "";
  return `<img src="${escapeHtml(photo.url)}" alt="" width="520" style="display:block;width:100%;height:auto;border:0;" />${credit}`;
}

// The "N years ago today you were in X" heading and the trip/day line under it,
// shared by both emails.
function renderHeading({ yearsAgo, place, trip, dayNumber, dateLabel }) {
  return `
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.action};">${escapeHtml(formatYearsAgo(yearsAgo))}</p>
    <h1 style="margin:0 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;font-weight:700;color:${COLORS.text};">You were in ${escapeHtml(place)}</h1>
    <p style="margin:0 0 22px;font-size:14px;color:${COLORS.muted};">${escapeHtml(trip.title)} · Day ${escapeHtml(dayNumber)} · ${escapeHtml(dateLabel)}</p>
  `;
}

// The "See this day" email: a look back at one day of a past trip that has
// journal memories. `excerpt` is { text, authorName } (authorName is null for
// the recipient's own note) or null, in which case `countLine` is shown.
// Pure: no network, no environment.
function buildTripMemoriesEmail({ trip, recipientFirstName, yearsAgo, place, dayNumber, dateLabel, photo, excerpt, countLine, baseUrl, unsubscribeUrl, settingsUrl }) {
  const dayUrl = `${baseUrl}/app/trip/${trip.id}/guide?from=email&day=${dayNumber}#journal`;
  const greeting = recipientFirstName ? `Hi ${escapeHtml(recipientFirstName)},` : "Hi,";

  const memoryHtml = excerpt
    ? `<blockquote style="margin:0 0 26px;padding:4px 0 4px 16px;border-left:3px solid ${COLORS.action};font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.5;color:${COLORS.text};">${escapeHtml(excerpt.text)}${
        excerpt.authorName ? `<div style="margin-top:6px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${COLORS.muted};">— ${escapeHtml(excerpt.authorName)}</div>` : ""
      }</blockquote>`
    : `<p style="margin:0 0 26px;">${escapeHtml(countLine)}</p>`;

  const bodyHtml = `
    ${renderHeading({ yearsAgo, place, trip, dayNumber, dateLabel })}
    <p style="margin:0 0 12px;">${greeting}</p>
    ${excerpt ? `<p style="margin:0 0 16px;">${excerpt.authorName ? `Here's what ${escapeHtml(excerpt.authorName)} wrote on this day:` : "Here's what you wrote down on this day:"}</p>` : ""}
    ${memoryHtml}
    <p style="margin:0;">${renderButton(dayUrl, "See this day")}</p>
  `;

  const html = renderEmailLayout({
    preheader: `${formatYearsAgo(yearsAgo)} you were in ${place}. Take another look.`,
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
    excerpt ? `"${excerpt.text}"${excerpt.authorName ? ` — ${excerpt.authorName}` : ""}` : countLine,
    "",
    `See this day: ${dayUrl}`,
    "",
    `Stop memory emails: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject: `${formatYearsAgo(yearsAgo)}: ${place}`, html, text };
}

module.exports = { buildTripMemoriesEmail, formatYearsAgo, renderPhotoHero, renderHeading };
