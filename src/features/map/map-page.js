import { navigate, renderRoute } from "../../app/router.js";
import { getAvailableMapStyles, getSelectedMapStyleId, loadMapStyle, setSelectedMapStyleId } from "../../lib/map-provider.js";
import { createTravelMap } from "./map-canvas.js";
import { mountMapStylePicker } from "./map-style-picker.js";
import { formatDestinationTargetDate, formatShortDateRange, formatTripDateSummary } from "../../lib/format.js";
import { appStore } from "../../state/app-store.js";
import { tripStore } from "../../state/trip-store.js";
import { getPhotoObjectPosition } from "../../services/photos-service.js";
import { listBasesForTrips } from "../../services/bases-service.js";
import { listDaysForTrips } from "../../services/days-service.js";
import { loadDashboard, setDashboardRenderer } from "../dashboard/dashboard-page.js";
import { openDestinationCard } from "../destinations/destinations-wire.js";

const MAP_FILTERS = [
  { id: "destinations", label: "Someday" },
  { id: "planning", label: "Planned" },
  { id: "active", label: "Traveling Now" },
  { id: "done", label: "Visited" },
];

let mapState = {
  status: "idle",
  bases: [],
  days: [],
  error: "",
  selectedStatuses: MAP_FILTERS.map((filter) => filter.id),
  isShowingMobileFilters: false,
  loadedTripSignature: "",
  loadedBaseDataVersion: 0,
};

let activeMap = null;
let mapInitToken = 0;
let baseDataVersion = 0;
let isPopupClickBound = false;

window.addEventListener("passports:map-data-invalidated", () => {
  baseDataVersion += 1;
  invalidateMapPageData();
});

