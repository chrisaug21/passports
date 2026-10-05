import { tripStore } from "../../../state/trip-store.js";
import { formatDateInputValue, getTripEndDate } from "../../../lib/derive.js";
import { formatMonthDay, getTripDateByDayNumber } from "../../../lib/format.js";

function getNearestUpcomingHour() {
  const now = new Date();
  now.setMinutes(now.getMinutes() === 0 ? 0 : 60, 0, 0);
  return `${String(now.getHours()).padStart(2, "0")}:00`;
}

export function parseEditableTimeToStorage(value) {
  const normalizedValue = String(value || "").trim();

  if (!normalizedValue) {
    return "";
  }

  const twentyFourHourMatch = normalizedValue.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (twentyFourHourMatch) {
    return `${String(Number(twentyFourHourMatch[1])).padStart(2, "0")}:${twentyFourHourMatch[2]}`;
  }

  const twelveHourMatch = normalizedValue.match(/^(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m?\.?$/i);
  if (!twelveHourMatch) {
    return null;
  }

  let hour = Number(twelveHourMatch[1]);
  const minute = twelveHourMatch[2] || "00";
  const meridiem = twelveHourMatch[3].toLowerCase();

  if (hour < 1 || hour > 12) {
    return null;
  }

  if (meridiem === "p" && hour !== 12) {
    hour += 12;
  }

  if (meridiem === "a" && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function normalizeTimeInput(value) {
  return parseEditableTimeToStorage(value);
}

const TIME_LABELS = {
  lodging: { start: "Check-in Time", end: "Check-out Time" },
  transport: { start: "Departs", end: "Arrives", arrivalDate: "Arrives on" },
};

// Lodging and transport reuse the start/end time columns for check-in/out and
// depart/arrive, so name them that way instead of "Start/End Time".
export function syncTimeLabels() {
  const type = document.querySelector("#item-type-select")?.value;
  const mode = document.querySelector('[name="transportMode"]')?.value;
  // A car can be a rental or a driver, so it covers both wordings.
  const labels =
    type === "transport" && mode === "car"
      ? { start: "Departs / Pickup", end: "Arrives / Dropoff", arrivalDate: "Arrives on / Dropoff on" }
      : TIME_LABELS[type] || { start: "Start Time", end: "End Time" };

  document.querySelector('[data-time-label="start"]')?.replaceChildren(labels.start);
  document.querySelector('[data-time-label="end"]')?.replaceChildren(labels.end);
  document.querySelector('[data-time-label="arrivalDate"]')?.replaceChildren(labels.arrivalDate || "Arrives on");
}

// "End before start" is only a mistake when both times are on the same day. A
// hotel's check-out (or an overnight arrival) is on a later date, so skip the
// warning once that later date is filled in.
export function syncTimeWarning() {
  const startInput = document.querySelector('[name="timeStart"]');
  const endInput = document.querySelector('[name="timeEnd"]');
  const warning = document.querySelector("#item-editor-time-warning");

  if (!startInput || !endInput || !warning) {
    return;
  }

  const type = document.querySelector("#item-type-select")?.value;
  const startDate = getCheckOutDateBounds(document.querySelector('[name="dayId"]')?.value || "").min;
  const laterDate =
    type === "lodging"
      ? document.querySelector('[name="checkOutDate"]')?.value
      : type === "transport"
        ? document.querySelector('[name="arrivalDate"]')?.value
        : "";
  const dateHasError = document.querySelector(".field-hint--error[data-date-note]:not(.is-hidden)") !== null;
  const endsOnLaterDay = dateHasError || Boolean(laterDate) && (!startDate || laterDate > startDate);

  const startTime = normalizeTimeInput(startInput.value);
  const endTime = normalizeTimeInput(endInput.value);
  const shouldWarn = Boolean(startTime && endTime && endTime <= startTime && !endsOnLaterDay);

  warning.classList.toggle("is-hidden", !shouldWarn);
}

function syncClearButtonVisibility(input) {
  const field = input.closest(".item-time-field");
  field?.classList.toggle("has-value", Boolean(input.value));
}

export function wireTimeInputs() {
  const isMobile = window.matchMedia?.("(max-width: 767px)")?.matches;
  const defaultTime = getNearestUpcomingHour();

  document.querySelectorAll('[name="timeStart"], [name="timeEnd"]').forEach((input) => {
    input.step = "60";

    if (isMobile) {
      input.addEventListener("focus", () => {
        if (!input.value && input.getAttribute("data-defaulted-empty-time") !== "true") {
          input.value = defaultTime;
          input.setAttribute("data-defaulted-empty-time", "true");
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
    }

    const handleTimeInputEvent = () => {
      syncTimeWarning();
      syncClearButtonVisibility(input);
    };

    // Some mobile time pickers only fire "change" on commit, not "input" —
    // both are wired to stay in sync across platforms.
    input.addEventListener("input", handleTimeInputEvent);
    input.addEventListener("change", handleTimeInputEvent);
    syncClearButtonVisibility(input);
  });

  document.querySelector('[name="transportMode"]')?.addEventListener("change", syncTimeLabels);

  document.querySelectorAll("[data-clear-time]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.closest(".item-time-field")?.querySelector("input");
      if (!input) {
        return;
      }

      input.value = "";
      input.removeAttribute("data-defaulted-empty-time");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  syncTimeWarning();
}

// Earliest and latest allowed check-out dates (YYYY-MM-DD) for a lodging stop:
// the day it's attached to, up to the trip's last day. Either can be "" when the
// trip has no start date or the stop isn't attached to a day yet.
export function getCheckOutDateBounds(dayId) {
  const trip = tripStore.getCurrentTrip();
  const day = tripStore.getCurrentDays().find((entry) => entry.id === dayId);
  const checkIn = day ? getTripDateByDayNumber(trip?.start_date, day.day_number) : null;
  const tripEnd = getTripEndDate(trip);

  return {
    min: checkIn ? formatDateInputValue(checkIn) : "",
    max: tripEnd ? formatDateInputValue(tripEnd) : "",
  };
}

function addDays(dateString, count) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + count);
  return formatDateInputValue(date);
}

// Allowed range for the stop's second date. Check-out runs from the check-in day
// to the trip's last day; an arrival has to be after the departure day (same-day
// arrivals are just left empty).
function getDateFieldRange(name, dayId) {
  const { min: dayDate, max: tripEnd } = getCheckOutDateBounds(dayId);

  if (name === "arrivalDate") {
    return { dayDate, min: dayDate ? addDays(dayDate, 1) : "", max: "" };
  }

  return { dayDate, min: dayDate ? addDays(dayDate, 1) : "", max: tripEnd };
}

// Plain-language reason a date is out of range, or "" when it's fine.
export function getDateFieldError(name, value, dayId) {
  if (!value) {
    return "";
  }

  const { dayDate, min, max } = getDateFieldRange(name, dayId);

  if (name === "arrivalDate") {
    return dayDate && value < min
      ? `Must be after ${formatMonthDay(dayDate)}. Leave empty if it arrives the same day.`
      : "";
  }

  if (min && value < min) {
    return `Must be after ${formatMonthDay(dayDate)}, your check-in day.`;
  }

  if (max && value > max) {
    return `Must be on or before ${formatMonthDay(max)}, the last day of your trip.`;
  }

  return "";
}

function getDateFieldHint(name, dayId) {
  const { dayDate, max } = getDateFieldRange(name, dayId);

  if (name === "arrivalDate") {
    return `Only needed for overnight trips. Leave empty if it arrives the same day${dayDate ? ` (${formatMonthDay(dayDate)})` : ""}.`;
  }

  return dayDate && max ? `Checking in ${formatMonthDay(dayDate)}. Your trip ends ${formatMonthDay(max)}.` : "";
}

// Wires the second date on lodging (check-out) and transport (arrives on): keeps
// the picker inside its range, shows the helper text and any error right under
// the field, and replaces the browser's own "Value must be less than..." message.
// An empty picker starts at the first sensible date instead of opening on today.
export function wireCheckOutDateInput() {
  const dayInput = document.querySelector('[name="dayId"]');

  ["checkOutDate", "arrivalDate"].forEach((name) => {
    const input = document.querySelector(`[name="${name}"]`);
    const note = document.querySelector(`[data-date-note="${name}"]`);

    if (!input) {
      return;
    }

    const refresh = () => {
      const dayId = dayInput?.value || "";
      const { min, max } = getDateFieldRange(name, dayId);
      input.min = min;
      input.max = max;

      // One line under the field: the helper text, swapped for the (red) error
      // while the date is out of range.
      const message = getDateFieldError(name, input.value, dayId);
      const noteText = message || getDateFieldHint(name, dayId);
      if (note) {
        note.textContent = noteText;
        note.classList.toggle("is-hidden", !noteText);
        note.classList.toggle("field-hint--error", Boolean(message));
      }
      input.setAttribute("aria-invalid", message ? "true" : "false");
      input.closest(".item-time-field")?.classList.toggle("has-value", Boolean(input.value));
      syncTimeWarning();
    };

    input.addEventListener("focus", () => {
      refresh();
      if (input.value || !input.min) {
        return;
      }

      const suggested = input.min;
      input.value = input.max && suggested > input.max ? input.max : suggested;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    input.addEventListener("input", refresh);
    input.addEventListener("change", refresh);
    // Browsers pop up their own wording when a save is blocked by min/max; ours is
    // already showing under the field.
    input.addEventListener("invalid", (event) => {
      event.preventDefault();
      refresh();
    });
    dayInput?.addEventListener("change", refresh);
    refresh();
  });
}
