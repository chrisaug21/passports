import { searchLocations } from "../../lib/map-provider.js";
import { showToast } from "./toast.js";

export function renderLocationSearchField({
  idPrefix,
  label = "Location",
  value = "",
  lat = null,
  lng = null,
  required = false,
  hint = "",
}) {
  const hasCoordinates = isValidCoordinate(lat) && isValidCoordinate(lng);
  const statusText = hasCoordinates ? `Mapped to ${value || "selected location"}.` : hint;

  return `
    <div
      class="field location-search"
      data-location-search="${escapeHtml(idPrefix)}"
      data-location-has-initial-coordinates="${hasCoordinates ? "true" : "false"}"
      data-location-initial-mapped-name="${hasCoordinates ? escapeHtml(value || "") : ""}"
    >
      <label for="${escapeHtml(idPrefix)}-location">${escapeHtml(label)}</label>
      <div class="location-search__controls">
        <input
          id="${escapeHtml(idPrefix)}-location"
          name="locationName"
          type="text"
          value="${escapeHtml(value || "")}"
          placeholder="Search for a city or place"
          ${required ? "required" : ""}
          data-location-input
        />
        <button class="button button--secondary location-search__button" type="button" data-location-search-button>
          Search Location
        </button>
      </div>
      <input name="locationLat" type="hidden" value="${hasCoordinates ? escapeHtml(String(lat)) : ""}" data-location-lat />
      <input name="locationLng" type="hidden" value="${hasCoordinates ? escapeHtml(String(lng)) : ""}" data-location-lng />
      <input name="locationTimezone" type="hidden" value="" data-location-timezone />
      <input name="mappedLocationName" type="hidden" value="${hasCoordinates ? escapeHtml(value || "") : ""}" data-location-mapped-name />
      <p class="field-hint" data-location-status ${statusText ? "" : "hidden"}>${escapeHtml(statusText)}</p>
      <div class="location-search__results" data-location-results hidden></div>
    </div>
  `;
}

export function wireLocationSearch(form) {
  const roots = form?.querySelectorAll("[data-location-search]") || [];

  roots.forEach((root) => {
    const input = root.querySelector("[data-location-input]");
    const button = root.querySelector("[data-location-search-button]");
    const status = root.querySelector("[data-location-status]");
    const results = root.querySelector("[data-location-results]");
    const latInput = root.querySelector("[data-location-lat]");
    const lngInput = root.querySelector("[data-location-lng]");
    const timezoneInput = root.querySelector("[data-location-timezone]");
    const mappedNameInput = root.querySelector("[data-location-mapped-name]");
    let requestToken = 0;
    const startSearch = () => {
      if (button?.disabled) {
        return;
      }

      requestToken += 1;
      root.dataset.locationRequestToken = String(requestToken);
      runLocationSearch({ input, button, status, results, latInput, lngInput, timezoneInput, mappedNameInput, requestToken });
    };

    input?.addEventListener("input", () => {
      if (root.dataset.locationHasInitialCoordinates !== "true") {
        latInput.value = "";
        lngInput.value = "";
        timezoneInput.value = "";
      }

      mappedNameInput.value = normalizeLocationName(input.value) === normalizeLocationName(root.dataset.locationInitialMappedName)
        ? root.dataset.locationInitialMappedName
        : "";
      setStatus(status, latInput.value && lngInput.value
        ? "Existing map location kept until you choose a new search result."
        : "");
    });

    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        startSearch();
      }
    });

    button?.addEventListener("click", () => {
      startSearch();
    });
  });
}

