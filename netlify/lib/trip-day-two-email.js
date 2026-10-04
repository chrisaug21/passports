const { escapeHtml, renderEmailLayout, renderButton, COLORS } = require("./email.js");

// Builds the evening-of-day-2 check-in: hopes the trip is going well and
// encourages journaling each night. Pure: no network, no environment.
function buildTripDayTwoEmail({ trip, recipientFirstName, photo, baseUrl, unsubscribeUrl, settingsUrl }) {
  // Opens the Guide straight on its Journal tab (the Guide reads "#journal").
  const journalUrl = `${baseUrl}/app/trip/${trip.id}/guide?from=email#journal`;
  const greeting = recipientFirstName ? `Hi ${escapeHtml(recipientFirstName)},` : "Hi,";

  const heroHtml = photo?.url
    ? `<img src="${escapeHtml(photo.url)}" alt="" width="520" style="display:block;width:100%;height:auto;border:0;" />${
        photo.creditName
          ? `<div style="padding:6px 28px 0;font-size:11px;color:${COLORS.muted};">Photo by ${escapeHtml(photo.creditName)} on Unsplash</div>`
          : ""
      }`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.action};">Trip journal</p>
    <h1 style="margin:0 0 22px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;font-weight:700;color:${COLORS.text};">${escapeHtml(trip.title)}</h1>
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 12px;">We hope you're settling in and having a great trip.</p>
    <p style="margin:0 0 26px;">Here's a small idea: each night, take two minutes to jot down what you did, what surprised you, and maybe add a photo. It's much easier to capture the day while it's fresh than to piece it together later.</p>
    <p style="margin:0;">${renderButton(journalUrl, "Start tonight's entry")}</p>
  `;

  const html = renderEmailLayout({
    preheader: `How's ${trip.title} going? Start your journal tonight.`,
    heroHtml,
    bodyHtml,
    unsubscribeUrl,
    unsubscribeLabel: "Stop trip check-in emails",
    settingsUrl: settingsUrl || `${baseUrl}/app`,
  });

  const text = [
    recipientFirstName ? `Hi ${recipientFirstName},` : "Hi,",
    "",
    "We hope you're settling in and having a great trip.",
    "",
    "Here's a small idea: each night, take two minutes to jot down what you did, what surprised you, and maybe add a photo. It's much easier to capture the day while it's fresh than to piece it together later.",
    "",
    `Start tonight's entry: ${journalUrl}`,
    "",
    `Stop trip check-in emails: ${unsubscribeUrl}`,
  ].join("\n");

  return { subject: `How's ${trip.title} going?`, html, text };
}

module.exports = { buildTripDayTwoEmail };