export function renderMapPage() {
  const { dashboard } = appStore.getState();
  const trips = tripStore.getTrips();
  const mapData = buildMapData({
    trips,
    bases: mapState.bases,
    days: mapState.days,
    selectedStatuses: mapState.selectedStatuses,
  });
  const hasActiveFilters = mapState.isShowingMobileFilters || mapState.selectedStatuses.length < MAP_FILTERS.length;

  return `
    <section class="map-page">
      <div class="map-header">
        <div>
          <p class="eyebrow">Map</p>
          <h1>Travel Map</h1>
        </div>
        <button class="button button--secondary map-header__filter-button ${hasActiveFilters ? "is-active" : ""}" id="toggle-map-filters" type="button">
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

  document.querySelector("#reset-map-view")?.addEventListener("click", () => {
    resetActiveMapView();
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

  document.querySelectorAll("[data-map-repair-trip]").forEach((button) => {
    button.addEventListener("click", () => {
      openRepairTarget(button.getAttribute("data-map-repair-trip"));
    });
  });

  if (!isPopupClickBound) {
    document.addEventListener("click", handleMapPopupClick);
    isPopupClickBound = true;
  }
  initializeMap();
}

export function invalidateMapPageData() {
  mapState = {
    ...mapState,
    loadedTripSignature: "",
  };
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
    mapState.loadedTripSignature === currentTripSignature &&
    mapState.loadedBaseDataVersion === baseDataVersion
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

    const requestedTripSignature = getTripSignature();
    const requestedBaseDataVersion = baseDataVersion;
    const tripIds = tripStore.getTrips().map((trip) => trip.id).filter(Boolean);
    const [bases, days] = await Promise.all([
      listBasesForTrips(tripIds),
      listDaysForTrips(tripIds),
    ]);

    if (requestedTripSignature !== getTripSignature() || requestedBaseDataVersion !== baseDataVersion) {
      mapState = {
        ...mapState,
        status: "idle",
      };
      await loadMapPage();
      return;
    }

    mapState = {
      ...mapState,
      status: "ready",
      bases,
      days,
      error: "",
      loadedTripSignature: requestedTripSignature,
      loadedBaseDataVersion: requestedBaseDataVersion,
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
        <button class="map-reset-button" id="reset-map-view" type="button" aria-label="Show all pins">
          <i data-lucide="globe-2" aria-hidden="true"></i>
          Reset
        </button>
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
            <span class="map-filter__legend map-filter__legend--${escapeHtml(filter.id)}" aria-hidden="true"></span>
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
  const actionLabel = getMissingLocationActionLabel(entry);

  return `
    <button class="map-missing-item" type="button" data-map-repair-trip="${escapeHtml(entry.trip.id)}">
      <span>${escapeHtml(entry.trip.title || "Untitled trip")}</span>
      <small>${escapeHtml(`${entry.base?.name || entry.base?.location_name || "Add a base"} · ${actionLabel}`)}</small>
    </button>
  `;
}

function getMissingLocationActionLabel(entry) {
  if (entry.trip.status === "destinations") {
    return entry.base ? "Edit Wishlist base" : "Add Wishlist base";
  }

  return entry.base ? "Edit base location" : "Open trip settings";
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

async function initializeMap({ camera } = {}) {
  const mapEl = document.querySelector("#travel-map");

  if (!mapEl || !window.maplibregl) {
    return;
  }

  // The page re-renders on every filter change; only the newest call may
  // build a map, since loading the style is async.
  const initToken = ++mapInitToken;

  if (activeMap) {
    activeMap.remove();
    activeMap = null;
  }

  const pins = parsePins(mapEl.getAttribute("data-map-pins"));
  const pinGroups = groupPinsByCoordinates(pins);
  const availableStyles = await getAvailableMapStyles();
  const selectedStyleId = availableStyles.some((entry) => entry.id === getSelectedMapStyleId())
    ? getSelectedMapStyleId()
    : availableStyles[0].id;
  const style = await loadMapStyle(selectedStyleId);

  if (initToken !== mapInitToken || !mapEl.isConnected) {
    return;
  }

  activeMap = createTravelMap({
    container: mapEl,
    style,
    pinGroups,
    camera,
    createPinElement: createMapPinElement,
    renderPopupHtml: renderPinPopup,
    onPopupOpen: wirePopupPhotoFallback,
  });

  mountMapStylePicker({
    shell: mapEl.closest(".map-canvas-shell"),
    styles: availableStyles,
    selectedId: selectedStyleId,
    onSelect: (styleId) => {
      setSelectedMapStyleId(styleId);
      // Rebuild on the new style, keeping the current view.
      initializeMap({ camera: activeMap?.getCamera() });
    },
  });
}

// Popup HTML only exists once a pin is clicked, so wire the image fallback
// (card-size -> full-size) each time a popup opens.
function wirePopupPhotoFallback(popupElement) {
  popupElement?.querySelectorAll("[data-map-popup-photo]").forEach((image) => {
    // Popup HTML is built before it opens, so the photo may have already
    // failed by now (its "error" event is long gone). Check for that too.
    const handleFailure = () => {
      const fallbackUrl = image.getAttribute("data-full-src");

      if (fallbackUrl && image.src !== fallbackUrl) {
        image.src = fallbackUrl;
        image.removeAttribute("data-full-src");
        return;
      }

      image.remove();
    };

    image.addEventListener("error", handleFailure);

    if (image.complete && image.naturalWidth === 0) {
      handleFailure();
    }
  });
}

function resetActiveMapView() {
  activeMap?.fitAll();
}

function createMapPinElement(pinGroup) {
  const statuses = pinGroup.statuses || [pinGroup.status];
  const isMultiPin = statuses.length > 1 || pinGroup.pins?.length > 1;
  const element = document.createElement("div");

  element.className = `travel-map-pin travel-map-pin--${getStatusClassName(pinGroup.status)} ${isMultiPin ? "travel-map-pin--multi" : ""}`;
  element.append(isMultiPin ? createMultiPinSegments(statuses) : createSpan());
  return element;
}

function createMultiPinSegments(statuses) {
  const segments = createSpan("travel-map-pin__segments");

  statuses.slice(0, 4).forEach((status) => {
    segments.append(createSpan(`travel-map-pin__segment travel-map-pin__segment--${getStatusClassName(status)}`));
  });

  return segments;
}

function createSpan(className = "") {
  const span = document.createElement("span");
  span.className = className;
  span.setAttribute("aria-hidden", "true");
  return span;
}

function renderPinPopup(pin) {
  if (pin.pins?.length > 1) {
    return renderGroupedPinPopup(pin);
  }

  return `
    <article class="map-popup map-popup--single">
      <p class="eyebrow">${escapeHtml(getStatusLabel(pin.status))}</p>
      ${renderPopupTripCard(pin)}
    </article>
  `;
}

function renderGroupedPinPopup(pinGroup) {
  const groupTitle = getGroupedPinTitle(pinGroup);

  return `
    <article class="map-popup map-popup--group">
      <p class="eyebrow">${pinGroup.pins.length} Trips</p>
      <h3>${escapeHtml(groupTitle)}</h3>
      <div class="map-popup__list">
        ${pinGroup.pins.map((pin) => renderPopupTripCard(pin, {
          isGrouped: true,
          hideBaseName: shouldHideGroupedBaseName(pinGroup, groupTitle),
        })).join("")}
      </div>
    </article>
  `;
}

function renderPopupTripCard(pin, options = {}) {
  const isGrouped = options.isGrouped === true;
  const primaryLabel = getSinglePinPlaceLabel(pin);
  const secondaryLabel = pin.title;

  return `
    <article class="map-popup__trip-card">
      ${renderPopupTripPhoto(pin)}
      <div class="map-popup__trip-copy">
        ${isGrouped ? renderGroupedTripCardCopy(pin, options) : `
          <h4>${escapeHtml(primaryLabel)}</h4>
          ${secondaryLabel ? `<p><strong>Trip:</strong> ${escapeHtml(secondaryLabel)}</p>` : ""}
        `}
        ${pin.dateLabel ? `<small>${escapeHtml(pin.dateLabel)}</small>` : ""}
      </div>
      ${pin.status === "destinations" ? "" : `
        <button class="button button--secondary map-popup__open" type="button" data-map-popup-open="${escapeHtml(pin.tripId)}">
          Open
        </button>
      `}
    </article>
  `;
}

function renderGroupedTripCardCopy(pin, options) {
  return `
    <p class="map-popup__trip-label">
      <span><strong>Trip:</strong> ${escapeHtml(pin.title)}</span>
      <span class="map-popup__status-dot map-popup__status-dot--${getStatusClassName(pin.status)}" aria-hidden="true"></span>
    </p>
    ${options.hideBaseName || !pin.baseName ? "" : `<p><strong>Base:</strong> ${escapeHtml(pin.baseName)}</p>`}
  `;
}

// The placeholder is always rendered; a photo, when there is one, is layered on
// top of it. If the photo fails to load it is removed and the placeholder shows,
// so there is never a broken-image icon.
function renderPopupTripPhoto(pin) {
  const photo = pin.coverPhotoUrl
    ? `
      <img
        class="map-popup__trip-photo-image"
        src="${escapeHtml(pin.coverPhotoUrl)}"
        ${pin.coverPhotoFullUrl ? `data-full-src="${escapeHtml(pin.coverPhotoFullUrl)}"` : ""}
        data-map-popup-photo
        style="object-position: ${pin.coverPhotoPosition}"
        alt=""
        loading="lazy"
      />
    `
    : "";

  return `
    <span class="map-popup__trip-photo" aria-hidden="true">
      <svg class="map-popup__trip-photo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      ${photo}
    </span>
  `;
}

function buildMapData({ trips, bases, days, selectedStatuses }) {
  const selectedSet = new Set(selectedStatuses);
  const tripsById = new Map(trips.map((trip) => [trip.id, trip]));
  const basesByTripId = groupBasesByTripId(bases);
  const daysByBaseId = groupDaysByBaseId(days);
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
      const lat = parseCoordinate(base.lat);
      const lng = parseCoordinate(base.lng);

      if (lat == null || lng == null) {
        missingLocations.push({ trip, base });
        return;
      }

      pins.push({
        id: `${base.id}-${trip.status}`,
        tripId: trip.id,
        title: trip.title || "Untitled trip",
        baseName: tripBases.length > 1 ? base.name || base.location_name || "Untitled base" : "",
        baseLabel: base.name || "",
        displayPlaceName: base.name || base.location_name || trip.title || "Untitled place",
        // The popup thumbnail is tiny, so prefer the small card-size image
        // and keep the full-size photo as a fallback (older photos that
        // haven't been backfilled don't have a card-size file yet).
        coverPhotoUrl: trip.hero_photo_card_url || trip.hero_photo_url || trip.cover_photo_url || "",
        coverPhotoPosition: getPhotoObjectPosition(trip.hero_photo),
        coverPhotoFullUrl: trip.hero_photo_card_url && trip.hero_photo_url ? trip.hero_photo_url : "",
        placeLabel: base.location_name || base.name || trip.title || "Untitled place",
        status: trip.status,
        dateLabel: trip.status === "destinations"
          ? formatMapDestinationDate(trip)
          : formatBaseDateSummary({ trip, base, days: daysByBaseId.get(base.id) || [] }),
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

function formatBaseDateSummary({ trip, days }) {
  if (!trip?.start_date) {
    return formatTripDateSummary(trip, { includeYear: true });
  }

  if (!Array.isArray(days) || days.length === 0) {
    return formatTripDateSummary(trip, { includeYear: true });
  }

  const sortedDayNumbers = days
    .map((day) => Number(day.day_number))
    .filter((dayNumber) => Number.isInteger(dayNumber))
    .sort((left, right) => left - right);

  const firstDay = sortedDayNumbers[0];
  const lastDay = sortedDayNumbers[sortedDayNumbers.length - 1];

  return formatMapDateRange(trip.start_date, firstDay, lastDay)
    || formatTripDateSummary(trip, { includeYear: true });
}

function formatMapDestinationDate(trip) {
  const dateLabel = formatDestinationTargetDate(trip);
  return dateLabel === "Someday" ? "" : dateLabel;
}

function formatMapDateRange(startDate, startDayNumber, endDayNumber) {
  const shortDateRange = formatShortDateRange(startDate, startDayNumber, endDayNumber);

  if (!shortDateRange) {
    return "";
  }

  const start = getDateByDayNumber(startDate, startDayNumber);
  const end = getDateByDayNumber(startDate, endDayNumber);

  if (!start || !end) {
    return shortDateRange;
  }

  const year = end.getFullYear();
  return `${shortDateRange}, ${year}`;
}

function getDateByDayNumber(startDate, dayNumber) {
  const normalizedDayNumber = Number(dayNumber);

  if (!startDate || !Number.isInteger(normalizedDayNumber) || normalizedDayNumber < 1) {
    return null;
  }

  const date = new Date(`${startDate}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setDate(date.getDate() + normalizedDayNumber - 1);
  return date;
}

