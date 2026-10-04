const { escapeHtml, renderEmailLayout, renderButton, COLORS } = require("./email.js");

const STEPS = [
  { title: "Start a trip", body: "Give it a name and a rough idea of where you're headed. Dates can wait." },
  { title: "Add days and stops", body: "Sketch the places, meals and plans for each day, and move them around as things change." },
  { title: "Jot memories as you travel", body: "Once the trip is underway, add notes and photos to your journal so the details don't fade." },
];

const INTRO = [
  "Passports is where a trip lives from the first idea to the last memory. Start by collecting the places you want to go, then shape them into a day-by-day plan with the flights, hotels, reservations and notes that make it real. Invite whoever is coming along and everyone works from the same itinerary.",
  "When you're on the road, the same trip becomes your journal. Add a few lines and a photo as you go, and when you're home you'll have the story of the trip, not just a list of bookings.",
];

// Builds the one-time welcome email. Pure: no network, no environment.
function buildWelcomeEmail({ firstName, baseUrl, photoUrl, settingsUrl }) {
  const dashboardUrl = `${baseUrl}/app`;
  const greeting = firstName ? `Welcome, ${escapeHtml(firstName)}.` : "Welcome.";

  const stepsHtml = STEPS.map(
    (step, index) => `
      <tr>
        <td valign="top" style="padding:0 12px 14px 0;font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;color:${COLORS.action};">${index + 1}</td>
        <td valign="top" style="padding:0 0 14px;"><strong>${escapeHtml(step.title)}</strong><br /><span style="font-size:14px;color:${COLORS.muted};">${escapeHtml(step.body)}</span></td>
      </tr>`
  ).join("");

  const bodyHtml = `
    <h1 style="margin:0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;font-weight:700;color:${COLORS.text};">${greeting}</h1>
    ${INTRO.map((paragraph) => `<p style="margin:0 0 14px;">${escapeHtml(paragraph)}</p>`).join("")}
    <p style="margin:22px 0 14px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${COLORS.action};">Three ways to begin</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">${stepsHtml}</table>
    <p style="margin:12px 0 0;">${renderButton(dashboardUrl, "Open Passports")}</p>
  `;

  const html = renderEmailLayout({
    preheader: "Plan the trip, then keep the memories.",
    heroHtml: photoUrl
      ? `<img src="${escapeHtml(photoUrl)}" alt="" width="520" style="display:block;width:100%;height:auto;border:0;" />`
      : "",
    bodyHtml,
    settingsUrl: settingsUrl || dashboardUrl,
  });

  const text = [
    firstName ? `Welcome, ${firstName}.` : "Welcome.",
    "",
    ...INTRO.flatMap((paragraph) => [paragraph, ""]),
    "Three ways to begin:",
    ...STEPS.map((step, index) => `${index + 1}. ${step.title}: ${step.body}`),
    "",
    `Open Passports: ${dashboardUrl}`,
    "",
    `Email settings: ${settingsUrl || dashboardUrl}`,
  ].join("\n");

  return { subject: "Welcome to Passports", html, text };
}

module.exports = { buildWelcomeEmail };
