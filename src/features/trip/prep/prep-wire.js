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
function wireSectionCombobox() {
  const input = document.querySelector("#todo-section-input");
  const optionsList = document.querySelector("#todo-section-options");

  if (!input || !optionsList) {
    return;
  }

  const options = [...optionsList.querySelectorAll("[data-section-option]")];

  const filterOptions = () => {
    const query = input.value.trim().toLowerCase();
    let hasVisibleOption = false;

    options.forEach((option) => {
      const matches = !query || option.getAttribute("data-section-option").toLowerCase().includes(query);
      option.hidden = !matches;
      hasVisibleOption = hasVisibleOption || matches;
    });

    optionsList.hidden = !hasVisibleOption;
  };

  input.addEventListener("focus", filterOptions);
  input.addEventListener("input", filterOptions);
  input.addEventListener("blur", () => {
    optionsList.hidden = true;
  });

  options.forEach((option) => {
    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
      input.value = option.getAttribute("data-section-option");
      optionsList.hidden = true;
    });
  });
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