function groupBasesByTripId(bases) {
  return bases.reduce((map, base) => {
    const tripBases = map.get(base.trip_id) || [];
    tripBases.push(base);
    map.set(base.trip_id, tripBases);
    return map;
  }, new Map());
}

function groupDaysByBaseId(days) {
  return days.reduce((map, day) => {
    if (!day.base_id) {
      return map;
    }

    const baseDays = map.get(day.base_id) || [];
    baseDays.push(day);
    map.set(day.base_id, baseDays);
    return map;
  }, new Map());
}

function groupPinsByCoordinates(pins) {
  const groupedPins = [];
  const groupsByKey = new Map();

  pins.forEach((pin) => {
    const key = getCoordinateGroupKey(pin);
    const existingGroup = groupsByKey.get(key);

    if (existingGroup) {
      existingGroup.pins.push(pin);
      existingGroup.statuses = getUniqueStatuses(existingGroup.pins);
      existingGroup.status = existingGroup.statuses[0] || pin.status;
      existingGroup.title = `${existingGroup.pins.length} trips`;
      return;
    }

    const group = {
      ...pin,
      placeLabel: pin.placeLabel || pin.baseName || pin.title,
      pins: [pin],
      statuses: [pin.status],
    };
    groupsByKey.set(key, group);
    groupedPins.push(group);
  });

  return groupedPins;
}

