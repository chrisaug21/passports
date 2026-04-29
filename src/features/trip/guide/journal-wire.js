import { sessionStore } from "../../../state/session-store.js";
import {
  upsertJournalEntry,
  uploadJournalPhoto,
  deleteJournalPhoto,
  updateJournalItemStatus,
  compressJournalPhoto,
} from "../../../services/journal-service.js";
import { openProfileModal } from "../../shared/profile-modal.js";
import { showToast } from "../../shared/toast.js";
import { escapeHtml } from "../detail/trip-detail-ui.js";
import {
  renderJournalDaySection,
  renderJournalStatTiles,
  renderItemPhotoSlot,
} from "./journal-view.js";

const AUTOSAVE_DELAY_MS = 500;
const SAVED_FEEDBACK_MS = 2000;
const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const JOURNAL_PROFILE_PROMPT_DISMISSED_KEY = "journal-profile-prompt-dismissed";
const JOURNAL_REVERT_STATUS = "confirmed";

let _journalCleanupFns = [];
let _saveCounter = 0;

export function teardownJournalMode() {
  _journalCleanupFns.forEach((fn) => fn());
  _journalCleanupFns = [];
}

// ---------------------------------------------------------------------------
// Main wire entry point — called each time Journal Mode content is rendered
// ---------------------------------------------------------------------------

export function wireJournalMode(state, journalState) {
  const { session } = sessionStore.getState();
  const userId = session?.user?.id || null;

  wireProfilePrompt(state, journalState);
  wireDayEntries(state, journalState, userId);
  wireItemEntries(state, journalState, userId);
  wireItemPhotos(state, journalState, userId);
  wireDoneToggles(state, journalState);
}

// ---------------------------------------------------------------------------
// Profile prompt banner
// ---------------------------------------------------------------------------

