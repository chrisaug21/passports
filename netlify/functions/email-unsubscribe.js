const { EMAIL_KINDS, ALL_EMAIL_COLUMNS, verifyUnsubscribeToken } = require("../lib/email-prefs.js");
const { getMissingEmailEnv, getAppBaseUrl, escapeHtml } = require("../lib/email.js");
const admin = require("../lib/supabase-admin.js");

// The page an email's unsubscribe link opens. It works with no login: the
// link's signed code proves which person it's for and can only change that
// person's email switches. It mirrors Settings > Email — one switch per email
// type — with the email they clicked from already switched off.

// Colors/fonts mirror src/styles/tokens.css as literals: this page is served
// by a function, not the app, so it can't load the app's stylesheet.
const PAGE_STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #F4F7FA; color: #1A2332; font-family: "Instrument Sans", "Segoe UI", -apple-system, sans-serif; line-height: 1.5; }
  main { max-width: 520px; margin: 0 auto; padding: 40px 20px 56px; }
  .wordmark { font-family: "Fraunces", Georgia, serif; font-size: 26px; font-weight: 700; margin: 0 0 24px; }
  .card { background: #FFFFFF; border: 1px solid #E8EDF2; border-radius: 12px; padding: 28px; }
  h1 { font-size: 1.15rem; margin: 0 0 6px; }
  .muted { color: #5F6B7C; }
  .lede { margin: 0 0 18px; font-size: 0.9rem; }
  .notice { margin: 0 0 18px; padding: 10px 14px; border-radius: 8px; background: #E7F6F1; color: #0A6B4D; font-size: 0.9rem; font-weight: 500; }
  .list { border: 1px solid #E8EDF2; border-radius: 10px; background: #F8FAFB; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; }
  .row + .row { border-top: 1px solid #E8EDF2; }
  .row__label { display: block; font-size: 0.92rem; font-weight: 500; }
  .row__description { display: block; font-size: 0.8rem; color: #5F6B7C; line-height: 1.35; }
  .switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; cursor: pointer; }
  .switch input { position: absolute; opacity: 0; width: 0; height: 0; }
  .switch span { position: absolute; inset: 0; border-radius: 9999px; background: #d1d5db; transition: background 0.2s ease; }
  .switch span::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #FFFFFF; transition: transform 0.2s ease; }
  .switch input:checked + span { background: #0EA87A; }
  .switch input:checked + span::after { transform: translateX(20px); }
  .switch input:focus-visible + span { outline: 2px solid #0EA87A; outline-offset: 2px; }
  .actions { margin-top: 20px; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
  .save { border: 0; border-radius: 8px; background: #0EA87A; color: #FFFFFF; font: inherit; font-weight: 600; padding: 11px 22px; cursor: pointer; }
  .save:hover { background: #0A8E67; }
  .link { border: 0; background: none; padding: 0; font: inherit; font-size: 0.82rem; color: #5F6B7C; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  .link:hover { color: #1A2332; }
  .footer { margin: 20px 0 0; font-size: 0.82rem; }
  a { color: inherit; }
`;

function page(statusCode, bodyHtml) {
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
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Instrument+Sans:wght@400;500;600&display=swap" />
    <style>${PAGE_STYLES}</style>
  </head>
  <body>
    <main>
      <p class="wordmark">Passports</p>
      <div class="card">${bodyHtml}</div>
    </main>
  </body>
</html>`,
  };
}

function messagePage(statusCode, heading, message, baseUrl) {
  return page(
    statusCode,
    `<h1>${escapeHtml(heading)}</h1>
     <p class="muted" style="margin:0;">${message} You can change your email settings any time from Settings inside <a href="${escapeHtml(baseUrl)}/app">Passports</a>.</p>`
  );
}

// `values` is { <kind>: boolean }. `notice` is an optional "Saved" banner.
function renderSettingsPage({ token, values, notice, baseUrl }) {
  const action = `${baseUrl}/api/email-unsubscribe?t=${encodeURIComponent(token)}`;
  const rows = Object.entries(EMAIL_KINDS)
    .map(
      ([kind, config]) => `
        <div class="row">
          <div>
            <span class="row__label">${escapeHtml(config.title)}</span>
            <span class="row__description">${escapeHtml(config.description)}</span>
          </div>
          <label class="switch" aria-label="${escapeHtml(config.title)}">
            <input type="checkbox" name="${escapeHtml(kind)}" ${values[kind] ? "checked" : ""} />
            <span aria-hidden="true"></span>
          </label>
        </div>`
    )
    .join("");

  return page(
    200,
    `<h1>Email settings</h1>
     <p class="muted lede">Choose which emails Passports sends you.</p>
     ${notice ? `<p class="notice" role="status">${escapeHtml(notice)}</p>` : ""}
     <form method="post" action="${escapeHtml(action)}">
       <div class="list">${rows}</div>
       <div class="actions">
         <button class="save" type="submit" name="action" value="save">Save</button>
         <button class="link" type="submit" name="action" value="all">Unsubscribe from all emails</button>
       </div>
     </form>
     <p class="muted footer"><a href="${escapeHtml(baseUrl)}/app">Open Passports</a></p>`
  );
}

async function readCurrentValues(userId) {
  const columns = Object.values(EMAIL_KINDS).map((config) => config.column);
  const rows = await admin.select("user_profiles", { select: columns.join(","), id: `eq.${userId}` });
  const profile = rows[0];
  // No profile row yet means they've never changed a switch: everything is on.
  return Object.fromEntries(Object.entries(EMAIL_KINDS).map(([kind, config]) => [kind, !profile || profile[config.column] !== false]));
}

// Turning something off is always the same operation: set that email's
// column to false. There is no separate "unsubscribed from all" flag.
exports.handler = async function handler(event) {
  const baseUrl = getAppBaseUrl(event);
  const secret = process.env.EMAIL_LINK_SECRET;
  const missingEnv = getMissingEmailEnv(["SUPABASE_URL", "SUPABASE_SECRET_KEY", "EMAIL_LINK_SECRET"]);
  if (missingEnv.length) {
    console.error(`email-unsubscribe: not configured on this deploy. Missing: ${missingEnv.join(", ")}`);
    return messagePage(503, "Temporarily unavailable", "Please try again in a little while.", baseUrl);
  }

  const token = event.queryStringParameters?.t || "";
  const verified = verifyUnsubscribeToken(token, secret);
  if (!verified) return messagePage(400, "This link isn't valid", "", baseUrl);

  try {
    // Opening the link only shows the page — nothing is saved. Some mail
    // systems pre-open every link in an email, so changing anything on GET
    // would unsubscribe people who never asked to be. The email they came
    // from starts switched off, so one click on Save does what the link said.
    if (event.httpMethod === "GET") {
      const values = await readCurrentValues(verified.userId);
      values[verified.kind] = false;
      return renderSettingsPage({ token, values, baseUrl });
    }

    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

    const rawBody = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
    const form = new URLSearchParams(rawBody);
    const update = { id: verified.userId, updated_at: new Date().toISOString() };

    if (form.get("action") === "all") {
      for (const column of ALL_EMAIL_COLUMNS) update[column] = false;
    } else if (form.get("action") === "save") {
      // A checked switch is sent as "on"; an unchecked one isn't sent at all.
      for (const [kind, config] of Object.entries(EMAIL_KINDS)) update[config.column] = form.get(kind) === "on";
    } else {
      // A mail app's own one-tap "unsubscribe" posts "List-Unsubscribe=One-Click"
      // with no form fields, which means "stop this email".
      update[EMAIL_KINDS[verified.kind].column] = false;
    }

    await admin.upsert("user_profiles", update, "id");

    const values = await readCurrentValues(verified.userId);
    const allOff = Object.values(values).every((on) => !on);
    return renderSettingsPage({
      token,
      values,
      notice: allOff ? "Saved. You won't get any emails from Passports." : "Saved.",
      baseUrl,
    });
  } catch (error) {
    console.error("email-unsubscribe failed:", error);
    return messagePage(500, "Something went wrong", "Please try again.", baseUrl);
  }
};
