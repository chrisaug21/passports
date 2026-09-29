// One-time backfill: generates the -720x480 (preview) and -360x240 (card)
// photo variants for every existing trip_photos row, since they were
// uploaded before the app started generating them client-side at upload
// time (see src/lib/photo-upload.js and src/services/photos-service.js).
// New uploads don't need this — only photos that existed before that
// change.
//
// Safe to re-run: uploads use upsert, so it just regenerates variants that
// already exist rather than erroring.
//
// Uses `sips` (built into macOS) to resize, so this only runs on a Mac —
// that's fine for a one-time local script, no reason to make it portable.
//
// Usage (from the repo root, with your own Supabase credentials — get
// SUPABASE_SERVICE_ROLE_KEY from `netlify env:get SUPABASE_SERVICE_ROLE_KEY`,
// never paste it into chat or commit it):
//   SUPABASE_URL=https://tqxvtsdghobustiatiqm.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/backfill-photo-variants.mjs

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "trip-photos";

// Keep in sync with PHOTO_VARIANT_SUFFIXES in src/services/photos-service.js
// and PHOTO_VARIANT_SIZES in src/lib/photo-upload.js.
const VARIANTS = [
  { suffix: "-720x480", width: 720, height: 480, quality: 72 },
  { suffix: "-360x240", width: 360, height: 240, quality: 70 },
];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment first.");
  process.exit(1);
}

async function main() {
  const rows = await fetchPhotoRows();
  console.log(`Found ${rows.length} trip_photos rows.`);

  const tempDir = await mkdtemp(path.join(tmpdir(), "photo-backfill-"));
  let succeeded = 0;
  let failed = 0;

  try {
    for (const row of rows) {
      if (!row.storage_path) {
        continue;
      }

      try {
        await backfillRow(row, tempDir);
        succeeded += 1;
        console.log(`OK   ${row.storage_path}`);
      } catch (error) {
        failed += 1;
        console.error(`FAIL ${row.storage_path}: ${error.message}`);
      }
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }

  console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

async function fetchPhotoRows() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/trip_photos?select=id,storage_path`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list trip_photos: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function backfillRow(row, tempDir) {
  const fullUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${row.storage_path}`;
  const fullResponse = await fetch(fullUrl);

  if (!fullResponse.ok) {
    throw new Error(`Could not download original: ${fullResponse.status}`);
  }

  const safeName = sanitizeFilename(row.id);
  const originalPath = path.join(tempDir, `${safeName}-full.jpg`);
  await writeFile(originalPath, Buffer.from(await fullResponse.arrayBuffer()));

  for (const variant of VARIANTS) {
    const variantPath = path.join(tempDir, `${safeName}${variant.suffix}.jpg`);

    await execFileAsync("sips", [
      "-z", String(variant.height), String(variant.width),
      "-s", "format", "jpeg",
      "-s", "formatOptions", String(variant.quality),
      originalPath,
      "--out", variantPath,
    ]);

    const variantBuffer = await readFile(variantPath);
    const storagePath = getVariantStoragePath(row.storage_path, variant.suffix);

    const uploadResponse = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      body: variantBuffer,
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed for ${storagePath}: ${uploadResponse.status} ${await uploadResponse.text()}`);
    }
  }
}

function getVariantStoragePath(storagePath, suffix) {
  return storagePath.replace(/(\.[^./]+)$/, `${suffix}$1`);
}

function sanitizeFilename(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
