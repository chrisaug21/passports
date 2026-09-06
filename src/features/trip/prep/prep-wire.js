import { navigate } from "../../../app/router.js";
import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import {
  createTripTodo,
  updateTripTodo,
  setTripTodoComplete,
  softDeleteTripTodo,
} from "../../../services/prep-service.js";
import { showToast } from "../../shared/toast.js";
import { getVisibleSuggestionTitles } from "./prep-view.js";

// A plain text input paired with a hand-rolled option list, rather than
// native <datalist> — datalist's suggestion dropdown is unreliable across
// browsers (particularly Safari/iOS, which this app can't skip), so it
// wasn't showing the preset options reliably. Typing still free-types a
// new section; clicking an option fills it in. mousedown (not click) on an
// option runs preventDefault so the input never blurs, which is what lets
// the selection register without needing an outside-click listener to
// close the dropdown afterward.
//
// The dropdown is position: fixed, placed via getBoundingClientRect() on
// the input rather than plain CSS position: absolute — this modal nests
// three overflow:auto/hidden ancestors (.modal-shell, .modal-card,
// .todo-editor-form__content) between the field and the dropdown, any one
// of which clips an absolutely-positioned child that extends past it.
//
// position: fixed alone doesn't actually escape that here, though: .panel
// (combined with .modal-card on the same <section>) sets a backdrop-filter,
// and backdrop-filter/filter/transform all create a new containing block
// for fixed-position descendants, same as transform does — so the dropdown
// was being trapped inside the (still-clipped) modal card instead of
// escaping to the viewport, positioned using viewport coordinates that no
// longer meant anything relative to its actual containing block. It's
// moved to be a direct child of <body> below specifically to get out from
// under that. Since a full rerender replaces the modal's markup wholesale
// without touching anything we've manually moved outside of it, the
// cleanup function below (run at the top of every call, whether or not the
// modal is even open on that render) removes whatever was portaled out
// last time before this run does it again — otherwise every render while
// the modal is open would leave another stale, duplicate-id <ul> behind.
//
// On mobile, focusing the field opens the keyboard, and the browser both
// resizes the visual viewport and (often) auto-scrolls the field into view
// above it — asynchronously, after the focus handler already ran. An
// earlier version showed and positioned the dropdown immediately on focus,
// which meant it visibly hopped to a new spot once or twice as the keyboard
// finished animating in — the "jumpy" feel reported after the previous fix.
// On touch devices, the dropdown now waits for that settle time before
// showing at all, so it only ever appears already in its final position.
// Desktop has no keyboard to wait for, so it still opens instantly there.
// The scroll/resize listeners still handle genuine later repositioning —
// e.g. the user scrolling the modal while the dropdown is already open.
const isTouchPrimaryDevice = Boolean(window.matchMedia?.("(pointer: coarse)").matches);
const MOBILE_KEYBOARD_SETTLE_MS = 300;

let sectionComboboxCleanup = null;