function wireProfilePrompt(state, journalState) {
  const prompt = document.querySelector("#journal-profile-prompt");
  if (!prompt) return;

  document.querySelector("#journal-dismiss-profile-prompt")?.addEventListener("click", () => {
    try {
      window.sessionStorage.setItem(JOURNAL_PROFILE_PROMPT_DISMISSED_KEY, "true");
    } catch (_error) {
      // Ignore sessionStorage failures.
    }
    prompt.remove();
  });

  document.querySelector("#journal-open-profile")?.addEventListener("click", () => {
    openProfileModal({
      onSaved: (profile) => {
        journalState.profiles = journalState.profiles.filter((p) => p.id !== profile.id);
        journalState.profiles.push(profile);
        state.currentUserProfile = profile;
        try {
          window.sessionStorage.removeItem(JOURNAL_PROFILE_PROMPT_DISMISSED_KEY);
        } catch (_error) {
          // Ignore sessionStorage failures.
        }
        const prompt = document.querySelector("#journal-profile-prompt");
        if (prompt) prompt.remove();
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Auto-resize textarea helper (scrollHeight approach)
// ---------------------------------------------------------------------------

function autoResizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function setupAutoResize(textarea) {
  autoResizeTextarea(textarea);
  const handler = () => autoResizeTextarea(textarea);
  textarea.addEventListener("input", handler);
  _journalCleanupFns.push(() => textarea.removeEventListener("input", handler));
}

// ---------------------------------------------------------------------------
// Saved feedback display
// ---------------------------------------------------------------------------

function showSavedFeedback(savedEl) {
  if (!savedEl) return;
  savedEl.textContent = "Saved";
  savedEl.classList.add("is-visible");
  window.setTimeout(() => {
    savedEl.textContent = "";
    savedEl.classList.remove("is-visible");
  }, SAVED_FEEDBACK_MS);
}

function updateLocalJournalEntry(entries, nextEntry, previousEntryId = null) {
  const matchIndex = entries.findIndex((entry) =>
    entry.id === nextEntry.id
    || (previousEntryId && entry.id === previousEntryId)
    || (
      entry.user_id === nextEntry.user_id
      && entry.day_id === nextEntry.day_id
      && entry.item_id === nextEntry.item_id
    )
  );

  if (matchIndex >= 0) {
    entries[matchIndex] = nextEntry;
    return;
  }

  entries.push(nextEntry);
}

function updateDisplayText(displayEl, notes) {
  if (!displayEl) return;
  const nextNotes = String(notes || "").trim();
  const placeholder = displayEl.dataset.journalPlaceholder || "Tap to add a note...";
  displayEl.innerHTML = nextNotes
    ? `<p class="journal-entry-display__text">${escapeHtml(nextNotes)}</p>`
    : `<p class="journal-entry-display__placeholder">${escapeHtml(placeholder)}</p>`;
}

function openEntryEditor(container) {
  const display = container.querySelector(".journal-entry-display");
  const editor = container.querySelector("[data-journal-editor]");
  const textarea = container.querySelector("[data-journal-textarea]");
  if (!display || !editor || !textarea) return;

  display.hidden = true;
  editor.hidden = false;
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  autoResizeTextarea(textarea);
}

function closeEntryEditor(container, { restoreValue = null } = {}) {
  const display = container.querySelector(".journal-entry-display");
  const editor = container.querySelector("[data-journal-editor]");
  const textarea = container.querySelector("[data-journal-textarea]");
  if (!display || !editor || !textarea) return;

  if (restoreValue !== null) {
    textarea.value = restoreValue;
    autoResizeTextarea(textarea);
  }

  editor.hidden = true;
  display.hidden = false;
}

function wireEntryContainer({
  container,
  state,
  journalState,
  userId,
  targetId,
  entryKind,
  saveErrorMessage,
  savedSelector,
}) {
  const textarea = container.querySelector("[data-journal-textarea]");
  const editButton = container.querySelector("[data-journal-edit-toggle]");
  const cancelButton = container.querySelector("[data-journal-cancel]");
  const saveButton = container.querySelector("[data-journal-save]");
  const display = container.querySelector(".journal-entry-display");
  if (!textarea || !editButton || !cancelButton || !saveButton || !display) return;

  setupAutoResize(textarea);

  let debounceTimer = null;
  let suppressBlurSave = false;
  let savedEntryId = container.dataset.entryId || null;
  let lastSavedValue = textarea.value.trim();

  const persistEntry = async ({ shouldCloseEditor = true } = {}) => {
    const notes = textarea.value.trim();
    const savedEl = container.querySelector(savedSelector);
    const previousEntryId = savedEntryId || null;
    _saveCounter += 1;
    const currentSaveToken = _saveCounter;

    try {
      const result = await upsertJournalEntry({
        existingId: previousEntryId,
        tripId: state.tripId,
        userId,
        dayId: entryKind === "day" ? targetId : null,
        itemId: entryKind === "item" ? targetId : null,
        notes,
      });

      if (currentSaveToken !== _saveCounter) return;

      updateLocalJournalEntry(journalState.entries, result, previousEntryId);
      savedEntryId = result.id;
      lastSavedValue = notes;
      container.dataset.entryId = result.id;
      updateDisplayText(display, notes);
      showSavedFeedback(savedEl);

      if (shouldCloseEditor) {
        closeEntryEditor(container);
      }
    } catch (error) {
      if (currentSaveToken !== _saveCounter) return;
      console.error(`Failed to save ${entryKind} journal entry:`, error);
      showToast(saveErrorMessage, "error");
    }
  };

  const handleEditClick = () => openEntryEditor(container);
  const handleCancelClick = () => {
    suppressBlurSave = true;
    closeEntryEditor(container, { restoreValue: lastSavedValue });
    window.setTimeout(() => {
      suppressBlurSave = false;
    }, 0);
  };
  const handleSaveClick = async () => {
    clearTimeout(debounceTimer);
    await persistEntry({ shouldCloseEditor: true });
  };
  const handleCancelMouseDown = () => {
    suppressBlurSave = true;
    clearTimeout(debounceTimer);
  };
  const handleBlur = () => {
    if (suppressBlurSave) return;
    clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      const editor = container.querySelector("[data-journal-editor]");
      if (!editor || editor.hidden) return;
      void persistEntry({ shouldCloseEditor: false });
    }, AUTOSAVE_DELAY_MS);
  };

  editButton.addEventListener("click", handleEditClick);
  cancelButton.addEventListener("mousedown", handleCancelMouseDown);
  cancelButton.addEventListener("click", handleCancelClick);
  saveButton.addEventListener("click", handleSaveClick);
  textarea.addEventListener("blur", handleBlur);

  _journalCleanupFns.push(() => {
    editButton.removeEventListener("click", handleEditClick);
    cancelButton.removeEventListener("mousedown", handleCancelMouseDown);
    cancelButton.removeEventListener("click", handleCancelClick);
    saveButton.removeEventListener("click", handleSaveClick);
    textarea.removeEventListener("blur", handleBlur);
    clearTimeout(debounceTimer);
  });
}

// ---------------------------------------------------------------------------
// Day-level journal entries
// ---------------------------------------------------------------------------

function wireDayEntries(state, journalState, userId) {
  document.querySelectorAll("[data-journal-day-entry]").forEach((container) => {
    if (container.dataset.journalEntryBound === "true") return;
    const dayId = container.dataset.journalDayEntry;
    if (!dayId) return;
    container.dataset.journalEntryBound = "true";

    wireEntryContainer({
      container,
      state,
      journalState,
      userId,
      targetId: dayId,
      entryKind: "day",
      saveErrorMessage: "Couldn't save your entry. Try again.",
      savedSelector: ".journal-day-entry__saved",
    });
  });
}

// ---------------------------------------------------------------------------
// Item-level journal entries
// ---------------------------------------------------------------------------

function wireItemEntries(state, journalState, userId) {
  document.querySelectorAll("[data-journal-item-entry]").forEach((container) => {
    if (container.dataset.journalEntryBound === "true") return;
    const itemId = container.dataset.journalItemEntry;
    if (!itemId) return;
    container.dataset.journalEntryBound = "true";

    wireEntryContainer({
      container,
      state,
      journalState,
      userId,
      targetId: itemId,
      entryKind: "item",
      saveErrorMessage: "Couldn't save your note. Try again.",
      savedSelector: ".journal-item-entry__saved",
    });
  });
}

// ---------------------------------------------------------------------------
// Item photos — add / replace / remove
// ---------------------------------------------------------------------------

function wireItemPhotos(state, journalState, userId) {
  // Add photo
  document.querySelectorAll("[data-journal-photo-add]").forEach((button) => {
    if (button.dataset.journalPhotoBound === "true") return;
    const itemId = button.dataset.journalPhotoAdd;
    button.dataset.journalPhotoBound = "true";
    const handler = () => handlePhotoAdd({ itemId, state, journalState, userId });
    button.addEventListener("click", handler);
    _journalCleanupFns.push(() => button.removeEventListener("click", handler));
  });

  // Replace photo
  document.querySelectorAll("[data-journal-photo-replace]").forEach((button) => {
    if (button.dataset.journalPhotoBound === "true") return;
    const itemId = button.dataset.journalPhotoReplace;
    button.dataset.journalPhotoBound = "true";
    const handler = () => handlePhotoReplace({ itemId, state, journalState, userId });
    button.addEventListener("click", handler);
    _journalCleanupFns.push(() => button.removeEventListener("click", handler));
  });

  // Remove photo
  document.querySelectorAll("[data-journal-photo-remove]").forEach((button) => {
    if (button.dataset.journalPhotoBound === "true") return;
    const itemId = button.dataset.journalPhotoRemove;
    button.dataset.journalPhotoBound = "true";
    const handler = () => handlePhotoRemove({ itemId, state, journalState });
    button.addEventListener("click", handler);
    _journalCleanupFns.push(() => button.removeEventListener("click", handler));
  });
}

function refreshJournalStatTiles(state, journalState) {
  const statTiles = document.querySelector("[data-journal-stat-tiles]");
  if (!statTiles) return;

  const temp = document.createElement("div");
  temp.innerHTML = renderJournalStatTiles(state, journalState).trim();
  const nextStatTiles = temp.firstElementChild;
  if (!nextStatTiles) return;

  statTiles.replaceWith(nextStatTiles);
}

function selectPhotoFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPTED_PHOTO_TYPES.join(",");
    input.style.display = "none";
    let resolved = false;

    const finish = (file) => {
      if (resolved) return;
      resolved = true;
      window.removeEventListener("focus", handleFocus);
      input.remove();
      resolve(file);
    };

    const handleFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) finish(null);
      }, 250);
    };

    input.addEventListener("change", () => finish(input.files?.[0] || null), { once: true });
    window.addEventListener("focus", handleFocus);
    document.body.append(input);
    input.click();
  });
}

