import { sessionStore } from "../../../state/session-store.js";
import {
  upsertJournalEntry,
  uploadJournalPhoto,
  deleteJournalPhoto,
  updateJournalItemCompletion,
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
let _journalCleanupFns = [];
let _saveCounter = 0;
let _openLightboxPhotoId = "";
let _lightboxEscapeHandler = null;

export function teardownJournalMode() {
  _journalCleanupFns.forEach((fn) => fn());
  _journalCleanupFns = [];
  closeJournalLightbox();
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
  wirePhotoLightbox(state, journalState);
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

function wirePhotoLightbox(state, journalState) {
  document.querySelectorAll("[data-journal-photo-open]").forEach((button) => {
    if (button.dataset.journalLightboxBound === "true") return;
    const photoId = button.dataset.journalPhotoOpen;
    if (!photoId) return;
    button.dataset.journalLightboxBound = "true";

    const handleOpen = () => {
      openJournalLightbox({ photoId, state, journalState });
    };

    button.addEventListener("click", handleOpen);
    _journalCleanupFns.push(() => button.removeEventListener("click", handleOpen));
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

function updateDoneAttribution(card, item, state, journalState) {
  if (!card) return;
  const doneBlock = card.querySelector(".journal-item-card__done-block");
  if (!doneBlock) return;

  const existing = card.querySelector(".journal-item-card__done-by");
  if (existing) {
    existing.remove();
  }

  if (item.is_done !== true || !item.done_by) {
    return;
  }

  const memberUserId = item.done_by;
  const profile = journalState.profiles.find((entry) => entry.id === memberUserId) || null;
  const member = state.members.find((entry) => entry.user_id === memberUserId) || null;
  const name = profile?.first_name
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ")
    : member?.email || memberUserId;

  const wrapper = document.createElement("p");
  wrapper.className = "journal-item-card__done-by";
  wrapper.setAttribute("aria-label", "Marked done by");
  wrapper.textContent = `by ${name}`;

  doneBlock.append(wrapper);
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

async function handlePhotoReplace({ itemId, state, journalState, userId, closeLightboxOnSuccess = false }) {
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
    rerenderJournalLightboxIfOpen(state, journalState);

    if (existingPhoto) {
      try {
        await deleteJournalPhoto({ photoId: existingPhoto.id, storagePath: existingPhoto.storage_path });
      } catch (deleteError) {
        console.error("Old photo cleanup failed after replacement:", deleteError);
      }
    }

    if (closeLightboxOnSuccess) {
      closeJournalLightbox();
    }
  } catch (error) {
    console.error("Photo replace failed:", error);
    showToast("Couldn't replace photo. Try again.", "error");
    if (slot) slot.classList.remove("is-uploading");
  }
}

async function handlePhotoRemove({ itemId, state, journalState, closeLightboxOnSuccess = false }) {
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
    rerenderJournalLightboxIfOpen(state, journalState);
    if (closeLightboxOnSuccess) {
      closeJournalLightbox();
    }
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
    wirePhotoLightbox(state, journalState);
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
      const { session } = sessionStore.getState();
      const sessionUserId = session?.user?.id || null;

      const card = button.closest("[data-item-id]");
      const previousIsDone = item.is_done === true;
      const previousDoneBy = item.done_by || null;
      const previousDoneAt = item.done_at || null;
      const nextIsDone = !previousIsDone;
      const nextDoneAt = nextIsDone ? new Date().toISOString() : null;
      const nextDoneBy = nextIsDone ? sessionUserId || state.userId || null : null;

      item.is_done = nextIsDone;
      item.done_by = nextDoneBy;
      item.done_at = nextDoneAt;
      card?.classList.toggle("journal-item-card--done", nextIsDone);
      card?.setAttribute("data-is-done", String(nextIsDone));
      button.classList.toggle("is-done", nextIsDone);
      button.setAttribute("aria-pressed", String(nextIsDone));
      button.setAttribute("aria-label", nextIsDone ? "Mark not done" : "Mark as done");
      button.querySelector(".journal-done-toggle__label").textContent = nextIsDone ? "Done" : "Mark done";
      updateDoneAttribution(card, item, state, journalState);
      refreshJournalStatTiles(state, journalState);
      window.lucide?.createIcons?.();
      button.disabled = true;

      try {
        await updateJournalItemCompletion({
          itemId,
          isDone: nextIsDone,
          doneBy: nextDoneBy,
          doneAt: nextDoneAt,
        });
      } catch (error) {
        console.error("Failed to update item completion:", error);
        item.is_done = previousIsDone;
        item.done_by = previousDoneBy;
        item.done_at = previousDoneAt;
        card?.classList.toggle("journal-item-card--done", previousIsDone);
        card?.setAttribute("data-is-done", String(previousIsDone));
        button.classList.toggle("is-done", previousIsDone);
        button.setAttribute("aria-pressed", String(previousIsDone));
        button.setAttribute("aria-label", previousIsDone ? "Mark not done" : "Mark as done");
        button.querySelector(".journal-done-toggle__label").textContent = previousIsDone ? "Done" : "Mark done";
        updateDoneAttribution(card, item, state, journalState);
        refreshJournalStatTiles(state, journalState);
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

function openJournalLightbox({ photoId, state, journalState }) {
  _openLightboxPhotoId = photoId;
  renderJournalLightbox(state, journalState);
}

function closeJournalLightbox() {
  document.querySelector(".journal-lightbox")?.remove();
  document.body.classList.remove("journal-lightbox-open");
  if (_lightboxEscapeHandler) {
    document.removeEventListener("keydown", _lightboxEscapeHandler);
    _lightboxEscapeHandler = null;
  }
  _openLightboxPhotoId = "";
}

function rerenderJournalLightboxIfOpen(state, journalState) {
  if (_openLightboxPhotoId) {
    renderJournalLightbox(state, journalState);
  }
}

function getPhotoItem(state, photo) {
  return state.items.find((item) => item.id === photo?.item_id) || null;
}

function getLightboxPhotos(state, journalState, currentPhotoId) {
  const currentPhoto = journalState.photos.find((photo) => photo.id === currentPhotoId) || null;
  if (!currentPhoto) {
    return [];
  }

  const currentItem = getPhotoItem(state, currentPhoto);
  const dayId = currentItem?.day_id || null;

  if (!dayId) {
    return [currentPhoto];
  }

  const dayItemIds = new Set(
    state.items
      .filter((item) => item.day_id === dayId)
      .map((item) => item.id)
  );

  return journalState.photos
    .filter((photo) => dayItemIds.has(photo.item_id))
    .sort((a, b) => {
      const left = Date.parse(a.created_at || a.updated_at || "") || 0;
      const right = Date.parse(b.created_at || b.updated_at || "") || 0;
      return left - right;
    });
}

function canEditLightboxPhoto(state, photo) {
  return Boolean(
    photo
    && state.viewerRole !== "public"
    && state.userId
    && photo.user_id === state.userId
  );
}

function renderJournalLightbox(state, journalState) {
  const photos = getLightboxPhotos(state, journalState, _openLightboxPhotoId);
  const currentIndex = photos.findIndex((photo) => photo.id === _openLightboxPhotoId);
  const currentPhoto = currentIndex >= 0 ? photos[currentIndex] : null;

  if (!currentPhoto?.public_url) {
    closeJournalLightbox();
    return;
  }

  const item = getPhotoItem(state, currentPhoto);
  const canEdit = canEditLightboxPhoto(state, currentPhoto);
  const hasMultiple = photos.length > 1;
  const existingLightbox = document.querySelector(".journal-lightbox");
  const lightbox = existingLightbox || document.createElement("div");

  lightbox.className = "journal-lightbox";
  lightbox.innerHTML = `
    <div class="journal-lightbox__backdrop" data-journal-lightbox-close></div>
    <section class="journal-lightbox__dialog" role="dialog" aria-modal="true" aria-label="Photo viewer">
      <button class="journal-lightbox__close" data-journal-lightbox-close type="button" aria-label="Close photo viewer">
        <i data-lucide="x" aria-hidden="true"></i>
      </button>
      <div class="journal-lightbox__stage">
        ${hasMultiple ? `
          <button class="journal-lightbox__nav journal-lightbox__nav--prev" data-journal-lightbox-prev type="button" aria-label="Previous photo">
            <i data-lucide="chevron-left" aria-hidden="true"></i>
          </button>
        ` : ""}
        <div class="journal-lightbox__media-shell">
          <img class="journal-lightbox__image" src="${escapeHtml(currentPhoto.public_url)}" alt="${escapeHtml(item?.title || "Journal photo")}" />
        </div>
        ${hasMultiple ? `
          <button class="journal-lightbox__nav journal-lightbox__nav--next" data-journal-lightbox-next type="button" aria-label="Next photo">
            <i data-lucide="chevron-right" aria-hidden="true"></i>
          </button>
        ` : ""}
      </div>
      <div class="journal-lightbox__meta">
        <p class="journal-lightbox__title">${escapeHtml(item?.title || "Journal photo")}</p>
        ${hasMultiple ? `<p class="journal-lightbox__count">${currentIndex + 1} of ${photos.length}</p>` : ""}
      </div>
      ${canEdit ? `
        <div class="journal-lightbox__toolbar">
          <button class="journal-lightbox__toolbar-button" data-journal-lightbox-replace="${escapeHtml(item?.id || "")}" type="button">
            <i data-lucide="refresh-cw" aria-hidden="true"></i>
            <span>Replace</span>
          </button>
          <button class="journal-lightbox__toolbar-button journal-lightbox__toolbar-button--danger" data-journal-lightbox-remove="${escapeHtml(item?.id || "")}" type="button">
            <i data-lucide="trash-2" aria-hidden="true"></i>
            <span>Delete</span>
          </button>
          <button class="journal-lightbox__toolbar-button" data-journal-lightbox-close type="button">
            <i data-lucide="x" aria-hidden="true"></i>
            <span>Close</span>
          </button>
        </div>
      ` : ""}
    </section>
  `;

  if (!existingLightbox) {
    document.body.append(lightbox);
  }

  document.body.classList.add("journal-lightbox-open");
  window.lucide?.createIcons?.();

  lightbox.querySelectorAll("[data-journal-lightbox-close]").forEach((button) => {
    button.addEventListener("click", closeJournalLightbox, { once: true });
  });

  lightbox.querySelector(".journal-lightbox__dialog")?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  lightbox.querySelector("[data-journal-lightbox-prev]")?.addEventListener("click", () => {
    const nextPhoto = photos[currentIndex - 1] || photos[photos.length - 1];
    _openLightboxPhotoId = nextPhoto.id;
    renderJournalLightbox(state, journalState);
  });

  lightbox.querySelector("[data-journal-lightbox-next]")?.addEventListener("click", () => {
    const nextPhoto = photos[currentIndex + 1] || photos[0];
    _openLightboxPhotoId = nextPhoto.id;
    renderJournalLightbox(state, journalState);
  });

  lightbox.querySelector("[data-journal-lightbox-replace]")?.addEventListener("click", () => {
    if (!item?.id) return;
    void handlePhotoReplace({
      itemId: item.id,
      state,
      journalState,
      userId: state.userId,
      closeLightboxOnSuccess: true,
    });
  });

  lightbox.querySelector("[data-journal-lightbox-remove]")?.addEventListener("click", () => {
    if (!item?.id) return;
    void handlePhotoRemove({
      itemId: item.id,
      state,
      journalState,
      closeLightboxOnSuccess: true,
    });
  });

  if (_lightboxEscapeHandler) {
    document.removeEventListener("keydown", _lightboxEscapeHandler);
  }

  _lightboxEscapeHandler = (event) => {
    if (event.key === "Escape") {
      closeJournalLightbox();
    }
  };

  document.addEventListener("keydown", _lightboxEscapeHandler);
}
