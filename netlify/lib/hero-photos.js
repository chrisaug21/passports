const crypto = require("crypto");

// The same photos as src/config/hero-photos.js (the browser can't import this
// file; there is no build step — keep the two lists in sync). The welcome
// email gives each person one of them, chosen from their user id so it's
// stable for that person and spread evenly across everyone.
const HERO_PHOTO_FILES = ["iceland", "southwest", "spain", "croatia", "hawaii", "banff", "tuscany", "nantucket", "hallstatt"].map(
  (name) => `/assets/hero/${name}.jpg`
);

function pickHeroPhotoFor(userId) {
  const digest = crypto.createHash("sha256").update(String(userId)).digest();
  return HERO_PHOTO_FILES[digest.readUInt32BE(0) % HERO_PHOTO_FILES.length];
}

module.exports = { HERO_PHOTO_FILES, pickHeroPhotoFor };