function wireSectionCombobox() {
  sectionComboboxCleanup?.();
  sectionComboboxCleanup = null;

  const input = document.querySelector("#todo-section-input");
  const optionsList = document.querySelector("#todo-section-options");

  if (!input || !optionsList) {
    return;
  }

  document.body.appendChild(optionsList);

  const options = [...optionsList.querySelectorAll("[data-section-option]")];
  const scrollContainer = input.closest(".todo-editor-form__content");

  const positionOptionsList = () => {
    const rect = input.getBoundingClientRect();
    optionsList.style.top = `${rect.bottom + 4}px`;
    optionsList.style.left = `${rect.left}px`;
    optionsList.style.width = `${rect.width}px`;
  };

  const repositionIfOpen = () => {
    if (!optionsList.hidden) {
      positionOptionsList();
    }
  };

  const filterOptions = () => {
    const query = input.value.trim().toLowerCase();
    let hasVisibleOption = false;

    options.forEach((option) => {
      const matches = !query || option.getAttribute("data-section-option").toLowerCase().includes(query);
      option.hidden = !matches;
      hasVisibleOption = hasVisibleOption || matches;
    });

    if (hasVisibleOption) {
      positionOptionsList();
    }

    optionsList.hidden = !hasVisibleOption;
  };

  let pendingFocusTimeoutId = null;

  const handleFocus = () => {
    if (isTouchPrimaryDevice) {
      pendingFocusTimeoutId = window.setTimeout(filterOptions, MOBILE_KEYBOARD_SETTLE_MS);
    } else {
      filterOptions();
    }
  };

  const handleBlur = () => {
    window.clearTimeout(pendingFocusTimeoutId);
    optionsList.hidden = true;
  };

  input.addEventListener("focus", handleFocus);
  input.addEventListener("input", filterOptions);
  input.addEventListener("blur", handleBlur);
  scrollContainer?.addEventListener("scroll", repositionIfOpen);
  window.visualViewport?.addEventListener("resize", repositionIfOpen);
  window.visualViewport?.addEventListener("scroll", repositionIfOpen);

  const handleOptionSelect = (event, option) => {
    event.preventDefault();
    input.value = option.getAttribute("data-section-option");
    optionsList.hidden = true;
  };

  options.forEach((option) => {
    option.addEventListener("mousedown", (event) => handleOptionSelect(event, option));
  });

  sectionComboboxCleanup = () => {
    window.clearTimeout(pendingFocusTimeoutId);
    scrollContainer?.removeEventListener("scroll", repositionIfOpen);
    window.visualViewport?.removeEventListener("resize", repositionIfOpen);
    window.visualViewport?.removeEventListener("scroll", repositionIfOpen);
    optionsList.remove();
  };
}

