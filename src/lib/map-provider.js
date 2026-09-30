import { initializeEnv } from "../config/env.js";

// Basemap styles. MapLibre draws them all, so switching is cheap:
//  - "vector" styles: OpenFreeMap tiles (free, no key). "Paper" is
//    recolored from the app's design tokens; the others are OpenFreeMap's own looks.
//  - "raster" styles: Stadia Maps / Stamen tiles (need STADIA_MAPS_API_KEY).
// Each style's attribution comes with it and must stay visible.
const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles";
const STADIA_TILES_URL = "https://tiles.stadiamaps.com/tiles";
const STADIA_ATTRIBUTION = '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a> &copy; <a href="https://stamen.com/" target="_blank" rel="noopener">Stamen Design</a> &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
const MAP_STYLE_STORAGE_KEY = "passports.mapStyle";
const DEFAULT_MAP_STYLE_ID = "vivid";

// Order here is the order in the picker; the first entry is the default.
export const MAP_STYLES = [
  { id: "vivid", label: "Vivid", hint: "Colorful, detailed streets", type: "vector", source: "liberty" },
  { id: "paper", label: "Paper", hint: "Warm parchment atlas", type: "vector", source: "positron", theme: "paper" },
  { id: "night", label: "Night", hint: "Dark navy", type: "vector", source: "fiord" },
  { id: "terrain", label: "Terrain", hint: "Illustrated relief map", type: "raster", tileSet: "stamen_terrain", format: "png", maxzoom: 18, attribution: STADIA_ATTRIBUTION },
  { id: "watercolor", label: "Watercolor", hint: "Painted, no labels", type: "raster", tileSet: "stamen_watercolor", format: "jpg", maxzoom: 16, attribution: STADIA_ATTRIBUTION },
];

// Colors for the recolored vector styles, as design tokens to read at load time.
// Each entry is [token] or [topToken, baseToken, amount] (a blend of the two).
const VECTOR_THEMES = {
  paper: {
    land: ["--color-status-done", "--color-surface-strong", 0.28],
    water: ["--color-item-activity", "--color-surface-strong", 0.2],
    park: ["--color-action", "--color-surface-strong", 0.16],
    building: ["--color-status-done", "--color-surface-strong", 0.42],
    border: ["--color-status-done", "--color-text", 0.6],
    label: ["--color-text", "--color-status-done", 0.55],
  },
};

let stadiaKeyPromise;

function getStadiaKey() {
  if (!stadiaKeyPromise) {
    stadiaKeyPromise = initializeEnv()
      .then((env) => env?.stadiaMapsApiKey || "")
      .catch(() => "");
  }

  return stadiaKeyPromise;
}

// Styles that need the Stadia key are left out when it isn't configured.
export async function getAvailableMapStyles() {
  const hasStadiaKey = Boolean(await getStadiaKey());
  return MAP_STYLES.filter((style) => style.type === "vector" || hasStadiaKey);
}

export function getSelectedMapStyleId() {
  try {
    return window.localStorage.getItem(MAP_STYLE_STORAGE_KEY) || DEFAULT_MAP_STYLE_ID;
  } catch (_error) {
    return DEFAULT_MAP_STYLE_ID;
  }
}

export function setSelectedMapStyleId(styleId) {
  try {
    window.localStorage.setItem(MAP_STYLE_STORAGE_KEY, styleId);
  } catch (_error) {
    // Private mode etc.: the choice just won't persist.
  }
}

export async function loadMapStyle(styleId) {
  const definition = MAP_STYLES.find((style) => style.id === styleId) || MAP_STYLES[0];
  const apiKey = await getStadiaKey();

  if (definition.type === "raster" && apiKey) {
    return buildRasterStyle(definition, apiKey);
  }

  return loadVectorStyle(definition.type === "vector" ? definition : MAP_STYLES[0]);
}

function buildRasterStyle(definition, apiKey) {
  const tileUrl = `${STADIA_TILES_URL}/${definition.tileSet}/{z}/{x}/{y}.${definition.format}?api_key=${encodeURIComponent(apiKey)}`;

  return {
    version: 8,
    projection: { type: "globe" },
    sources: {
      basemap: {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: definition.maxzoom,
        attribution: definition.attribution,
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
}

async function loadVectorStyle(definition) {
  const styleUrl = `${OPENFREEMAP_STYLE_URL}/${definition.source}`;

  try {
    const response = await fetch(styleUrl);

    if (!response.ok) {
      throw new Error("MAP_STYLE_FAILED");
    }

    const style = await response.json();
    // Zoomed out, the world is a globe; it flattens smoothly as you zoom in.
    style.projection = { type: "globe" };
    return definition.theme ? themeVectorStyle(style, VECTOR_THEMES[definition.theme]) : style;
  } catch (_error) {
    // Uncolored (but working) map beats no map.
    return styleUrl;
  }
}

function themeVectorStyle(style, theme) {
  const land = resolveThemeColor(theme.land);
  const water = resolveThemeColor(theme.water);
  const park = resolveThemeColor(theme.park);
  const building = resolveThemeColor(theme.building);
  const border = resolveThemeColor(theme.border);
  const label = resolveThemeColor(theme.label);

  if (!land || !water || !park || !building || !border || !label) {
    return style;
  }

  const paintById = {
    background: { "background-color": land },
    water: { "fill-color": water },
    waterway: { "line-color": water },
    park: { "fill-color": park },
    landcover_wood: { "fill-color": park },
    landuse_residential: { "fill-color": land },
    building: { "fill-color": building },
    boundary_2: { "line-color": border },
    boundary_3: { "line-color": border },
  };

  style.layers.forEach((layer) => {
    const isLabel = layer.type === "symbol" && /^(label_|water_name|waterway_line_label)/.test(layer.id);
    const overrides = isLabel
      ? { "text-color": label, "text-halo-color": land }
      : paintById[layer.id];

    if (overrides) {
      layer.paint = { ...layer.paint, ...overrides };
    }
  });

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

// [token] -> that token's color; [top, base, amount] -> `amount` of top over base.
function resolveThemeColor([topToken, baseToken, amount]) {
  const top = readTokenChannels(topToken);
  const base = baseToken ? readTokenChannels(baseToken) : null;

  if (!top || (baseToken && !base)) {
    return null;
  }

  const channels = base
    ? top.map((channel, index) => Math.round(channel * amount + base[index] * (1 - amount)))
    : top;

  return `rgb(${channels.join(", ")})`;
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