export function getLocationSelection(form) {
  const locationName = String(form?.querySelector("[name='locationName']")?.value || "").trim();
  const mappedLocationName = String(form?.querySelector("[name='mappedLocationName']")?.value || "").trim();
  const parsedLat = parseCoordinate(form?.querySelector("[name='locationLat']")?.value);
  const parsedLng = parseCoordinate(form?.querySelector("[name='locationLng']")?.value);
  const timezone = String(form?.querySelector("[name='locationTimezone']")?.value || "").trim();
  const hasMatchingMappedName = normalizeLocationName(locationName) === normalizeLocationName(mappedLocationName);
  const hasStoredCoordinates = parsedLat != null && parsedLng != null;
  const hasCoordinates = hasStoredCoordinates && hasMatchingMappedName;

  return {
    locationName,
    lat: hasCoordinates ? parsedLat : null,
    lng: hasCoordinates ? parsedLng : null,
    timezone: hasCoordinates ? timezone : "",
    hasCoordinates,
    needsSearch: Boolean(locationName && hasStoredCoordinates && !hasMatchingMappedName),
  };
}

async function runLocationSearch(context) {
  const {
    input,
    button,
    status,
    results,
    latInput,
    lngInput,
    timezoneInput,
    mappedNameInput,
    requestToken,
  } = context;

  if (button.disabled) {
    return;
  }

  const query = String(input?.value || "").trim();

  if (query.length < 3) {
    showToast("Type at least 3 characters before searching.", "error");
    return;
  }

  button.disabled = true;
  setStatus(status, "Searching locations...");
  results.hidden = true;
  results.replaceChildren();

  try {
    const locations = await searchLocations(query);
    if (requestToken !== getLatestRequestToken(input)) {
      return;
    }

    if (locations.length === 0) {
      setStatus(status, "No matching locations found.");
      return;
    }

    setStatus(status, "Choose the matching place.");
    results.replaceChildren(...locations.map((location) => createLocationResultButton(location)));
    results.hidden = false;

    results.querySelectorAll("[data-location-result]").forEach((resultButton) => {
      resultButton.addEventListener("click", () => {
        input.value = resultButton.getAttribute("data-location-label") || "";
        latInput.value = resultButton.getAttribute("data-location-lat") || "";
        lngInput.value = resultButton.getAttribute("data-location-lng") || "";
        timezoneInput.value = resultButton.getAttribute("data-location-timezone") || "";
        mappedNameInput.value = input.value;
        applyInferredTimezone(resultButton.closest("form"), timezoneInput.value);
        setStatus(status, getMappedStatusText(input.value, timezoneInput.value));
        results.hidden = true;
        results.replaceChildren();
      });
    });
  } catch (error) {
    console.error(error);
    setStatus(status, "");
    showToast("Could not search locations right now.", "error");
  } finally {
    button.disabled = false;
  }
}

function applyInferredTimezone(form, timezone) {
  if (!form || !timezone) {
    return;
  }

  const timezoneValueInput = form.querySelector("[name='localTimezone']");
  const timezoneDisplayInput = form.querySelector("[data-timezone-display]");

  if (timezoneValueInput) {
    timezoneValueInput.value = timezone;
  }

  if (timezoneDisplayInput) {
    timezoneDisplayInput.value = timezone;
  }
}

function setStatus(status, text) {
  if (!status) {
    return;
  }

  status.textContent = text;
  status.hidden = !text;
}

function getLatestRequestToken(input) {
  return Number(input?.closest("[data-location-search]")?.dataset.locationRequestToken || 0);
}

function createLocationResultButton(location) {
  const button = document.createElement("button");
  button.className = "location-search__result";
  button.type = "button";
  button.dataset.locationResult = "true";
  button.dataset.locationLabel = location.label;
  button.dataset.locationLat = String(location.lat);
  button.dataset.locationLng = String(location.lng);
  button.dataset.locationTimezone = location.timezone || "";
  button.textContent = location.label;
  return button;
}

function getMappedStatusText(locationName, timezone) {
  const baseText = `Mapped to ${locationName}.`;
  return timezone ? `${baseText} Timezone: ${timezone}.` : baseText;
}

function parseCoordinate(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return null;
  }

  const coordinate = Number(normalizedValue);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function isValidCoordinate(value) {
  return parseCoordinate(value) != null;
}

function normalizeLocationName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
