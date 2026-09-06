import { showToast } from "../../shared/toast.js";

const SHARE_LINK_FEEDBACK_DURATION_MS = 2000;
const shareLinkFeedbackResetTimers = new Map();

export function clearShareLinkFeedbackResetTimer(key) {
  if (key == null) {
    shareLinkFeedbackResetTimers.forEach((timerId, timerKey) => {
      window.clearTimeout(timerId);
      shareLinkFeedbackResetTimers.delete(timerKey);
    });
    return;
  }

  const timerId = shareLinkFeedbackResetTimers.get(key);
  if (timerId) {
    window.clearTimeout(timerId);
    shareLinkFeedbackResetTimers.delete(key);
  }
}

function buildTripGuideUrl(tripId, mode = "itinerary") {
  const url = new URL(`/app/trip/${tripId}/guide`, window.location.origin);
  if (mode === "journal") {
    url.hash = "journal";
  }
  return url.toString();
}

function buildTripPlanningExportUrl(tripId) {
  const url = new URL("/api/trip-export", window.location.origin);
  url.searchParams.set("id", tripId);
  url.searchParams.set("mode", "planning");
  return url.toString();
}

function updateShareLinkHint(hint, message) {
  if (!hint) {
    return;
  }

  hint.textContent = message;
}

function updateShareLinkButtonState(button, { isVisible, isEnabled, isCopied = false, labelText }) {
  button.hidden = !isVisible;

  const icon = button.querySelector("[data-share-link-icon]");
  const label = button.querySelector("[data-share-link-label]");

  button.classList.toggle("is-disabled", !isEnabled);
  button.classList.toggle("is-copied", isCopied);
  button.setAttribute("aria-disabled", String(!isEnabled));
  button.tabIndex = isEnabled ? 0 : -1;

  if (icon) {
    icon.innerHTML = `<i data-lucide="${isCopied ? "check" : "link"}" aria-hidden="true"></i>`;
  }

  if (label) {
    label.textContent = isCopied ? "Copied!" : labelText;
  }

  window.lucide?.createIcons?.();
}

async function copyTextToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  const didCopy = document.execCommand("copy");
  textarea.remove();

  if (!didCopy) {
    throw new Error("Clipboard copy failed");
  }
}

