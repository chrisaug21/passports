const crypto = require("crypto");
const { json, notFound, readJsonBody, requireAdmin } = require("../lib/admin-auth.js");
const admin = require("../lib/supabase-admin.js");

// No 0/O/1/I so a code read aloud or off a screen can't be misread.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;
const MAX_LABEL_LENGTH = 80;
const MAX_SEATS = 100000;

function generateCode() {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

function statusOf(row, now = Date.now()) {
  if (!row.active) return "off";
  if (row.expires_at && new Date(row.expires_at).getTime() <= now) return "expired";
  if (row.max_uses !== null && row.redeemed_count >= row.max_uses) return "used_up";
  return "active";
}

function toClient(row) {
  return {
    id: row.id,
    code: row.code,
    label: row.label,
    maxUses: row.max_uses,
    redeemedCount: row.redeemed_count,
    expiresAt: row.expires_at,
    active: row.active,
    createdAt: row.created_at,
    status: statusOf(row),
  };
}

const CODE_COLUMNS = "id,code,label,max_uses,redeemed_count,expires_at,active,created_at";

// Validates the editable fields shared by create and update. Returns
// { values } with only the fields that were supplied, or { error }.
function readFields(body) {
  const values = {};

  if ("label" in body) {
    const label = body.label === null ? "" : String(body.label).trim();
    if (label.length > MAX_LABEL_LENGTH) return { error: "That note is too long." };
    values.label = label || null;
  }

  if ("maxUses" in body) {
    if (body.maxUses === null) {
      values.max_uses = null;
    } else if (Number.isInteger(body.maxUses) && body.maxUses >= 1 && body.maxUses <= MAX_SEATS) {
      values.max_uses = body.maxUses;
    } else {
      return { error: "Seats must be a whole number of 1 or more." };
    }
  }

  if ("expiresAt" in body) {
    if (body.expiresAt === null || body.expiresAt === "") {
      values.expires_at = null;
    } else {
      const date = new Date(body.expiresAt);
      if (Number.isNaN(date.getTime())) return { error: "That expiry date isn't valid." };
      values.expires_at = date.toISOString();
    }
  }

  if ("active" in body) {
    if (typeof body.active !== "boolean") return { error: "Invalid request." };
    values.active = body.active;
  }

  return { values };
}

async function listCodes() {
  const rows = await admin.select("invite_codes", {
    select: CODE_COLUMNS,
    deleted_at: "is.null",
    order: "created_at.desc",
    limit: "500",
  });
  return rows.map(toClient);
}

async function listRedemptions(codeId) {
  const rows = await admin.select("invite_redemptions", {
    select: "email,redeemed_at",
    code_id: admin.eqId(codeId),
    order: "redeemed_at.desc",
    limit: "500",
  });
  return rows.map((row) => ({ email: row.email, redeemedAt: row.redeemed_at }));
}

async function createCode(body, callerId) {
  const fields = readFields(body);
  if (fields.error) return json(400, { error: fields.error });

  const supplied = normalizeCode(body.code);
  if (supplied && !CODE_PATTERN.test(supplied)) {
    return json(400, { error: "Codes can use letters, numbers and dashes, 3 to 32 characters." });
  }

  // A typed code that's taken is the admin's to fix; an auto-generated one
  // just tries again (collisions are astronomically unlikely).
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = supplied || generateCode();
    const taken = await admin.select("invite_codes", { select: "id", code_normalized: `eq.${code}`, deleted_at: "is.null" });
    if (taken.length) {
      if (supplied) return json(409, { error: "That code already exists." });
      continue;
    }

    try {
      const [row] = await admin.insert("invite_codes", { code, created_by: callerId, ...fields.values });
      return json(201, toClient({ ...row }));
    } catch (error) {
      if (!String(error.message).includes("(409)")) throw error;
      if (supplied) return json(409, { error: "That code already exists." });
    }
  }

  return json(500, { error: "Something went wrong. Please try again." });
}

async function updateCode(body) {
  if (!body.id) return json(400, { error: "Invalid request." });
  const fields = readFields(body);
  if (fields.error) return json(400, { error: fields.error });

  const existing = await admin.select("invite_codes", { select: CODE_COLUMNS, id: admin.eqId(body.id), deleted_at: "is.null" });
  if (!existing.length) return json(404, { error: "That code no longer exists." });

  // Never fewer seats than are already used.
  if (fields.values.max_uses && fields.values.max_uses < existing[0].redeemed_count) {
    return json(400, { error: `${existing[0].redeemed_count} seats are already used, so seats can't go below that.` });
  }

  const [row] = await admin.update("invite_codes", { id: admin.eqId(body.id), deleted_at: "is.null" }, fields.values);
  return json(200, toClient(row));
}

async function removeCode(id) {
  if (!id) return json(400, { error: "Invalid request." });
  // Soft delete: it leaves the list, but its redemptions stay on record.
  await admin.update("invite_codes", { id: admin.eqId(id), deleted_at: "is.null" }, { deleted_at: new Date().toISOString(), active: false });
  return json(200, { removed: true });
}

exports.handler = async function handler(event) {
  try {
    const result = await requireAdmin(event);
    if (result.error) return result.error;

    const query = event.queryStringParameters || {};

    switch (event.httpMethod) {
      case "GET":
        if (query.id) return json(200, { redemptions: await listRedemptions(query.id) });
        return json(200, { codes: await listCodes() });
      case "POST": {
        const body = readJsonBody(event);
        return body ? await createCode(body, result.caller.id) : json(400, { error: "Invalid request." });
      }
      case "PATCH": {
        const body = readJsonBody(event);
        return body ? await updateCode(body) : json(400, { error: "Invalid request." });
      }
      case "DELETE":
        return await removeCode(query.id);
      default:
        return notFound();
    }
  } catch (error) {
    // A malformed id throws "Invalid id." from eqId — a bad request, not a crash.
    if (error.message === "Invalid id.") return json(400, { error: "Invalid request." });
    console.error("admin-codes failed:", error);
    return json(500, { error: "Something went wrong. Please try again." });
  }
};
