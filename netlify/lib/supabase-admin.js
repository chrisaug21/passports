// Minimal Supabase REST helpers for Netlify functions that must act with no
// signed-in user (or must read another person's email address). These use the
// service-role key, which bypasses every access rule — it must only ever be
// read from process.env on the server, never sent to a browser, and every
// caller must do its own permission check first.

function getConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

function adminHeaders(serviceKey, extra) {
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function restRequest(method, table, params, body, { prefer } = {}) {
  const config = getConfig();
  if (!config) throw new Error("Service role is not configured.");

  const query = new URLSearchParams(params || {}).toString();
  const response = await fetch(`${config.url}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: adminHeaders(config.serviceKey, prefer ? { prefer } : undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Data request failed (${response.status}) for ${table}.`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

function select(table, params) {
  return restRequest("GET", table, params);
}

// PATCH returning the rows that were actually changed — an empty array means
// the filters matched nothing, which is how callers "claim" a row atomically.
function update(table, params, values) {
  return restRequest("PATCH", table, params, values, { prefer: "return=representation" });
}

function upsert(table, values, onConflict) {
  return restRequest("POST", table, { on_conflict: onConflict }, values, {
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

// The signed-in user behind a browser's access token, or null if it's not valid.
async function getUserFromToken(accessToken) {
  const config = getConfig();
  if (!config || !accessToken) return null;

  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY || config.serviceKey, authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id ? user : null;
}

// Email address for a user id (only the auth system knows it).
async function getEmailForUser(userId) {
  const config = getConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: adminHeaders(config.serviceKey),
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.email || null;
}

module.exports = { getConfig, select, update, upsert, getUserFromToken, getEmailForUser };
