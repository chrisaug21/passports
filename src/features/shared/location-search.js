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
  const statusText = hasCoordinates ? `Mapped to ${escapeHtml(value || "selected location")}.` : escapeHtml(hint);

  return `
    <div
      class="field location-search"
      data-location-search="${escapeHtml(idPrefix)}"
      data-location-has-initial-coordinates="${hasCoordinates ? "true" : "false"}"
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
      <input name="mappedLocationName" type="hidden" value="${hasCoordinates ? escapeHtml(value || "") : ""}" data-location-mapped-name />
      <p class="field-hint" data-location-status ${statusText ? "" : "hidden"}>${statusText}</p>
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
    const mappedNameInput = root.querySelector("[data-location-mapped-name]");

    input?.addEventListener("input", () => {
      if (root.dataset.locationHasInitialCoordinates !== "true") {
        latInput.value = "";
        lngInput.value = "";
      }

      mappedNameInput.value = "";
      setStatus(status, latInput.value && lngInput.value
        ? "Existing map location kept until you choose a new search result."
        : "");
    });

    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runLocationSearch({ input, button, status, results, latInput, lngInput, mappedNameInput });
      }
    });

    button?.addEventListener("click", () => {
      runLocationSearch({ input, button, status, results, latInput, lngInput, mappedNameInput });
    });
  });
}

export function getLocationSelection(form) {
  const locationName = String(form?.querySelector("[name='locationName']")?.value || "").trim();
  const lat = parseCoordinate(form?.querySelector("[name='locationLat']")?.value);
  const lng = parseCoordinate(form?.querySelector("[name='locationLng']")?.value);

  return {
    locationName,
    lat,
    lng,
    hasCoordinates: lat != null && lng != null,
  };
}

async function runLocationSearch({ input, button, status, results, latInput, lngInput, mappedNameInput }) {
  const query = String(input?.value || "").trim();

  if (query.length < 3) {
    showToast("Type at least 3 characters before searching.", "error");
    return;
  }

  button.disabled = true;
  setStatus(status, "Searching locations...");
  results.hidden = true;
  results.innerHTML = "";

  try {
    const locations = await searchLocations(query);

    if (locations.length === 0) {
      setStatus(status, "No matching locations found.");
      return;
    }

    setStatus(status, "Choose the matching place.");
    results.innerHTML = locations.map((location) => renderLocationResult(location)).join("");
    results.hidden = false;

    results.querySelectorAll("[data-location-result]").forEach((resultButton) => {
      resultButton.addEventListener("click", () => {
        input.value = resultButton.getAttribute("data-location-label") || "";
        latInput.value = resultButton.getAttribute("data-location-lat") || "";
        lngInput.value = resultButton.getAttribute("data-location-lng") || "";
        mappedNameInput.value = input.value;
        setStatus(status, `Mapped to ${input.value}.`);
        results.hidden = true;
        results.innerHTML = "";
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

function setStatus(status, text) {
  if (!status) {
    return;
  }

  status.textContent = text;
  status.hidden = !text;
}

function renderLocationResult(location) {
  return `
    <button
      class="location-search__result"
      type="button"
      data-location-result
      data-location-label="${escapeHtml(location.label)}"
      data-location-lat="${escapeHtml(String(location.lat))}"
      data-location-lng="${escapeHtml(String(location.lng))}"
    >
      ${escapeHtml(location.label)}
    </button>
  `;
}

function parseCoordinate(value) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function isValidCoordinate(value) {
  return Number.isFinite(Number(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
