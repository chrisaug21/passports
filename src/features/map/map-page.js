import { navigate, renderRoute } from "../../app/router.js";
import { MAP_TILE_PROVIDER } from "../../lib/map-provider.js";
import { formatDestinationTargetDate, formatTripDateSummary } from "../../lib/format.js";
import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import { listBasesForTrips } from "../../services/bases-service.js";
import { loadDashboard, setDashboardRenderer } from "../dashboard/dashboard-page.js";

const MAP_FILTERS = [
  { id: "destinations", label: "Wishlist" },
  { id: "planning", label: "Planning" },
  { id: "active", label: "Active" },
  { id: "done", label: "Archive" },
];

let mapState = {
  status: "idle",
  bases: [],
  error: "",
  selectedStatuses: MAP_FILTERS.map((filter) => filter.id),
  isShowingMobileFilters: false,
  loadedTripSignature: "",
};

let activeMap = null;
let isPopupClickBound = false;

export function renderMapPage() {
  const { dashboard } = appStore.getState();
  const trips = tripStore.getTrips();
  const mapData = buildMapData({ trips, bases: mapState.bases, selectedStatuses: mapState.selectedStatuses });

  return `
    <section class="map-page">
      <div class="map-header">
        <div>
          <p class="eyebrow">Map</p>
          <h1>Travel Map</h1>
        </div>
        <button class="button button--secondary map-header__filter-button" id="toggle-map-filters" type="button">
          <i data-lucide="sliders-horizontal" aria-hidden="true"></i>
          Filters
        </button>
      </div>

      ${renderMapContent({ dashboard, mapData })}
    </section>
  `;
}

export function wireMapPage() {
  document.querySelector("#retry-map-load")?.addEventListener("click", () => {
    loadMapPage({ force: true });
  });

  document.querySelector("#toggle-map-filters")?.addEventListener("click", () => {
    mapState = {
      ...mapState,
      isShowingMobileFilters: !mapState.isShowingMobileFilters,
    };
    renderRoute({ preserveScroll: true });
  });

  document.querySelectorAll("[data-map-filter]").forEach((input) => {
    input.addEventListener("change", () => {
      const status = input.getAttribute("data-map-filter");
      const selectedStatuses = new Set(mapState.selectedStatuses);

      if (input.checked) {
        selectedStatuses.add(status);
      } else {
        selectedStatuses.delete(status);
      }

      mapState = {
        ...mapState,
        selectedStatuses: [...selectedStatuses],
      };
      renderRoute({ preserveScroll: true });
    });
  });

  document.querySelectorAll("[data-map-open-trip]").forEach((button) => {
    button.addEventListener("click", () => {
      openTrip(button.getAttribute("data-map-open-trip"));
    });
  });

  if (!isPopupClickBound) {
    document.addEventListener("click", handleMapPopupClick);
    isPopupClickBound = true;
  }
  initializeMap();
}

export async function loadMapPage(options = {}) {
  setDashboardRenderer(() => {
    renderRoute({ preserveScroll: true });
  });

  if (!options.force && mapState.status === "loading") {
    return;
  }

  const currentTripSignature = getTripSignature();

  if (
    !options.force &&
    mapState.status === "ready" &&
    appStore.getState().dashboard.status === "ready" &&
    mapState.loadedTripSignature === currentTripSignature
  ) {
    return;
  }

  mapState = {
    ...mapState,
    status: "loading",
    error: "",
  };
  renderRoute({ preserveScroll: true });

  try {
    if (options.force || appStore.getState().dashboard.status === "idle") {
      await loadDashboard();
    }

    const tripIds = tripStore.getTrips().map((trip) => trip.id).filter(Boolean);
    const bases = await listBasesForTrips(tripIds);

    mapState = {
      ...mapState,
      status: "ready",
      bases,
      error: "",
      loadedTripSignature: getTripSignature(),
    };
    renderRoute({ preserveScroll: true });
  } catch (error) {
    console.error(error);
    mapState = {
      ...mapState,
      status: "error",
      error: "We could not load your map.",
    };
    renderRoute({ preserveScroll: true });
  }
}

function getTripSignature() {
  return tripStore.getTrips().map((trip) => `${trip.id}:${trip.updated_at || ""}:${trip.status || ""}`).join("|");
}

