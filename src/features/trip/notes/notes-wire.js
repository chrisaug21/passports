import { navigate } from "../../../app/router.js";
import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { sessionStore } from "../../../state/session-store.js";
import {
  createTripNote,
  updateTripNote,
  setTripNotePinned,
  softDeleteTripNote,
} from "../../../services/notes-service.js";
import { showToast } from "../../shared/toast.js";

export function wireNotesView({ trip, notes, rerender }) {
  document.querySelector("[data-notes-back]")?.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(`/app/trip/${trip.id}`);
  });

  // Rendered by the shared app shell (renderAppShell), not this page's own
  // markup — every page that shows it is responsible for wiring its click.
  document.querySelector("#trip-back-to-dashboard")?.addEventListener("click", () => {
    navigate("/app");
  });

  document.querySelectorAll("[data-toggle-note-body]").forEach((button) => {
    button.addEventListener("click", () => {
      const noteId = button.getAttribute("data-toggle-note-body");
      const { expandedNoteIds } = appStore.getState().notesPage;

      appStore.updateNotesPage({
        expandedNoteIds: expandedNoteIds.includes(noteId)
          ? expandedNoteIds.filter((id) => id !== noteId)
          : [...expandedNoteIds, noteId],
      });
      rerender();
    });
  });

  document.querySelectorAll("[data-add-note]").forEach((button) => {
    button.addEventListener("click", () => {
      appStore.updateNotesPage({
        editorMode: "add",
        editingNoteId: null,
        editorError: "",
      });
      rerender();
    });
  });

  document.querySelectorAll("[data-edit-note]").forEach((button) => {
    button.addEventListener("click", () => {
      appStore.updateNotesPage({
        editorMode: "edit",
        editingNoteId: button.getAttribute("data-edit-note"),
        editorError: "",
      });
      rerender();
    });
  });

  const closeEditor = () => {
    appStore.updateNotesPage({
      editorMode: null,
      editingNoteId: null,
      editorError: "",
    });
    rerender();
  };

  document.querySelector("#close-note-editor")?.addEventListener("click", closeEditor);
  document.querySelector("[data-close-note-editor]")?.addEventListener("click", closeEditor);

  document.querySelector("#note-editor-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const { session } = sessionStore.getState();
    const { notesPage } = appStore.getState();

    if (!session?.user?.id) {
      showToast("Your session expired. Sign in again.", "error");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const url = String(formData.get("url") || "").trim();
    const body = String(formData.get("body") || "").trim();

    appStore.updateNotesPage({ isSaving: true, editorError: "" });
    rerender();

    try {
      if (notesPage.editorMode === "add") {
        const newNote = await createTripNote({
          tripId: trip.id,
          title,
          body,
          url,
          createdBy: session.user.id,
        });

        tripStore.appendCurrentNote(newNote);
        showToast("Note added.", "success");
      } else {
        const updatedNote = await updateTripNote({
          noteId: notesPage.editingNoteId,
          title,
          body,
          url,
        });

        tripStore.updateCurrentNote(updatedNote);
        showToast("Note saved.", "success");
      }

      appStore.updateNotesPage({
        isSaving: false,
        editorMode: null,
        editingNoteId: null,
        editorError: "",
      });
      rerender();
    } catch (error) {
      console.error(error);
      appStore.updateNotesPage({
        isSaving: false,
        editorError: error?.message || "Something went wrong saving. Please try again.",
      });
      rerender();
    }
  });

  document.querySelectorAll("[data-pin-note]").forEach((button) => {
    button.addEventListener("click", async () => {
      const noteId = button.getAttribute("data-pin-note");
      const note = notes.find((entry) => entry.id === noteId);
      if (!note || button.disabled) {
        return;
      }

      button.disabled = true;

      try {
        const updatedNote = await setTripNotePinned({ noteId, isPinned: !note.is_pinned });
        tripStore.updateCurrentNote(updatedNote);
        rerender();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        showToast("Something went wrong. Please try again.", "error");
      }
    });
  });

  document.querySelectorAll("[data-request-delete-note]").forEach((button) => {
    button.addEventListener("click", () => {
      appStore.updateNotesPage({
        showDeleteConfirm: true,
        deletingNoteId: button.getAttribute("data-request-delete-note"),
      });
      rerender();
    });
  });

  const cancelDelete = () => {
    appStore.updateNotesPage({
      showDeleteConfirm: false,
      deletingNoteId: null,
    });
    rerender();
  };

  document.querySelector("#cancel-delete-note")?.addEventListener("click", cancelDelete);
  document.querySelector("[data-cancel-delete-note]")?.addEventListener("click", cancelDelete);

  document.querySelector("#confirm-delete-note")?.addEventListener("click", async () => {
    const { deletingNoteId } = appStore.getState().notesPage;
    if (!deletingNoteId) {
      return;
    }

    appStore.updateNotesPage({ isDeleting: true });
    rerender();

    try {
      await softDeleteTripNote(deletingNoteId);
      tripStore.removeCurrentNote(deletingNoteId);
      appStore.updateNotesPage({
        isDeleting: false,
        showDeleteConfirm: false,
        deletingNoteId: null,
      });
      rerender();
      showToast("Note removed.", "success");
    } catch (error) {
      console.error(error);
      appStore.updateNotesPage({ isDeleting: false });
      rerender();
      showToast("Something went wrong. Please try again.", "error");
    }
  });
}
