import { sessionStore } from "../../../state/session-store.js";
import {
  upsertJournalEntry,
  uploadJournalPhoto,
  deleteJournalPhoto,
  markItemDone,
  compressJournalPhoto,
} from "../../../services/journal-service.js";
import { openProfileModal } from "../../shared/profile-modal.js";
import { showToast } from "../../shared/toast.js";
import {
  renderJournalDaySection,
  renderProfilePromptBanner,
  renderItemPhotoSlot,
} from "./journal-view.js";

const AUTOSAVE_DELAY_MS = 500;
const SAVED_FEEDBACK_MS = 2000;
const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

let _journalCleanupFns = [];
let _profileBannerDismissed = false;

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
    _profileBannerDismissed = true;
    prompt.remove();
  });

  document.querySelector("#journal-open-profile")?.addEventListener("click", () => {
    openProfileModal({
      onSaved: (profile) => {
        journalState.profiles = journalState.profiles.filter((p) => p.id !== profile.id);
        journalState.profiles.push(profile);
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

// ---------------------------------------------------------------------------
// Day-level journal entries
// ---------------------------------------------------------------------------

function wireDayEntries(state, journalState, userId) {
  document.querySelectorAll("[data-journal-day-entry]").forEach((container) => {
    const dayId = container.dataset.journalDayEntry;
    const textarea = container.querySelector("[data-journal-textarea]");
    if (!textarea) return;

    setupAutoResize(textarea);

    let debounceTimer = null;
    let savedEntryId = container.dataset.entryId || null;

    const saveEntry = async () => {
      const notes = textarea.value.trim();
      const savedEl = container.querySelector(".journal-day-entry__saved");

      try {
        const result = await upsertJournalEntry({
          existingId: savedEntryId || null,
          tripId: state.tripId,
          userId,
          dayId,
          itemId: null,
          notes,
        });

        savedEntryId = result.id;
        container.dataset.entryId = result.id;

        const existingIdx = journalState.entries.findIndex((e) => e.id === result.id);
        if (existingIdx >= 0) {
          journalState.entries[existingIdx] = result;
        } else {
          journalState.entries.push(result);
        }

        showSavedFeedback(savedEl);
      } catch (error) {
        console.error("Failed to save journal entry:", error);
        showToast("Couldn't save your entry. Try again.", "error");
      }
    };

    const handleBlur = () => {
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(saveEntry, AUTOSAVE_DELAY_MS);
    };

    textarea.addEventListener("blur", handleBlur);
    _journalCleanupFns.push(() => {
      textarea.removeEventListener("blur", handleBlur);
      clearTimeout(debounceTimer);
    });
  });
}

// ---------------------------------------------------------------------------
// Item-level journal entries
// ---------------------------------------------------------------------------

function wireItemEntries(state, journalState, userId) {
  document.querySelectorAll("[data-journal-item-entry]").forEach((container) => {
    const itemId = container.dataset.journalItemEntry;
    const textarea = container.querySelector("[data-journal-textarea]");
    if (!textarea) return;

    setupAutoResize(textarea);

    let debounceTimer = null;
    let savedEntryId = container.dataset.entryId || null;

    const saveEntry = async () => {
      const notes = textarea.value.trim();
      const savedEl = container.querySelector(".journal-item-entry__saved");

      try {
        const result = await upsertJournalEntry({
          existingId: savedEntryId || null,
          tripId: state.tripId,
          userId,
          dayId: null,
          itemId,
          notes,
        });

        savedEntryId = result.id;
        container.dataset.entryId = result.id;

        const existingIdx = journalState.entries.findIndex((e) => e.id === result.id);
        if (existingIdx >= 0) {
          journalState.entries[existingIdx] = result;
        } else {
          journalState.entries.push(result);
        }

        showSavedFeedback(savedEl);
      } catch (error) {
        console.error("Failed to save item journal entry:", error);
        showToast("Couldn't save your note. Try again.", "error");
      }
    };

    const handleBlur = () => {
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(saveEntry, AUTOSAVE_DELAY_MS);
    };

    textarea.addEventListener("blur", handleBlur);
    _journalCleanupFns.push(() => {
      textarea.removeEventListener("blur", handleBlur);
      clearTimeout(debounceTimer);
    });
  });
}

// ---------------------------------------------------------------------------
// Item photos — add / replace / remove
// ---------------------------------------------------------------------------

function wireItemPhotos(state, journalState, userId) {
  // Add photo
  document.querySelectorAll("[data-journal-photo-add]").forEach((button) => {
    const itemId = button.dataset.journalPhotoAdd;
    const handler = () => handlePhotoAdd({ itemId, state, journalState, userId });
    button.addEventListener("click", handler);
    _journalCleanupFns.push(() => button.removeEventListener("click", handler));
  });

  // Replace photo
  document.querySelectorAll("[data-journal-photo-replace]").forEach((button) => {
    const itemId = button.dataset.journalPhotoReplace;
    const handler = () => handlePhotoReplace({ itemId, state, journalState, userId });
    button.addEventListener("click", handler);
    _journalCleanupFns.push(() => button.removeEventListener("click", handler));
  });

  // Remove photo
  document.querySelectorAll("[data-journal-photo-remove]").forEach((button) => {
    const itemId = button.dataset.journalPhotoRemove;
    const handler = () => handlePhotoRemove({ itemId, state, journalState });
    button.addEventListener("click", handler);
    _journalCleanupFns.push(() => button.removeEventListener("click", handler));
  });
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
    if (existingPhoto) {
      await deleteJournalPhoto({ photoId: existingPhoto.id, storagePath: existingPhoto.storage_path });
      journalState.photos = journalState.photos.filter((p) => p.id !== existingPhoto.id);
    }

    const blob = await compressJournalPhoto(file);
    const photo = await uploadJournalPhoto({
      tripId: state.tripId,
      userId,
      itemId,
      blob,
    });

    journalState.photos.push(photo);
    refreshItemPhotoSlot({ itemId, state, journalState, userId });
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
    if (button.disabled) return;

    const itemId = button.dataset.journalDoneToggle;

    const handler = async () => {
      button.disabled = true;

      try {
        await markItemDone(itemId);

        // Update items in the state so switching back to itinerary is correct
        const item = state.items.find((i) => i.id === itemId);
        if (item) item.status = "done";

        // Apply done styling to the card
        const card = button.closest("[data-item-id]");
        if (card) {
          card.classList.add("journal-item-card--done");
          const title = card.querySelector(".guide-item-card__title");
          if (title) title.classList.add("journal-item-card__title--done");
        }

        // Swap icon to check-circle
        button.classList.add("is-done");
        button.setAttribute("aria-pressed", "true");
        button.setAttribute("aria-label", "Done");
        const icon = button.querySelector("i[data-lucide]");
        if (icon) {
          icon.setAttribute("data-lucide", "check-circle");
          window.lucide?.createIcons?.();
        }
      } catch (error) {
        console.error("Failed to mark item done:", error);
        button.disabled = false;
        showToast("Couldn't mark as done. Try again.", "error");
      }
    };

    button.addEventListener("click", handler);
    _journalCleanupFns.push(() => button.removeEventListener("click", handler));
  });
}
