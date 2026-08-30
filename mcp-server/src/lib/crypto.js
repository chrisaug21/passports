const crypto = require("crypto");

function getKey() {
  const hex = process.env.MCP_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("MCP_ENCRYPTION_KEY must be set to 64 hex characters (32 bytes).");
  }
  return Buffer.from(hex, "hex");
}

// AES-256-GCM. Stored as base64(iv[12] + authTag[16] + ciphertext).
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

function decrypt(payloadBase64) {
  const key = getKey();
  const buf = Buffer.from(payloadBase64, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

module.exports = { encrypt, decrypt, sha256Hex, randomToken };
