// Sending + layout for every Passports email. Uses Resend's web API directly
// (plain fetch — no SDK, no new dependency).

const FROM_ADDRESS = "Passports <passports@mail.chrisaug.com>";
const PRODUCTION_URL = "https://passports.chrisaug.com";

// Links in an email must point at the real site. process.env.URL is the
// primary site URL on production and the deploy URL on a preview, so links
// in a preview email open that preview.
function getAppBaseUrl() {
  return (process.env.URL || PRODUCTION_URL).replace(/\/$/, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Email clients ignore CSS variables, so these mirror the design tokens in
// src/styles/tokens.css as literal values. Keep them in sync by hand.
const COLORS = {
  background: "#F4F7FA",
  surface: "#FFFFFF",
  text: "#1A2332",
  muted: "#5F6B7C",
  action: "#0EA87A",
  border: "#E8EDF2",
};

// Wraps a body in the shared Passports frame: wordmark, content card, and a
// footer with the unsubscribe controls every email must carry.
function renderEmailLayout({ preheader, bodyHtml, unsubscribeUrl, unsubscribeLabel, settingsUrl }) {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${COLORS.background};">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.background};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding:0 4px 16px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:${COLORS.text};">Passports</td>
            </tr>
            <tr>
              <td style="background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:12px;padding:28px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:${COLORS.text};">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 4px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${COLORS.muted};">
                <a href="${escapeHtml(unsubscribeUrl)}" style="color:${COLORS.muted};">${escapeHtml(unsubscribeLabel)}</a>
                &nbsp;·&nbsp;
                <a href="${escapeHtml(settingsUrl)}" style="color:${COLORS.muted};">Email settings</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderButton(href, label) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${COLORS.action};color:#FFFFFF;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">${escapeHtml(label)}</a>`;
}

// Sends one email. Returns true on success, false on any failure — callers
// treat email as best-effort and must never fail the user's action over it.
// `unsubscribeUrl` also goes in the List-Unsubscribe headers so Gmail/Apple
// Mail can show their own one-tap unsubscribe.
async function sendEmail({ to, subject, html, text, unsubscribeUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("sendEmail skipped: RESEND_API_KEY is not set.");
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
        html,
        text,
        headers: unsubscribeUrl
          ? {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
      }),
    });

    if (!response.ok) {
      console.error("sendEmail failed:", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("sendEmail threw:", error);
    return false;
  }
}

module.exports = { getAppBaseUrl, escapeHtml, renderEmailLayout, renderButton, sendEmail };
