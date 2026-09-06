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

      try {
        const newTodo = await createTripTodo({
          tripId: trip.id,
          title: button.getAttribute("data-todo-title"),
          section: button.getAttribute("data-todo-section"),
        });

        tripStore.appendCurrentTodo(newTodo);
        showToast("Added to your checklist.", "success");
        rerender();
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