function renderMapContent({ dashboard, mapData }) {
  if (dashboard.status === "loading" || mapState.status === "loading") {
    return `
      <section class="panel dashboard-state">
        <h3>Loading map...</h3>
        <p class="muted">Pulling your destinations and bases together now.</p>
      </section>
    `;
  }

  if (dashboard.status === "error" || mapState.status === "error") {
    return `
      <section class="panel dashboard-state">
        <h3>Could not load map</h3>
        <p class="muted">${escapeHtml(mapState.error || dashboard.error || "Try refreshing the page.")}</p>
        <button class="button button--secondary" id="retry-map-load" type="button">Try Again</button>
      </section>
    `;
  }

  if (dashboard.status !== "ready" || mapState.status !== "ready") {
    return "";
  }

  if (tripStore.getTrips().length === 0) {
    return `
      <section class="panel dashboard-state">
        <p class="eyebrow">Map</p>
        <h3>No trips or destinations yet.</h3>
        <p class="muted">Create a Wishlist destination or trip to start building your map.</p>
      </section>
    `;
  }

  return `
    <div class="map-layout">
      <aside class="map-sidebar ${mapState.isShowingMobileFilters ? "is-open" : ""}">
        ${renderMapFilters()}
        ${renderMissingLocations(mapData.missingLocations)}
      </aside>
      <section class="map-canvas-shell">
        <div
          class="travel-map"
          id="travel-map"
          data-map-pins="${escapeHtml(JSON.stringify(mapData.pins))}"
          aria-label="Travel map"
        ></div>
        ${mapData.pins.length === 0 ? renderNoPinsState(mapData.missingLocations) : ""}
      </section>
    </div>
  `;
}

function renderMapFilters() {
  return `
    <section class="map-panel">
      <div class="map-panel__header">
        <p class="eyebrow">Filters</p>
        <h2>Show pins</h2>
      </div>
      <div class="map-filters">
        ${MAP_FILTERS.map((filter) => `
          <label class="map-filter">
            <input
              type="checkbox"
              data-map-filter="${escapeHtml(filter.id)}"
              ${mapState.selectedStatuses.includes(filter.id) ? "checked" : ""}
            />
            <span>${escapeHtml(filter.label)}</span>
          </label>
        `).join("")}
      </div>
    </section>
  `;
}

function renderMissingLocations(missingLocations) {
  if (missingLocations.length === 0) {
    return `
      <section class="map-panel">
        <div class="map-panel__header">
          <p class="eyebrow">Locations</p>
          <h2>All places mapped</h2>
        </div>
        <p class="muted">Every visible base has coordinates.</p>
      </section>
    `;
  }

  return `
    <section class="map-panel">
      <div class="map-panel__header">
        <p class="eyebrow">Locations</p>
        <h2>${missingLocations.length} ${missingLocations.length === 1 ? "place needs" : "places need"} locations</h2>
      </div>
      <div class="map-missing-list">
        ${missingLocations.map(renderMissingLocation).join("")}
      </div>
    </section>
  `;
}

function renderMissingLocation(entry) {
  return `
    <button class="map-missing-item" type="button" data-map-open-trip="${escapeHtml(entry.trip.id)}">
      <span>${escapeHtml(entry.trip.title || "Untitled trip")}</span>
      <small>${escapeHtml(entry.base?.name || entry.base?.location_name || "Add a base location")}</small>
    </button>
  `;
}

function renderNoPinsState(missingLocations) {
  const copy = missingLocations.length > 0
    ? "Add locations to the places listed here and they will show up as pins."
    : "Turn on at least one filter to see matching pins.";

  return `
    <div class="map-empty-state">
      <p class="eyebrow">No Pins</p>
      <h3>No mapped places to show.</h3>
      <p class="muted">${escapeHtml(copy)}</p>
    </div>
  `;
}

