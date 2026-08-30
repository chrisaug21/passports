// Mirrors the fetchFromSupabase helper in netlify/functions/trip-export.js,
// extended with an RPC caller and a caller-supplied bearer (anon key for
// system-level RPC calls with no session, or the user's own access token
// when a call should be scoped to them via RLS).

async function callRpc(fnName, args, { bearer } = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: process.env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${bearer || process.env.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(args || {}),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Supabase RPC ${fnName} failed (${response.status})`);
    error.code = data?.code;
    error.status = response.status;
    throw error;
  }

  return data;
}

// GET with a caller-supplied bearer (the connected user's own access token,
// resolved per-request via rotateSupabaseSession) so RLS scopes results to
// that user, exactly like the browser client. Read-only tools use this.
async function selectRows(table, params, { bearer }) {
  const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${bearer}`,
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : [];

  if (!response.ok) {
    throw new Error(data?.message || `Could not read ${table} (status ${response.status})`);
  }

  return data;
}

// Convenience wrapper for the "every row for one trip, not soft-deleted"
// query shape every read-only MCP tool uses.
function selectForTrip(table, tripId, select, { bearer, order } = {}) {
  const params = { trip_id: `eq.${tripId}`, deleted_at: "is.null", select };
  if (order) params.order = order;
  return selectRows(table, params, { bearer });
}

async function upsertRow(table, row, { bearer, onConflict }) {
  const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/${table}`);
  if (onConflict) url.searchParams.set("on_conflict", onConflict);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: process.env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${bearer}`,
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(row),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || `Supabase upsert into ${table} failed (${response.status})`);
  }

  return Array.isArray(data) ? data[0] : data;
}

// Plain insert (no on-conflict merge) with a caller-supplied bearer, so RLS
// scopes the write to the connected user exactly like the browser client —
// e.g. trip_items' insert policy already requires real trip membership.
async function insertRow(table, row, { bearer }) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: process.env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${bearer}`,
      prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || `Supabase insert into ${table} failed (${response.status})`);
  }

  return Array.isArray(data) ? data[0] : data;
}

// Partial PATCH with a caller-supplied bearer, so RLS scopes the write to
// the connected user exactly like insertRow does for creates. `filters` is
// a PostgREST query-param object (e.g. { id: `eq.${itemId}` }); `patch` is
// only the fields actually changing — this is a true partial update, unlike
// the app's own item-editor form which always resends the full row.
async function updateRow(table, filters, patch, { bearer }) {
  const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(filters)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      apikey: process.env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${bearer}`,
      prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.message || `Supabase update of ${table} failed (${response.status})`);
  }

  return Array.isArray(data) ? data[0] : data;
}

async function getSupabaseUser(accessToken) {
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  return response.json();
}

async function refreshSupabaseSession(refreshToken) {
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: process.env.SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data?.error_description || data?.msg || "Supabase refresh failed");
    error.code = data?.error_code || data?.error;
    error.status = response.status;
    throw error;
  }

  return data; // { access_token, refresh_token, expires_in, user, ... }
}

module.exports = { callRpc, selectRows, selectForTrip, upsertRow, insertRow, updateRow, getSupabaseUser, refreshSupabaseSession };
