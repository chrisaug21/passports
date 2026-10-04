const { escapeHtml, renderEmailLayout, renderButton, COLORS } = require("./email.js");

const STEPS = [
  { title: "Start a trip", body: "Give it a name and a rough idea of where you're headed. Dates can wait." },
  { title: "Add days and stops", body: "Sketch the places, meals and plans for each day, and move them around as things change." },
  { title: "Jot memories as you travel", body: "Once the trip is underway, add notes and photos to your journal so the details don't fade." },
];

// Builds the one-time welcome email. Pure: no network, no environment.
function buildWelcomeEmail({ firstName, baseUrl }) {
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
    <p style="margin:0 0 22px;">Passports is a place to plan a trip, then keep the memories. Build the plan first; the journal grows out of it.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">${stepsHtml}</table>
    <p style="margin:12px 0 0;">${renderButton(dashboardUrl, "Open Passports")}</p>
  `;

  const html = renderEmailLayout({
    preheader: "Plan the trip, then keep the memories.",
    bodyHtml,
    settingsUrl: dashboardUrl,
  });

  const text = [
    firstName ? `Welcome, ${firstName}.` : "Welcome.",
    "",
    "Passports is a place to plan a trip, then keep the memories. Build the plan first; the journal grows out of it.",
    "",
    ...STEPS.map((step, index) => `${index + 1}. ${step.title}: ${step.body}`),
    "",
    `Open Passports: ${dashboardUrl}`,
  ].join("\n");

  return { subject: "Welcome to Passports", html, text };
}

module.exports = { buildWelcomeEmail };
