const lookupTimezone = require("@photostructure/tz-lookup");

const GEOCODER_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const CACHE_MAX_ENTRIES = 250;
const GEOCODER_MIN_INTERVAL_MS = 1100;
const cache = new Map();
let geocoderQueue = Promise.resolve();
let lastGeocoderRequestAt = 0;

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { error: "METHOD_NOT_ALLOWED" });
  }

  const query = String(event.queryStringParameters?.q || "").trim();

  if (query.length < 3) {
    return jsonResponse(200, { results: [] });
  }

  const cacheKey = normalizeQuery(query);
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return jsonResponse(200, { results: cached.results, cached: true });
  }

  try {
    const url = new URL(GEOCODER_ENDPOINT);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "5");
    url.searchParams.set("q", query);
    url.searchParams.set("accept-language", "en");

    await waitForGeocoderSlot();
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": "Passports travel planner (https://passports.chrisaug.com)",
      },
    });

    if (!response.ok) {
      return jsonResponse(502, { error: "LOCATION_SEARCH_FAILED" });
    }

    const data = await response.json();
    const results = Array.isArray(data)
      ? dedupeLocationResults(data.map(normalizeLocationResult).filter(isValidLocationResult))
      : [];

    remember(cacheKey, results);
    return jsonResponse(200, { results });
  } catch (error) {
    console.error("Location search failed:", error);
    return jsonResponse(500, { error: "LOCATION_SEARCH_FAILED" });
  }
};

function normalizeLocationResult(result) {
  const lat = Number(result.lat);
  const lng = Number(result.lon);

  return {
    id: String(result.place_id || `${result.lat},${result.lon}`),
    label: String(result.display_name || "").trim(),
    lat,
    lng,
    timezone: inferTimezone(lat, lng),
  };
}

function waitForGeocoderSlot() {
  const nextRequest = geocoderQueue.then(async () => {
    const elapsed = Date.now() - lastGeocoderRequestAt;
    const waitMs = Math.max(0, GEOCODER_MIN_INTERVAL_MS - elapsed);

    if (waitMs > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, waitMs);
      });
    }

    lastGeocoderRequestAt = Date.now();
  });

  geocoderQueue = nextRequest.catch(() => {});
  return nextRequest;
}

function inferTimezone(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "";
  }

  try {
    return lookupTimezone(lat, lng) || "";
  } catch (_error) {
    return "";
  }
}

function isValidLocationResult(result) {
  return Boolean(result.label && Number.isFinite(result.lat) && Number.isFinite(result.lng));
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

function normalizeQuery(query) {
  return String(query || "").toLowerCase().replace(/\s+/g, " ").trim();
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

function remember(cacheKey, results) {
  cache.set(cacheKey, {
    createdAt: Date.now(),
    results,
  });

  if (cache.size <= CACHE_MAX_ENTRIES) {
    return;
  }

  const oldestKey = cache.keys().next().value;
  cache.delete(oldestKey);
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
    body: JSON.stringify(body),
  };
}
