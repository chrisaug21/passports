const { EMAIL_KINDS, ALL_EMAIL_COLUMNS, verifyUnsubscribeToken } = require("../lib/email-prefs.js");
const { getMissingEmailEnv, getAppBaseUrl, escapeHtml } = require("../lib/email.js");
const admin = require("../lib/supabase-admin.js");

function page(statusCode, heading, bodyHtml) {
  return {
    statusCode,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    body: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Passports email settings</title>
  </head>
  <body style="margin:0;background:#F4F7FA;color:#1A2332;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">
    <main style="max-width:480px;margin:0 auto;padding:48px 20px;line-height:1.5;">
      <p style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;margin:0 0 24px;">Passports</p>
      <div style="background:#FFFFFF;border:1px solid #E8EDF2;border-radius:12px;padding:28px;">
        <h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(heading)}</h1>
        ${bodyHtml}
      </div>
    </main>
  </body>
</html>`,
  };
}

const BUTTON_STYLE = "display:block;width:100%;box-sizing:border-box;margin:0 0 12px;padding:12px 16px;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;";

function invalidLinkPage(baseUrl) {
  return page(
    400,
    "This link isn't valid",
    `<p style="margin:0;">You can change your email settings any time from Settings inside <a href="${escapeHtml(baseUrl)}/app">Passports</a>.</p>`
  );
}

function renderChoicePage(token, kind, baseUrl) {
  const label = EMAIL_KINDS[kind].label;
  const action = `${baseUrl}/api/email-unsubscribe?t=${encodeURIComponent(token)}`;
  return page(
    200,
    "Email settings",
    `<form method="post" action="${escapeHtml(action)}">
       <p style="margin:0 0 20px;">Which emails would you like to stop?</p>
       <button name="scope" value="this" type="submit" style="${BUTTON_STYLE}background:#0EA87A;color:#FFFFFF;border:0;">Stop emails about ${escapeHtml(label)}</button>
       <button name="scope" value="all" type="submit" style="${BUTTON_STYLE}background:#FFFFFF;color:#1A2332;border:1px solid #d1d5db;">Unsubscribe from all Passports emails</button>
     </form>`
  );
}

// Turning something off is always the same operation: set that email's
// column(s) to false. There is no separate "unsubscribed from all" flag.
exports.handler = async function handler(event) {
  const baseUrl = getAppBaseUrl(event);
  const secret = process.env.EMAIL_LINK_SECRET;
  const missingEnv = getMissingEmailEnv(["SUPABASE_URL", "SUPABASE_SECRET_KEY", "EMAIL_LINK_SECRET"]);
  if (missingEnv.length) {
    console.error(`email-unsubscribe: not configured on this deploy. Missing: ${missingEnv.join(", ")}`);
    return page(503, "Temporarily unavailable", `<p style="margin:0;">Please try again in a little while.</p>`);
  }

  const token = event.queryStringParameters?.t || "";
  const verified = verifyUnsubscribeToken(token, secret);
  if (!verified) return invalidLinkPage(baseUrl);

  // Opening the link only shows the choice. Some mail systems pre-open every
  // link in an email, so changing anything on GET would unsubscribe people
  // who never asked to be.
  if (event.httpMethod === "GET") return renderChoicePage(token, verified.kind, baseUrl);
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
  const scope = new URLSearchParams(rawBody).get("scope") === "all" ? "all" : "this";

  // A mail app's own one-tap "unsubscribe" posts "List-Unsubscribe=One-Click"
  // with no scope, which means "this email".
  const columns = scope === "all" ? ALL_EMAIL_COLUMNS : [EMAIL_KINDS[verified.kind].column];
  const values = { id: verified.userId, updated_at: new Date().toISOString() };
  for (const column of columns) values[column] = false;

  try {
    await admin.upsert("user_profiles", values, "id");
  } catch (error) {
    console.error("email-unsubscribe failed:", error);
    return page(500, "Something went wrong", `<p style="margin:0;">Please try again, or change this in Settings inside <a href="${escapeHtml(baseUrl)}/app">Passports</a>.</p>`);
  }

  const message = scope === "all" ? "You won't get any more emails from Passports." : `You won't get emails about ${EMAIL_KINDS[verified.kind].label} anymore.`;
  return page(
    200,
    "You're all set",
    `<p style="margin:0 0 12px;">${escapeHtml(message)}</p>
     <p style="margin:0;color:#5F6B7C;font-size:14px;">Changed your mind? You can turn emails back on any time from Settings inside <a href="${escapeHtml(baseUrl)}/app">Passports</a>.</p>`
  );
};
