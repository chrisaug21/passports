// Photos that rotate behind the hero text on the sign-in page (one picked at
// random per page load). All are the owner's own trip photos, self-hosted in
// /assets/hero/. The welcome email rotates through the same set — keep this
// list in sync with netlify/lib/hero-photos.js (the browser can't import that
// file; there is no build step).
export const HERO_PHOTOS = [
  "iceland",
  "southwest",
  "spain",
  "croatia",
  "hawaii",
  "banff",
  "tuscany",
  "nantucket",
].map((name) => `/assets/hero/${name}.jpg`);

export function pickHeroPhoto() {
  return HERO_PHOTOS[Math.floor(Math.random() * HERO_PHOTOS.length)];
}