async function handlePhotoAdd({ itemId, state, journalState, userId }) {
  const file = await selectPhotoFile();
  if (!file) return;

  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
    showToast("Please choose a JPG, PNG, or WebP image.", "error");
    return;
  }

  const slot = document.querySelector(`[data-journal-photo-slot="${CSS.escape(itemId)}"]`);
  if (slot) slot.classList.add("is-uploading");

  try {
    const blob = await compressJournalPhoto(file);
    const photo = await uploadJournalPhoto({
      tripId: state.tripId,
      userId,
      itemId,
      blob,
    });

    journalState.photos.push(photo);
    refreshJournalStatTiles(state, journalState);
    refreshItemPhotoSlot({ itemId, state, journalState, userId });
  } catch (error) {
    console.error("Photo upload failed:", error);
    showToast("Photo upload failed. Try again.", "error");
    if (slot) slot.classList.remove("is-uploading");
  }
}

async function handlePhotoReplace({ itemId, state, journalState, userId }) {
  const file = await selectPhotoFile();
  if (!file) return;

  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
    showToast("Please choose a JPG, PNG, or WebP image.", "error");
    return;
  }

  const existingPhoto = journalState.photos.find(
    (p) => p.item_id === itemId && p.user_id === userId
  );

  const slot = document.querySelector(`[data-journal-photo-slot="${CSS.escape(itemId)}"]`);
  if (slot) slot.classList.add("is-uploading");

  try {
    const blob = await compressJournalPhoto(file);
    const photo = await uploadJournalPhoto({
      tripId: state.tripId,
      userId,
      itemId,
      blob,
    });

    if (existingPhoto) {
      journalState.photos = journalState.photos.filter((p) => p.id !== existingPhoto.id);
    }
    journalState.photos.push(photo);
    refreshJournalStatTiles(state, journalState);
    refreshItemPhotoSlot({ itemId, state, journalState, userId });

    if (existingPhoto) {
      try {
        await deleteJournalPhoto({ photoId: existingPhoto.id, storagePath: existingPhoto.storage_path });
      } catch (deleteError) {
        console.error("Old photo cleanup failed after replacement:", deleteError);
      }
    }
  } catch (error) {
    console.error("Photo replace failed:", error);
    showToast("Couldn't replace photo. Try again.", "error");
    if (slot) slot.classList.remove("is-uploading");
  }
}

