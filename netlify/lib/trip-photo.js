// Finds a trip's hero photo for use in an email. Shared by every trip email.

// Public bucket holding uploaded trip photos (see PHOTO_BUCKET in
// src/services/photos-service.js). The "-720x480" file is the mid-size copy.
const PHOTO_BUCKET = "trip-photos";

// The mid-size copy keeps the email light, but photos uploaded before the app
// made size variants only have the full-size file — so check for the smaller
// one and fall back rather than emailing a broken image.
async function getEmailPhotoUrl(storagePath) {
  const publicBase = `${process.env.SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}`;
  const fullUrl = `${publicBase}/${storagePath}`;
  const previewUrl = `${publicBase}/${storagePath.replace(/(\.[^./]+)$/, "-720x480$1")}`;

  try {
    const response = await fetch(previewUrl, { method: "HEAD" });
    return response.ok ? previewUrl : fullUrl;
  } catch {
    return fullUrl;
  }
}

// Turns a trip_photos row (or undefined) into what the email layout expects.
async function buildEmailPhoto(photoRow) {
  if (!photoRow?.storage_path) return null;
  return {
    url: await getEmailPhotoUrl(photoRow.storage_path),
    creditName: photoRow.source === "unsplash" ? photoRow.credit_name : null,
  };
}

// The query params that select a trip's primary trip-level hero photo.
function heroPhotoParams(tripId) {
  return {
    select: "storage_path,source,credit_name",
    trip_id: `eq.${tripId}`,
    is_primary: "eq.true",
    base_id: "is.null",
    day_id: "is.null",
    item_id: "is.null",
    order: "updated_at.desc",
    limit: "1",
  };
}

module.exports = { buildEmailPhoto, heroPhotoParams };
