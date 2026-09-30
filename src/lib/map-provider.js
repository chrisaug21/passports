// Basemap styles. The map engine (MapLibre) draws vector tiles from OpenFreeMap
// (free, no key) and we recolor them with the app's design tokens so the map
// matches the rest of the UI. Attribution comes from the style itself and must
// stay visible.
const VECTOR_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export async function loadMapStyle() {
  try {
    const response = await fetch(VECTOR_STYLE_URL);

    if (!response.ok) {
      throw new Error("MAP_STYLE_FAILED");
    }

    return themeVectorStyle(await response.json());
  } catch (_error) {
    // Uncolored (but working) map beats no map.
    return VECTOR_STYLE_URL;
  }
}

function themeVectorStyle(style) {
  const bg = readTokenColor("--color-bg");
  const water = mixTokens("--color-structure", "--color-bg", 0.18);
  const green = mixTokens("--color-action", "--color-bg", 0.1);
  const building = readTokenColor("--color-border-card");
  const text = readTokenColor("--color-text-muted");
  const border = readTokenColor("--color-text-subtle");

  if (!bg || !water || !green || !building || !text || !border) {
    return style;
  }

  const paintById = {
    background: { "background-color": bg },
    water: { "fill-color": water },
    waterway: { "line-color": water },
    park: { "fill-color": green },
    landcover_wood: { "fill-color": green },
    landuse_residential: { "fill-color": bg },
    building: { "fill-color": building },
    boundary_2: { "line-color": border },
    boundary_3: { "line-color": border },
  };

  style.layers.forEach((layer) => {
    const isLabel = layer.type === "symbol" && /^(label_|water_name|waterway_line_label)/.test(layer.id);
    const overrides = isLabel
      ? { "text-color": text, "text-halo-color": bg }
      : paintById[layer.id];

    if (overrides) {
      layer.paint = { ...layer.paint, ...overrides };
    }
  });

  // Zoomed out, the world is a globe; it flattens smoothly as you zoom in.
  style.projection = { type: "globe" };

  return style;
}

function readTokenChannels(tokenName) {
  const probe = document.createElement("span");
  probe.style.color = `var(${tokenName})`;
  document.body.append(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();

  const channels = computed.match(/[\d.]+/g);
  return channels && channels.length >= 3 ? channels.slice(0, 3).map(Number) : null;
}

function readTokenColor(tokenName) {
  const channels = readTokenChannels(tokenName);
  return channels ? `rgb(${channels.join(", ")})` : null;
}

function mixTokens(topToken, baseToken, amount) {
  const top = readTokenChannels(topToken);
  const base = readTokenChannels(baseToken);

  if (!top || !base) {
    return null;
  }

  return `rgb(${top.map((channel, index) => Math.round(channel * amount + base[index] * (1 - amount))).join(", ")})`;
}

const GEOCODER_ENDPOINT = "/api/location-search";

export async function searchLocations(query) {
  const trimmedQuery = String(query || "").trim();

  if (trimmedQuery.length < 3) {
    return [];
  }

  const url = new URL(GEOCODER_ENDPOINT, window.location.origin);
  url.searchParams.set("q", trimmedQuery);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("LOCATION_SEARCH_FAILED");
  }

  const payload = await response.json();
  const data = Array.isArray(payload?.results) ? payload.results : [];

  if (!Array.isArray(data)) {
    return [];
  }

  return dedupeLocationResults(data
    .map(normalizeLocationResult)
    .filter((result) => result.label && Number.isFinite(result.lat) && Number.isFinite(result.lng)));
}

function normalizeLocationResult(result) {
  const lat = Number(result.lat);
  const lng = Number(result.lng);

  return {
    id: String(result.id || `${result.lat},${result.lng}`),
    label: String(result.label || "").trim(),
    lat,
    lng,
    timezone: String(result.timezone || "").trim(),
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