export function wirePrepView({ trip, todos, rerender }) {
  document.querySelector("[data-prep-back]")?.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(`/app/trip/${trip.id}`);
  });

  // Rendered by the shared app shell (renderAppShell), not this page's own
  // markup — every page that shows it is responsible for wiring its click.
  document.querySelector("#trip-back-to-dashboard")?.addEventListener("click", () => {
    navigate("/app");
  });

  document.querySelector("[data-toggle-hide-completed]")?.addEventListener("click", () => {
    const { hideCompleted } = appStore.getState().prepPage;
    appStore.updatePrepPage({ hideCompleted: !hideCompleted });
    rerender();
  });

  document.querySelector("[data-toggle-suggestions]")?.addEventListener("click", () => {
    const { isShowingSuggestions } = appStore.getState().prepPage;
    appStore.updatePrepPage({ isShowingSuggestions: !isShowingSuggestions });
    rerender();
  });

  document.querySelectorAll("[data-add-suggested-todo]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (button.disabled) {
        return;
      }

      button.disabled = true;

      // The tray shrinks by one chip while the checklist above it grows —
      // net document height can shift either way, and since scrollY stays
      // numerically fixed across the innerHTML rebuild, that reflow visibly
      // jumps the page. Anchor on the tray's on-screen position instead and
      // correct the scroll offset by however much that position moved.
      const trayBefore = document.querySelector(".prep-suggestion-tray");
      const trayTopBefore = trayBefore?.getBoundingClientRect().top;
      const visibleTitlesBefore = getVisibleSuggestionTitles(todos);

      try {
        const suggestedTitle = button.getAttribute("data-todo-title");
        const newTodo = await createTripTodo({
          tripId: trip.id,
          title: suggestedTitle,
          section: button.getAttribute("data-todo-section"),
          sourceSuggestion: suggestedTitle,
        });

        tripStore.appendCurrentTodo(newTodo);
        showToast("Added to your checklist.", "success");

        const visibleTitlesAfter = getVisibleSuggestionTitles(tripStore.getCurrentTodos());
        const revealedTitle = [...visibleTitlesAfter].find((title) => !visibleTitlesBefore.has(title)) || null;
        // Below the "list is empty" threshold, the tray shows unconditionally
        // regardless of isShowingSuggestions. Adding the first item crosses
        // that threshold on this same render, so without forcing the toggle
        // on here, the tray would vanish the instant it stops being empty.
        appStore.updatePrepPage({ justRevealedSuggestionTitle: revealedTitle, isShowingSuggestions: true });

        rerender();
        appStore.updatePrepPage({ justRevealedSuggestionTitle: null });

        if (typeof trayTopBefore === "number") {
          const trayAfter = document.querySelector(".prep-suggestion-tray");
          const trayTopAfter = trayAfter?.getBoundingClientRect().top;

          if (typeof trayTopAfter === "number" && trayTopAfter !== trayTopBefore) {
            window.scrollBy(0, trayTopAfter - trayTopBefore);
          }
        }
      } catch (error) {
        console.error(error);
        button.disabled = false;
        showToast("Something went wrong. Please try again.", "error");
      }
    });
  });

  document.querySelectorAll("[data-add-todo]").forEach((button) => {
    button.addEventListener("click", () => {
      appStore.updatePrepPage({
        editorMode: "add",
        editingTodoId: null,
        editorError: "",
      });
      rerender();
    });
  });

  document.querySelectorAll("[data-edit-todo]").forEach((button) => {
    button.addEventListener("click", () => {
      appStore.updatePrepPage({
        editorMode: "edit",
        editingTodoId: button.getAttribute("data-edit-todo"),
        editorError: "",
      });
      rerender();
    });
  });

  const closeEditor = () => {
    appStore.updatePrepPage({
      editorMode: null,
      editingTodoId: null,
      editorError: "",
    });
    rerender();
  };

  document.querySelector("#close-todo-editor")?.addEventListener("click", closeEditor);
  document.querySelector("[data-close-todo-editor]")?.addEventListener("click", closeEditor);

  wireSectionCombobox();

  document.querySelector("#todo-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const { prepPage } = appStore.getState();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const section = String(formData.get("section") || "").trim();

    appStore.updatePrepPage({ isSaving: true, editorError: "" });
    rerender();

    try {
      if (prepPage.editorMode === "add") {
        const newTodo = await createTripTodo({ tripId: trip.id, title, section });
        tripStore.appendCurrentTodo(newTodo);
        showToast("Item added.", "success");
      } else {
        const updatedTodo = await updateTripTodo({
          todoId: prepPage.editingTodoId,
          title,
          section,
        });

        tripStore.updateCurrentTodo(updatedTodo);
        showToast("Item saved.", "success");
      }

      appStore.updatePrepPage({
        isSaving: false,
        editorMode: null,
        editingTodoId: null,
        editorError: "",
      });
      rerender();
    } catch (error) {
      console.error(error);
      appStore.updatePrepPage({
        isSaving: false,
        editorError: error?.message || "Something went wrong saving. Please try again.",
      });
      rerender();
    }
  });

  document.querySelectorAll("[data-toggle-todo-complete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const todoId = button.getAttribute("data-toggle-todo-complete");
      const todo = todos.find((entry) => entry.id === todoId);
      if (!todo || button.disabled) {
        return;
      }

      button.disabled = true;

      try {
        const updatedTodo = await setTripTodoComplete({ todoId, isComplete: !todo.is_complete });
        tripStore.updateCurrentTodo(updatedTodo);
        rerender();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        showToast("Something went wrong. Please try again.", "error");
      }
    });
  });

  document.querySelectorAll("[data-request-delete-todo]").forEach((button) => {
    button.addEventListener("click", () => {
      appStore.updatePrepPage({
        showDeleteConfirm: true,
        deletingTodoId: button.getAttribute("data-request-delete-todo"),
      });
      rerender();
    });
  });

  const cancelDelete = () => {
    appStore.updatePrepPage({
      showDeleteConfirm: false,
      deletingTodoId: null,
    });
    rerender();
  };

  document.querySelector("#cancel-delete-todo")?.addEventListener("click", cancelDelete);
  document.querySelector("[data-cancel-delete-todo]")?.addEventListener("click", cancelDelete);

  document.querySelector("#confirm-delete-todo")?.addEventListener("click", async () => {
    const { deletingTodoId } = appStore.getState().prepPage;
    if (!deletingTodoId) {
      return;
    }

    appStore.updatePrepPage({ isDeleting: true });
    rerender();

    try {
      await softDeleteTripTodo(deletingTodoId);
      tripStore.removeCurrentTodo(deletingTodoId);
      appStore.updatePrepPage({
        isDeleting: false,
        showDeleteConfirm: false,
        deletingTodoId: null,
      });
      rerender();
      showToast("Item removed.", "success");
    } catch (error) {
      console.error(error);
      appStore.updatePrepPage({ isDeleting: false });
      rerender();
      showToast("Something went wrong. Please try again.", "error");
    }
  });
}
