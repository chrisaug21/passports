import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { tripDetailState, rerenderTripDetail } from "./trip-detail-state.js";

export function syncItemEditorTypeFields() {
  const itemTypeSelect = document.querySelector("#item-type-select");
  const selectedType = itemTypeSelect?.value;

  document.querySelectorAll("[data-item-type-section]").forEach((section) => {
    const sectionType = section.getAttribute("data-item-type-section");
    const isActive = sectionType === selectedType;

    section.classList.toggle("is-hidden", !isActive);
    section.querySelectorAll("input, select, textarea").forEach((field) => {
      field.disabled = !isActive;
    });
  });
}

export function syncItemEditorAssignmentHint() {
  const hintElement = document.querySelector("#item-editor-assignment-hint");
  if (!hintElement) {
    return;
  }

  const form = document.querySelector("#item-editor-form");
  if (!form) {
    return;
  }

  const formData = new FormData(form);
  const baseId = String(formData.get("baseId") || "").trim();
  const dayId = String(formData.get("dayId") || "").trim();
  const bases = tripStore.getCurrentBases();
  const days = tripStore.getCurrentDays();
  const hint = getItemEditorAssignmentHint(baseId, dayId, bases, days);

  hintElement.textContent = hint || "";
  hintElement.classList.toggle("is-hidden", !hint);
}

export function getItemEditorAssignmentHint(baseId, dayId, bases, days) {
  if (!baseId || !dayId) {
    return "";
  }

  const selectedDay = days.find((day) => day.id === dayId);
  if (!selectedDay || selectedDay.base_id === baseId) {
    return "";
  }

  const dayBase = bases.find((base) => base.id === selectedDay.base_id);
  if (!dayBase) {
    return "";
  }

  return `Day ${selectedDay.day_number} is in ${dayBase.name || "that base"} — update base to match?`;
}

export function wireAnchorCheckbox() {
  const visualBox = document.querySelector(".anchor-checkbox");
  const input = document.querySelector(".anchor-checkbox-input");
  const label = document.querySelector(".anchor-checkbox-label");
  const startTimeInput = document.querySelector('[name="timeStart"]');

  if (!visualBox || !input) {
    return;
  }

  const sync = () => {
    const hasStartTime = Boolean(String(startTimeInput?.value || "").trim());
    input.disabled = !hasStartTime;

    if (!hasStartTime) {
      input.checked = false;
    }

    label?.classList.toggle("is-disabled", !hasStartTime);
    label?.setAttribute("title", hasStartTime ? "" : "Set a start time to mark as anchor");
    visualBox.setAttribute("aria-checked", input.checked ? "true" : "false");
    visualBox.setAttribute("aria-disabled", hasStartTime ? "false" : "true");
    visualBox.setAttribute("tabindex", hasStartTime ? "0" : "-1");
    visualBox.innerHTML = input.checked ? '<i data-lucide="check" aria-hidden="true"></i>' : "";
    window.lucide?.createIcons?.();
  };

  const toggle = () => {
    if (input.disabled) {
      return;
    }

    input.checked = !input.checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    sync();
  };

  label?.addEventListener("click", (event) => {
    if (event.target === input) {
      sync();
      return;
    }

    event.preventDefault();
    toggle();
  });

  visualBox.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle();
    }
  });

  startTimeInput?.addEventListener("input", sync);
  startTimeInput?.addEventListener("change", sync);
  sync();
}

export function keepEditing() {
  tripDetailState.pendingDiscardAction = null;
  appStore.updateTripDetail({
    showDiscardConfirm: false,
  });
  rerenderTripDetail();
}

export function wireDiscardConfirmModal() {
  document.querySelector("#keep-editing-button")?.addEventListener("click", keepEditing);
  document.querySelector("[data-keep-editing]")?.addEventListener("click", keepEditing);
  document.querySelector("#discard-changes-button")?.addEventListener("click", () => {
    const action = tripDetailState.pendingDiscardAction;
    tripDetailState.pendingDiscardAction = null;

    if (action) {
      action();
      return;
    }

    appStore.updateTripDetail({
      showDiscardConfirm: false,
    });
    rerenderTripDetail();
  });
}