async function handlePhotoRemove({ itemId, state, journalState }) {
  const { session } = sessionStore.getState();
  const userId = session?.user?.id;
  const existingPhoto = journalState.photos.find(
    (p) => p.item_id === itemId && p.user_id === userId
  );

  if (!existingPhoto) return;

  try {
    await deleteJournalPhoto({ photoId: existingPhoto.id, storagePath: existingPhoto.storage_path });
    journalState.photos = journalState.photos.filter((p) => p.id !== existingPhoto.id);
    refreshJournalStatTiles(state, journalState);
    refreshItemPhotoSlot({ itemId, state, journalState, userId });
  } catch (error) {
    console.error("Photo remove failed:", error);
    showToast("Couldn't remove photo. Try again.", "error");
  }
}

function refreshItemPhotoSlot({ itemId, state, journalState, userId }) {
  const item = state.items.find((i) => i.id === itemId);
  if (!item) return;

  const existingPhoto = journalState.photos.find(
    (p) => p.item_id === itemId && p.user_id === userId
  ) || null;

  const slotEl = document.querySelector(`[data-journal-photo-slot="${CSS.escape(itemId)}"]`);
  if (!slotEl) return;

  const newHtml = renderItemPhotoSlot(item, existingPhoto, true);
  const temp = document.createElement("div");
  temp.innerHTML = newHtml;
  const newSlot = temp.firstElementChild;
  if (newSlot) {
    slotEl.replaceWith(newSlot);
    window.lucide?.createIcons?.();
    wireItemPhotos(state, journalState, userId);
  }
}

// ---------------------------------------------------------------------------
// Done toggle
// ---------------------------------------------------------------------------

function wireDoneToggles(state, journalState) {
  document.querySelectorAll("[data-journal-done-toggle]").forEach((button) => {
    if (button.dataset.journalDoneBound === "true") return;
    const itemId = button.dataset.journalDoneToggle;
    button.dataset.journalDoneBound = "true";

    const handler = async () => {
      const item = state.items.find((candidate) => candidate.id === itemId);
      if (!item) return;

      const previousStatus = item.status;
      const nextStatus = previousStatus === "done" ? JOURNAL_REVERT_STATUS : "done";
      const card = button.closest("[data-item-id]");
      const isDone = nextStatus === "done";

      item.status = nextStatus;
      card?.classList.toggle("journal-item-card--done", isDone);
      card?.setAttribute("data-status", nextStatus);
      button.classList.toggle("is-done", isDone);
      button.setAttribute("aria-pressed", String(isDone));
      button.setAttribute("aria-label", isDone ? "Mark not done" : "Mark as done");
      window.lucide?.createIcons?.();
      button.disabled = true;

      try {
        await updateJournalItemStatus(itemId, nextStatus);
      } catch (error) {
        console.error("Failed to update item status:", error);
        item.status = previousStatus;
        card?.classList.toggle("journal-item-card--done", previousStatus === "done");
        card?.setAttribute("data-status", previousStatus);
        button.classList.toggle("is-done", previousStatus === "done");
        button.setAttribute("aria-pressed", String(previousStatus === "done"));
        button.setAttribute("aria-label", previousStatus === "done" ? "Mark not done" : "Mark as done");
        button.disabled = false;
        window.lucide?.createIcons?.();
        showToast("Couldn't update this item right now. Try again.", "error");
        return;
      }

      button.disabled = false;
    };

    button.addEventListener("click", handler);
    _journalCleanupFns.push(() => button.removeEventListener("click", handler));
  });
}
