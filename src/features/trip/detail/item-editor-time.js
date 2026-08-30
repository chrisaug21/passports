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

function syncTimeWarning() {
  const startInput = document.querySelector('[name="timeStart"]');
  const endInput = document.querySelector('[name="timeEnd"]');
  const warning = document.querySelector("#item-editor-time-warning");

  if (!startInput || !endInput || !warning) {
    return;
  }

  const startTime = normalizeTimeInput(startInput.value);
  const endTime = normalizeTimeInput(endInput.value);
  const shouldWarn = Boolean(startTime && endTime && endTime <= startTime);

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
