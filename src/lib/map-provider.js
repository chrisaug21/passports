export const MAP_TILE_PROVIDER = {
  urlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

const GEOCODER_ENDPOINT = "https://nominatim.openstreetmap.org/search";

export async function searchLocations(query) {
  const trimmedQuery = String(query || "").trim();

  if (trimmedQuery.length < 3) {
    return [];
  }

  const url = new URL(GEOCODER_ENDPOINT);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("q", trimmedQuery);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("LOCATION_SEARCH_FAILED");
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    return [];
  }

  return dedupeLocationResults(data
    .map(normalizeLocationResult)
    .filter((result) => result.label && Number.isFinite(result.lat) && Number.isFinite(result.lng)));
}

function normalizeLocationResult(result) {
  return {
    id: String(result.place_id || `${result.lat},${result.lon}`),
    label: String(result.display_name || "").trim(),
    lat: Number(result.lat),
    lng: Number(result.lon),
  };
}

function dedupeLocationResults(results) {
  const seenKeys = new Set();
  const dedupedResults = [];

  results.forEach((result) => {
    const labelKey = normalizeLocationKey(result.label);
    const coordinateKey = normalizeCoordinateKey(result);
    const keys = [labelKey, coordinateKey].filter(Boolean);

    if (keys.length === 0 || keys.some((key) => seenKeys.has(key))) {
      return;
    }

    keys.forEach((key) => {
      seenKeys.add(key);
    });
    dedupedResults.push(result);
  });

  return dedupedResults;
}

function normalizeLocationKey(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function normalizeCoordinateKey(result) {
  if (!Number.isFinite(result.lat) || !Number.isFinite(result.lng)) {
    return "";
  }

  return `${result.lat.toFixed(3)},${result.lng.toFixed(3)}`;
}
