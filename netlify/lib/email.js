// Sending + layout for every Passports email. Uses Resend's web API directly
// (plain fetch — no SDK, no new dependency).

const FROM_ADDRESS = "Passports <passports@mail.chrisaug.com>";
const PRODUCTION_URL = "https://passports.chrisaug.com";

// Links in an email must point at the site the email was sent from. Netlify's
// build-time variables (URL, DEPLOY_PRIME_URL, CONTEXT) don't reliably reach a
// running function, and URL is always the PRODUCTION site even on a deploy
// preview — so a preview's unsubscribe/trip links would point at production,
// which doesn't have unmerged changes yet (a 404). Instead, use the address
// the request actually arrived on. Only this site's own addresses are
// accepted, so a forged header can't make an email link somewhere else.
// With no request to look at (the daily scheduled sweep), it's production.
const PRODUCTION_HOST = new URL(PRODUCTION_URL).hostname;
const SITE_HOST_PATTERN = /^([a-z0-9-]+--)?passports-app\.netlify\.app$/;

function getAppBaseUrl(event) {
  const headers = event?.headers || {};
  const candidates = [
    event?.rawUrl,
    headers["x-forwarded-host"] && `https://${String(headers["x-forwarded-host"]).split(",")[0].trim()}`,
    headers.host && `https://${headers.host}`,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.hostname === PRODUCTION_HOST || SITE_HOST_PATTERN.test(url.hostname)) return `https://${url.hostname}`;
    } catch {
      // Not a usable URL — try the next source.
    }
  }

  return (process.env.URL || PRODUCTION_URL).replace(/\/$/, "");
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\x22\x27]/g, (character) => HTML_ESCAPES[character]);
}

// Marks a string as already-safe markup, for use inside html`...`.
class SafeHtml {
  constructor(value) {
    this.value = value;
  }
}

function raw(value) {
  return new SafeHtml(String(value));
}

// Tagged template that escapes every ${value} unless it was wrapped in raw().
// Escape-by-default: forgetting to escape something is impossible, and
// fragments built with html`` can be nested inside each other safely.
function html(strings, ...values) {
  const out = strings.reduce((result, chunk, index) => {
    const value = values[index - 1];
    return result + (value instanceof SafeHtml ? value.value : escapeHtml(value)) + chunk;
  });
  return new SafeHtml(out);
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
function renderEmailLayout({ preheader, heroHtml = "", bodyHtml, unsubscribeUrl, unsubscribeLabel, settingsUrl }) {
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
              <td style="background:${COLORS.surface};border:1px solid ${COLORS.border};border-top:4px solid ${COLORS.action};border-radius:12px;overflow:hidden;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:${COLORS.text};">
                ${heroHtml}
                <div style="padding:28px;">
                  ${bodyHtml}
                </div>
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

// Sends up to 100 different emails in one request (Resend's batch endpoint —
// also keeps a sweep under Resend's request-rate limit). All-or-nothing:
// returns true only if the whole batch was accepted.
async function sendEmailBatch(messages) {
  if (!messages.length) return true;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("sendEmailBatch skipped: RESEND_API_KEY is not set.");
    return false;
  }

  try {
    for (let index = 0; index < messages.length; index += 100) {
      const chunk = messages.slice(index, index + 100).map((message) => ({
        from: FROM_ADDRESS,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.unsubscribeUrl
          ? {
              "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            }
          : undefined,
      }));

      const response = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        console.error("sendEmailBatch failed:", response.status, await response.text());
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error("sendEmailBatch threw:", error);
    return false;
  }
}

// Names (never values) of required server settings that aren't set on this
// deploy — logged so a "not configured" failure says exactly what's missing.
function getMissingEmailEnv(names) {
  return names.filter((name) => !process.env[name]);
}

module.exports = { html, raw, sendEmailBatch, COLORS, getMissingEmailEnv, getAppBaseUrl, escapeHtml, renderEmailLayout, renderButton, sendEmail };