export function wireTripSettingsShareLink(trip) {
  const form = document.querySelector("#trip-settings-form");
  const isPublicInput = form?.querySelector('[name="isPublic"]');
  const planningPublicInput = form?.querySelector('[name="isPlanningPublic"]');
  const journalPublicInput = form?.querySelector("[data-journal-public-toggle]");
  const journalToggleRow = form?.querySelector(".trip-settings-form__sharing-row--journal");
  const publicShareLinkButton = form?.querySelector("[data-copy-share-link]");
  const planningShareLinkButton = form?.querySelector("[data-copy-planning-share-link]");
  const journalShareLinkButton = form?.querySelector("[data-copy-journal-share-link]");
  const publicShareLinkHint = form?.querySelector("[data-share-link-hint]");
  const planningShareLinkHint = form?.querySelector("[data-planning-share-link-hint]");
  const journalShareLinkHint = form?.querySelector("[data-journal-share-link-hint]");
  const publicSavedShareHint = "Anyone with the link can view your itinerary.";
  const planningSavedShareHint = "A plain-text view of everything, for AI tools.";
  const journalSavedShareHint = "Let anyone with the link read your trip journal.";
  const unsavedShareHint = "Copied — save changes to make this link work for others.";

  if (
    !trip?.id ||
    !isPublicInput ||
    !publicShareLinkButton ||
    !planningPublicInput ||
    !planningShareLinkButton ||
    !journalPublicInput ||
    !journalToggleRow ||
    !journalShareLinkButton
  ) {
    return;
  }

  clearShareLinkFeedbackResetTimer("public");
  clearShareLinkFeedbackResetTimer("planning");
  clearShareLinkFeedbackResetTimer("journal");
  updateShareLinkHint(publicShareLinkHint, publicSavedShareHint);
  updateShareLinkHint(planningShareLinkHint, planningSavedShareHint);
  updateShareLinkHint(journalShareLinkHint, journalSavedShareHint);

  const syncSharingUi = ({ publicCopied = false, planningCopied = false, journalCopied = false } = {}) => {
    const isPublicChecked = isPublicInput.checked;
    const isPlanningChecked = planningPublicInput.checked;
    const isJournalChecked = isPublicChecked && journalPublicInput.checked;
    const hasPersistedPublicShareLink = Boolean(trip.is_public);
    const hasPersistedPlanningShareLink = Boolean(trip.is_planning_public);
    const hasPersistedJournalShareLink = Boolean(trip.is_public && trip.is_journal_public);
    const hasUnsavedPublicShareIntent = isPublicChecked && !hasPersistedPublicShareLink;
    const hasUnsavedPlanningShareIntent = isPlanningChecked && !hasPersistedPlanningShareLink;
    const hasUnsavedJournalShareIntent = isJournalChecked && !hasPersistedJournalShareLink;

    updateShareLinkButtonState(publicShareLinkButton, {
      isVisible: isPublicChecked,
      isEnabled: hasPersistedPublicShareLink || hasUnsavedPublicShareIntent,
      isCopied: hasPersistedPublicShareLink && publicCopied,
      labelText: "Copy link",
    });

    updateShareLinkButtonState(planningShareLinkButton, {
      isVisible: isPlanningChecked,
      isEnabled: hasPersistedPlanningShareLink || hasUnsavedPlanningShareIntent,
      isCopied: hasPersistedPlanningShareLink && planningCopied,
      labelText: "Copy link",
    });

    updateShareLinkButtonState(journalShareLinkButton, {
      isVisible: isJournalChecked,
      isEnabled: hasPersistedJournalShareLink || hasUnsavedJournalShareIntent,
      isCopied: hasPersistedJournalShareLink && journalCopied,
      labelText: "Copy link",
    });

    if (!hasUnsavedPublicShareIntent) {
      updateShareLinkHint(publicShareLinkHint, publicSavedShareHint);
    }

    if (!hasUnsavedPlanningShareIntent) {
      updateShareLinkHint(planningShareLinkHint, planningSavedShareHint);
    }

    if (!hasUnsavedJournalShareIntent) {
      updateShareLinkHint(journalShareLinkHint, journalSavedShareHint);
    }
  };

  isPublicInput.addEventListener("change", () => {
    clearShareLinkFeedbackResetTimer("public");
    clearShareLinkFeedbackResetTimer("journal");

    const isOn = isPublicInput.checked;
    journalPublicInput.disabled = !isOn;
    journalToggleRow.classList.toggle("is-disabled", !isOn);
    if (!isOn) {
      journalPublicInput.checked = false;
    }

    syncSharingUi();
  });

  planningPublicInput.addEventListener("change", () => {
    clearShareLinkFeedbackResetTimer("planning");
    syncSharingUi();
  });

  journalPublicInput.addEventListener("change", () => {
    clearShareLinkFeedbackResetTimer("journal");
    syncSharingUi();
  });

  const wireCopyButton = ({ key, button, input, persistedValue, hint, savedHint, buildUrl, copiedStateKey }) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();

      if (!input.checked) {
        return;
      }

      // The link works as soon as it's saved, and RLS blocks anyone who
      // visits it before that — so there's no harm in letting the owner
      // copy it early instead of forcing a save → reopen round trip.
      const isPersisted = persistedValue();

      try {
        await copyTextToClipboard(buildUrl());
        syncSharingUi({ [copiedStateKey]: true });

        if (!isPersisted) {
          updateShareLinkHint(hint, unsavedShareHint);
        }

        clearShareLinkFeedbackResetTimer(key);
        const timerId = window.setTimeout(() => {
          syncSharingUi();
          if (!isPersisted) {
            updateShareLinkHint(hint, unsavedShareHint);
          }
          shareLinkFeedbackResetTimers.delete(key);
        }, SHARE_LINK_FEEDBACK_DURATION_MS);
        shareLinkFeedbackResetTimers.set(key, timerId);
      } catch (error) {
        console.error(error);
        updateShareLinkHint(hint, savedHint);
        showToast("Couldn't copy. Try again.", "error");
      }
    });
  };

  wireCopyButton({
    key: "public",
    button: publicShareLinkButton,
    input: isPublicInput,
    persistedValue: () => Boolean(trip.is_public),
    hint: publicShareLinkHint,
    savedHint: publicSavedShareHint,
    buildUrl: () => buildTripGuideUrl(trip.id, "itinerary"),
    copiedStateKey: "publicCopied",
  });

  wireCopyButton({
    key: "planning",
    button: planningShareLinkButton,
    input: planningPublicInput,
    persistedValue: () => Boolean(trip.is_planning_public),
    hint: planningShareLinkHint,
    savedHint: planningSavedShareHint,
    buildUrl: () => buildTripPlanningExportUrl(trip.id),
    copiedStateKey: "planningCopied",
  });

  wireCopyButton({
    key: "journal",
    button: journalShareLinkButton,
    input: journalPublicInput,
    persistedValue: () => Boolean(trip.is_public && trip.is_journal_public),
    hint: journalShareLinkHint,
    savedHint: journalSavedShareHint,
    buildUrl: () => buildTripGuideUrl(trip.id, "journal"),
    copiedStateKey: "journalCopied",
  });

  syncSharingUi();
}