function getGroupedPinTitle(pinGroup) {
  const sharedBaseLabel = getSharedPinValue(pinGroup.pins, "baseLabel");

  if (sharedBaseLabel && !isGenericBaseLabel(sharedBaseLabel)) {
    return sharedBaseLabel;
  }

  return getSharedPinValue(pinGroup.pins, "placeLabel") || pinGroup.placeLabel || "Mapped place";
}

function shouldHideGroupedBaseName(pinGroup, groupTitle) {
  if (!groupTitle) {
    return false;
  }

  const sharedBaseName = getSharedPinValue(pinGroup.pins, "baseName");
  return Boolean(sharedBaseName) && normalizeLabel(sharedBaseName) === normalizeLabel(groupTitle);
}

function getSinglePinPlaceLabel(pin) {
  return pin.displayPlaceName || pin.baseLabel || pin.placeLabel || pin.title || "Mapped place";
}

function getSharedPinValue(pins, key) {
  const values = pins
    .map((pin) => String(pin[key] || "").trim())
    .filter(Boolean);

  if (values.length === 0) {
    return "";
  }

  const firstValue = values[0];
  const normalizedFirstValue = normalizeLabel(firstValue);

  return values.every((value) => normalizeLabel(value) === normalizedFirstValue) ? firstValue : "";
}

function isGenericBaseLabel(value) {
  const normalizedValue = normalizeLabel(value);
  return normalizedValue === "main base" || normalizedValue === "untitled base";
}

function normalizeLabel(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function getCoordinateGroupKey(pin) {
  return `${Number(pin.lat).toFixed(4)},${Number(pin.lng).toFixed(4)}`;
}

function getUniqueStatuses(pins) {
  const statuses = [];

  pins.forEach((pin) => {
    if (!statuses.includes(pin.status)) {
      statuses.push(pin.status);
    }
  });

  return statuses;
}

function parsePins(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function parseCoordinate(value) {
  if (value == null || String(value).trim() === "") {
    return null;
  }

  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
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

function openRepairTarget(tripId) {
  const trip = tripStore.getTrips().find((entry) => String(entry.id) === String(tripId));

  if (!trip) {
    return;
  }

  if (trip.status === "destinations") {
    navigate("/app/destinations");
    window.setTimeout(() => {
      openDestinationCard(trip.id);
    }, 0);
    return;
  }

  openTrip(trip.id);
}

function getStatusLabel(status) {
  const filter = MAP_FILTERS.find((entry) => entry.id === status);
  return filter?.label || "Trip";
}

function getStatusClassName(status) {
  return MAP_FILTERS.some((filter) => filter.id === status) ? status : "planning";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