function initializeMap() {
  const mapEl = document.querySelector("#travel-map");

  if (!mapEl || !window.L) {
    return;
  }

  if (activeMap) {
    activeMap.remove();
    activeMap = null;
  }

  const pins = parsePins(mapEl.getAttribute("data-map-pins"));
  const map = window.L.map(mapEl, {
    worldCopyJump: true,
  }).setView([20, 0], 2);

  window.L.tileLayer(MAP_TILE_PROVIDER.urlTemplate, {
    attribution: MAP_TILE_PROVIDER.attribution,
    maxZoom: 18,
  }).addTo(map);

  const markerLayer = window.L.markerClusterGroup
    ? window.L.markerClusterGroup({ showCoverageOnHover: false })
    : window.L.layerGroup();

  pins.forEach((pin) => {
    const marker = window.L.marker([pin.lat, pin.lng], {
      icon: createMapIcon(pin.status),
      title: pin.title,
    }).bindPopup(renderPinPopup(pin));

    markerLayer.addLayer(marker);
  });

  markerLayer.addTo(map);

  if (pins.length > 0) {
    const bounds = window.L.latLngBounds(pins.map((pin) => [pin.lat, pin.lng]));
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 7 });
  }

  requestAnimationFrame(() => {
    map.invalidateSize();

    requestAnimationFrame(() => {
      map.invalidateSize();
    });
  });

  setTimeout(() => {
    map.invalidateSize();
  }, 250);

  activeMap = map;
}

function createMapIcon(status) {
  return window.L.divIcon({
    className: `travel-map-pin travel-map-pin--${status}`,
    html: '<span aria-hidden="true"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
}

function renderPinPopup(pin) {
  return `
    <article class="map-popup">
      <p class="eyebrow">${escapeHtml(getStatusLabel(pin.status))}</p>
      <h3>${escapeHtml(pin.title)}</h3>
      <p>${escapeHtml(pin.baseName)}</p>
      ${pin.dateLabel ? `<p class="muted">${escapeHtml(pin.dateLabel)}</p>` : ""}
      <button class="button button--secondary" type="button" data-map-popup-open="${escapeHtml(pin.tripId)}">
        Open
      </button>
    </article>
  `;
}

function buildMapData({ trips, bases, selectedStatuses }) {
  const selectedSet = new Set(selectedStatuses);
  const tripsById = new Map(trips.map((trip) => [trip.id, trip]));
  const basesByTripId = groupBasesByTripId(bases);
  const pins = [];
  const missingLocations = [];

  trips.forEach((trip) => {
    if (!selectedSet.has(trip.status)) {
      return;
    }

    const tripBases = basesByTripId.get(trip.id) || [];

    if (tripBases.length === 0) {
      missingLocations.push({ trip, base: null });
      return;
    }

    tripBases.forEach((base) => {
      const lat = Number(base.lat);
      const lng = Number(base.lng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        missingLocations.push({ trip, base });
        return;
      }

      pins.push({
        id: `${base.id}-${trip.status}`,
        tripId: trip.id,
        title: trip.title || "Untitled trip",
        baseName: base.name || base.location_name || trip.title || "Untitled base",
        status: trip.status,
        dateLabel: trip.status === "destinations"
          ? formatDestinationTargetDate(trip)
          : formatTripDateSummary(trip, { includeYear: trip.status === "done" }),
        lat,
        lng,
      });
    });
  });

  return {
    pins,
    missingLocations: missingLocations.filter((entry) => tripsById.has(entry.trip.id)),
  };
}

function groupBasesByTripId(bases) {
  return bases.reduce((map, base) => {
    const tripBases = map.get(base.trip_id) || [];
    tripBases.push(base);
    map.set(base.trip_id, tripBases);
    return map;
  }, new Map());
}

function parsePins(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function handleMapPopupClick(event) {
  const button = event.target.closest("[data-map-popup-open]");

  if (!button) {
    return;
  }

  openTrip(button.getAttribute("data-map-popup-open"));
}

function openTrip(tripId) {
  const trip = tripStore.getTrips().find((entry) => String(entry.id) === String(tripId));

  if (!trip) {
    return;
  }

  if (trip.status === "destinations") {
    navigate("/app/destinations");
    return;
  }

  if (trip.status === "active") {
    navigate(`/app/trip/${trip.id}/guide`);
    return;
  }

  if (trip.status === "done") {
    navigate(`/app/trip/${trip.id}/guide#journal`);
    return;
  }

  navigate(`/app/trip/${trip.id}`);
}

function getStatusLabel(status) {
  const filter = MAP_FILTERS.find((entry) => entry.id === status);
  return filter?.label || "Trip";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
