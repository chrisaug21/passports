import {
  CANONICAL_TIMEZONES,
  DEFAULT_BASE_TIMEZONE,
} from "../../../config/constants.js";
import {
  formatTimezone,
  formatTimezoneOffset,
} from "../../../lib/format.js";
import { showToast } from "../../shared/toast.js";
import { tripDetailState } from "./trip-detail-state.js";
import { escapeHtml } from "./trip-detail-ui.js";

export function getSupportedTimezones() {
  if (tripDetailState.supportedTimezonesCache) {
    return tripDetailState.supportedTimezonesCache;
  }

  tripDetailState.supportedTimezonesCache = CANONICAL_TIMEZONES.map(([timezone]) => timezone);
  return tripDetailState.supportedTimezonesCache;
}

export function renderTimezonePicker(inputId, selectedTimezone) {
  const normalizedTimezone = getSupportedTimezones().includes(selectedTimezone) || isValidIanaTimezone(selectedTimezone)
    ? selectedTimezone
    : DEFAULT_BASE_TIMEZONE;
  const displayLabel = getTimezoneSelectedLabel(normalizedTimezone);
  const options = getTimezonePickerOptions(normalizedTimezone);

  return `
    <span class="timezone-picker">
      <input
        name="localTimezone"
        type="hidden"
        value="${escapeHtml(normalizedTimezone)}"
        data-timezone-value
      />
      <input
        id="${escapeHtml(inputId)}"
        type="text"
        value="${escapeHtml(displayLabel)}"
        placeholder="Start typing a timezone"
        autocomplete="off"
        required
        data-timezone-display
      />
      <span class="timezone-picker__list" role="listbox" aria-label="Timezone options">
        ${options.map((option) => `
          <span
            class="timezone-picker__option"
            role="option"
            tabindex="0"
            data-timezone-option="${escapeHtml(option.timezone)}"
            data-timezone-search="${escapeHtml(option.searchText)}"
          >${escapeHtml(option.optionLabel)}</span>
        `).join("")}
      </span>
    </span>
  `;
}

export function renderTimezoneOptionsDatalist() {
  return "";
}

export function getValidatedTimezone(rawValue) {
  const timezone = String(rawValue || "").trim();

  if (!timezone) {
    showToast("Choose a timezone from the list first.", "error");
    return null;
  }

  const matchedTimezone = getTimezoneFromPickerValue(timezone);

  if (!matchedTimezone) {
    showToast("Choose a valid IANA timezone from the list.", "error");
    return null;
  }

  return matchedTimezone;
}

export function wireTimezonePickers() {
  document.querySelectorAll(".timezone-picker").forEach((picker) => {
    const input = picker.querySelector("[data-timezone-display]");
    const hiddenInput = picker.querySelector("[data-timezone-value]");
    const options = [...picker.querySelectorAll("[data-timezone-option]")];

    if (!input || !hiddenInput) {
      return;
    }

    const filterOptions = () => {
      const query = String(input.value || "").trim().toLowerCase();

      options.forEach((option) => {
        const searchText = option.getAttribute("data-timezone-search") || "";
        option.hidden = Boolean(query) && !searchText.includes(query);
      });
    };

    const selectOption = (option) => {
      const timezone = option.getAttribute("data-timezone-option") || "";

      if (!timezone) {
        return;
      }

      hiddenInput.value = timezone;
      input.value = getTimezoneSelectedLabel(timezone);
      filterOptions();
    };

    input.addEventListener("input", () => {
      const matchedTimezone = getTimezoneFromPickerValue(input.value);

      if (matchedTimezone) {
        hiddenInput.value = matchedTimezone;
      }

      filterOptions();
    });

    input.addEventListener("focus", filterOptions);

    input.addEventListener("blur", () => {
      const matchedTimezone = getTimezoneFromPickerValue(input.value) || hiddenInput.value || DEFAULT_BASE_TIMEZONE;
      hiddenInput.value = matchedTimezone;
      input.value = getTimezoneSelectedLabel(matchedTimezone);
      window.setTimeout(filterOptions, 120);
    });

    options.forEach((option) => {
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
      });
      option.addEventListener("click", () => selectOption(option));
      option.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectOption(option);
        }
      });
    });

    filterOptions();
  });
}

function getTimezoneEntry(timezone) {
  return CANONICAL_TIMEZONES.find(([entryTimezone]) => entryTimezone === timezone) || null;
}

function getTimezoneSelectedLabel(timezone) {
  return getTimezoneEntry(timezone)?.[1] || formatTimezone(timezone);
}

function getTimezoneOptionLabel(timezone) {
  const offset = formatTimezoneOffset(timezone);
  return `${getTimezoneSelectedLabel(timezone)}${offset ? ` · ${offset}` : ""}`;
}

function getTimezonePickerOptions(selectedTimezone = "") {
  const timezones = getSupportedTimezones().includes(selectedTimezone) || !isValidIanaTimezone(selectedTimezone)
    ? getSupportedTimezones()
    : [selectedTimezone, ...getSupportedTimezones()];

  return timezones.map((timezone) => {
    const selectedLabel = getTimezoneSelectedLabel(timezone);
    const abbreviation = selectedLabel.match(/\(([^)]+)\)$/)?.[1] || "";
    const cityAliases = timezone
      .split("/")
      .slice(1)
      .join(" ")
      .replaceAll("_", " ");

    return {
      timezone,
      optionLabel: getTimezoneOptionLabel(timezone),
      searchText: [selectedLabel, abbreviation, cityAliases, timezone].join(" ").toLowerCase(),
    };
  });
}

function getTimezoneFromPickerValue(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  if (isValidIanaTimezone(normalizedValue)) {
    return normalizedValue;
  }

  const exactTimezone = getSupportedTimezones().find((timezone) => timezone === normalizedValue);
  if (exactTimezone) {
    return exactTimezone;
  }

  return getSupportedTimezones().find((timezone) => {
    const label = getTimezoneSelectedLabel(timezone);
    const optionLabel = getTimezoneOptionLabel(timezone);
    const abbreviation = label.match(/\(([^)]+)\)$/)?.[1] || "";

    return [label, optionLabel, abbreviation, timezone].includes(normalizedValue);
  }) || "";
}

function isValidIanaTimezone(timezone) {
  if (!timezone) {
    return false;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return Boolean(formatter.resolvedOptions().timeZone);
  } catch (_error) {
    return false;
  }
}
