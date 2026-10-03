const { escapeHtml, renderEmailLayout, renderButton, COLORS } = require("./email.js");
const { parseDate, formatShortDate, formatDateRange } = require("./trip-dates.js");

// How many open to-dos are listed per group before "and N more".
const MAX_LISTED = 5;

// Builds the "Your trip starts in 3 days" email: a link to the Guide and,
// when there is any, what's still open on the to-do list. `openTodos` and
// `openPacking` are arrays of titles. Pure: no network, no environment.
function buildTripStartsSoonEmail({ trip, openTodos, openPacking, recipientFirstName, photo, baseUrl, unsubscribeUrl }) {
  const start = parseDate(trip.start_date);
  const length = Number(trip.trip_length);
  const end = start && Number.isInteger(length) && length >= 1 ? new Date(start.getTime() + (length - 1) * 86400000) : null;
  const meta = start && end ? `${formatDateRange(start, end)} · ${length} ${length === 1 ? "day" : "days"}` : start ? formatShortDate(start, true) : "";

  const guideUrl = `${baseUrl}/app/trip/${trip.id}/guide`;
  const prepUrl = `${baseUrl}/app/trip/${trip.id}/prep`;
  const greeting = recipientFirstName ? `Hi ${escapeHtml(recipientFirstName)},` : "Hi,";
  const allSet = !openTodos.length && !openPacking.length;

  const heroHtml = photo?.url
    ? `<img src="${escapeHtml(photo.url)}" alt="" width="520" style="display:block;width:100%;height:auto;border:0;" />${
        photo.creditName
          ? `<div style="padding:6px 28px 0;font-size:11px;color:${COLORS.muted};">Photo by ${escapeHtml(photo.creditName)} on Unsplash</div>`
          : ""
      }`
    : "";

  const renderGroup = (heading, titles) => {
    if (!titles.length) return "";
    const shown = titles.slice(0, MAX_LISTED);
    const extra = titles.length - shown.length;
    return `
      <p style="margin:0 0 6px;font-weight:700;">${escapeHtml(heading)}</p>
      <ul style="margin:0 0 18px;padding-left:20px;">
        ${shown.map((title) => `<li style="margin:0 0 4px;">${escapeHtml(title)}</li>`).join("")}
        ${extra > 0 ? `<li style="margin:0;color:${COLORS.muted};list-style:none;margin-left:-20px;">and ${extra} more</li>` : ""}
      </ul>`;
  };

  const introHtml = allSet
    ? `<p style="margin:0 0 26px;"><strong>${escapeHtml(trip.title)}</strong> starts in 3 days, and your to-do list is all checked off. Nicely done. It's a good moment to give your itinerary one more look.</p>`
    : `<p style="margin:0 0 18px;"><strong>${escapeHtml(trip.title)}</strong> starts in 3 days. Take a look at your itinerary, and here's what's still open:</p>
       ${renderGroup("Still to do", openTodos)}
       ${renderGroup("Still to pack", openPacking)}`;

  const bodyHtml = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.action};">Coming up</p>
    <h1 style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;font-weight:700;color:${COLORS.text};">${escapeHtml(trip.title)}</h1>
    ${meta ? `<p style="margin:0 0 22px;font-size:14px;color:${COLORS.muted};">${escapeHtml(meta)}</p>` : `<div style="height:16px;"></div>`}
    <p style="margin:0 0 12px;">${greeting}</p>
    ${introHtml}
    <p style="margin:0 0 12px;">${renderButton(guideUrl, "Check your itinerary")}</p>
    ${allSet ? "" : `<p style="margin:0;font-size:14px;"><a href="${escapeHtml(prepUrl)}" style="color:${COLORS.muted};">Go to your trip prep list</a></p>`}
  `;

  const html = renderEmailLayout({
    preheader: allSet ? `${trip.title} starts in 3 days. You're all set.` : `${trip.title} starts in 3 days. Here's what's still open.`,
    heroHtml,
    bodyHtml,
    unsubscribeUrl,
    unsubscribeLabel: "Stop trip countdown emails",
    settingsUrl: `${baseUrl}/app`,
  });

  const textGroup = (heading, titles) => {
    if (!titles.length) return [];
    const shown = titles.slice(0, MAX_LISTED).map((title) => `  - ${title}`);
    const extra = titles.length - MAX_LISTED;
    return [heading, ...shown, ...(extra > 0 ? [`  and ${extra} more`] : []), ""];
  };

  const text = [
    recipientFirstName ? `Hi ${recipientFirstName},` : "Hi,",
    "",
    allSet
      ? `"${trip.title}" starts in 3 days, and your to-do list is all checked off. Nicely done. It's a good moment to give your itinerary one more look.`
      : `"${trip.title}" starts in 3 days. Take a look at your itinerary, and here's what's still open:`,
    "",
    ...textGroup("Still to do:", openTodos),
    ...textGroup("Still to pack:", openPacking),
    `Check your itinerary: ${guideUrl}`,
    "",
    `Stop trip countdown emails: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject: `${trip.title} starts in 3 days`, html, text };
}

module.exports = { buildTripStartsSoonEmail };
