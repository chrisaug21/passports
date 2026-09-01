import { navigate } from "../../../app/router.js";
import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import {
  filterItemsForViewer,
  getBaseTransitionDayNumbers,
  getLodgingBands,
  getOverviewNavEntries,
  renderFullDayContent,
  renderOverviewSection,
  sortGuideItems,
  getTodayDayNumber,
} from "./guide-view.js";
import { getTripStatTiles } from "../detail/trip-detail-ui.js";
import {
  renderJournalContent,
  renderJournalDayNav,
  renderJournalDaySection,
  renderJournalRefreshButton,
} from "./journal-view.js";
import { wireJournalMode, teardownJournalMode } from "./journal-wire.js";
import { fetchJournalData } from "../../../services/journal-service.js";
import { fetchTripDetailBundle } from "../../../services/trips-service.js";
import { fetchTripMembersWithEmails } from "../../../services/members-service.js";
import {
  renderDeleteItemConfirmModal,
  renderDiscardConfirmModal,
  renderItemEditorModal,
} from "../detail/item-editor-controller.js";
import {
  createItemEditorHandlers,
  getTripItemErrorMessage,
} from "../detail/item-editor-controller.js";
import { wireTripDetailPageEvents } from "../detail/trip-detail-wire.js";
import { setTripDetailRerenderer, tripDetailState } from "../detail/trip-detail-state.js";
import {
  serializeItemEditorDraft,
  syncItemEditorDraftFromForm,
} from "../detail/item-editor-draft.js";
import { showToast } from "../../shared/toast.js";

const GUIDE_ACTIVE_MODE_KEY = "guide-active-mode";
const GUIDE_MOBILE_STICKY_BREAKPOINT_PX = 768;
const JOURNAL_AUTO_REFRESH_MS = 60000;

let cleanupFns = [];

// Programmatic scrolls on desktop can fight touch momentum. Set on touchstart;
// cleared 400ms after touchend to let momentum settle before re-enabling.
let isUserScrolling = false;
let touchEndTimer = null;

// Shared state for tab switching
let _guideState = null;
let _currentMode = "itinerary";
let _todayDayNumber = null;
let _journalState = {
  hasFetched: false,
  isFetching: false,
  isRefreshing: false,
  isManualRefreshing: false,
  entries: [],
  photos: [],
  profiles: [],
};
let _journalAutoRefreshTimer = null;
let _journalItemEditorHandlers = null;

let dayNavOffsetRafId = null;
let dayNavStickyRafId = null;

export function teardownGuideView() {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  isUserScrolling = false;
  clearTimeout(touchEndTimer);
  teardownJournalMode();
  stopJournalAutoRefresh();
  appStore.resetTripDetail();
  _journalItemEditorHandlers = null;
  _guideState = null;
  _currentMode = "itinerary";
  _todayDayNumber = null;
  _journalState = { hasFetched: false, isFetching: false, isRefreshing: false, isManualRefreshing: false, entries: [], photos: [], profiles: [] };
  if (dayNavOffsetRafId) {
    cancelAnimationFrame(dayNavOffsetRafId);
    dayNavOffsetRafId = null;
  }
  if (dayNavStickyRafId) {
    cancelAnimationFrame(dayNavStickyRafId);
    dayNavStickyRafId = null;
  }
}

function isMobileLayout() {
  return window.innerWidth <= 840;
}

export function wireGuideView(state) {
  _guideState = state;
  setTripDetailRerenderer(() => {
    if (_currentMode === "journal") {
      renderJournalModeContent();
    }
  });
  _todayDayNumber = getTodayDayNumber(state.trip);
  _currentMode = getStoredActiveMode();

  wireBackLink(state.tripId);
  wireDashboardLink();
  wireTabSwitching();
  wireNavClicks();
  wireOverviewAccordions();
  setupTouchScrollTracking();
  setupScrollTracking();
  setupDayNavStickyOffsetTracking();
  setupMobileDayNavStickyState();
  setupLazyDays(state);

  if (_todayDayNumber) {
    window.setTimeout(() => scrollOrJumpToTarget(`guide-day-${_todayDayNumber}`), 100);
  }

  // Desktop: derive initial active state from scroll position.
  // Mobile: scrollOrJumpToTarget handles active state; default to first item otherwise.
  if (!isMobileLayout()) {
    updateActiveSection();
  } else if (!_todayDayNumber) {
    document.querySelector(".guide-nav-item")?.classList.add("is-active");
  }

  if (_currentMode === "journal" && document.querySelector('[data-guide-tab="journal"]')) {
    void switchToJournal();
    return;
  }

  persistActiveMode("itinerary");
}

// Exposed so journal-wire can update journal state after saves/uploads
export function getJournalState() {
  return _journalState;
}

export function getGuideState() {
  return _guideState;
}

async function ensureMembersLoaded() {
  if (!_guideState || _guideState.viewerRole === "public" || _guideState.members.length > 0) {
    return;
  }

  const members = await fetchTripMembersWithEmails(_guideState.tripId);
  if (!Array.isArray(members)) {
    _guideState.members = [];
    return;
  }

  if (_guideState.userId && _guideState.userEmail && !members.find((member) => member.user_id === _guideState.userId)) {
    members.push({ user_id: _guideState.userId, email: _guideState.userEmail, role: _guideState.viewerRole });
  }

  _guideState.members = members;
}

// ---------------------------------------------------------------------------
// Back link + topbar dashboard link
// ---------------------------------------------------------------------------

function wireBackLink(tripId) {
  document.querySelector("[data-guide-back]")?.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(`/app/trip/${tripId}`);
  });
}

function wireDashboardLink() {
  document.querySelector("#trip-back-to-dashboard")?.addEventListener("click", () => {
    navigate("/app");
  });
}

// ---------------------------------------------------------------------------
// Day nav click → scroll / jump
// ---------------------------------------------------------------------------

// Every nav item (day or overview section) carries data-nav-id equal to its
// target section's own element id, so click/scroll-spy/active-highlight work
// uniformly across both kinds without separate code paths.
function wireNavClicks() {
  document.querySelectorAll(".guide-nav-item[data-nav-id]").forEach((button) => {
    button.addEventListener("click", () => {
      scrollOrJumpToTarget(button.dataset.navId);
    });
  });
}

// Desktop: smooth-scroll to offset position; scroll-spy updates active state.
// Mobile: set active pill immediately then scrollIntoView — no scroll-spy.
function scrollOrJumpToTarget(targetId) {
  if (!targetId) return;

  if (isMobileLayout()) {
    document.querySelectorAll(".guide-nav-item").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.navId === targetId);
    });

    syncMobileDayNavOffset();
    const stickyOffset = getGuideDayNavOffset() + getGuideDayNavHeight();
    const section = document.getElementById(targetId);
    if (!section) {
      return;
    }

    const top = section.getBoundingClientRect().top + window.scrollY - stickyOffset;
    window.scrollTo({ top, behavior: "smooth" });
  } else {
    scrollToTarget(targetId);
  }
}

// ---------------------------------------------------------------------------
// Touch scroll guard (desktop touch screens — prevents scroll-spy fighting
// touch momentum when both are active on the same device)
// ---------------------------------------------------------------------------

function setupTouchScrollTracking() {
  const handleTouchStart = () => {
    isUserScrolling = true;
    clearTimeout(touchEndTimer);
  };

  const handleTouchEnd = () => {
    clearTimeout(touchEndTimer);
    touchEndTimer = setTimeout(() => {
      isUserScrolling = false;
    }, 400);
  };

  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });

  cleanupFns.push(() => {
    document.removeEventListener("touchstart", handleTouchStart);
    document.removeEventListener("touchend", handleTouchEnd);
    clearTimeout(touchEndTimer);
  });
}

function scrollToTarget(targetId) {
  if (isUserScrolling) return;
  const section = document.getElementById(targetId);
  if (!section) return;
  const OFFSET = 80;
  const top = section.getBoundingClientRect().top + window.scrollY - OFFSET;
  window.scrollTo({ top, behavior: "smooth" });
}

// ---------------------------------------------------------------------------
// Scroll-spy → active nav highlight (desktop only — mobile uses explicit tap)
// ---------------------------------------------------------------------------

function setupScrollTracking() {
  if (isMobileLayout()) return;

  let rafId = null;

  const handleScroll = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      updateActiveSection();
    });
  };

  window.addEventListener("scroll", handleScroll, { passive: true });

  cleanupFns.push(() => {
    window.removeEventListener("scroll", handleScroll);
    if (rafId) cancelAnimationFrame(rafId);
  });
}

function updateActiveSection() {
  const OFFSET = 120;
  const sections = [...document.querySelectorAll(".guide-nav-anchor")];
  if (sections.length === 0) return;

  let activeId = sections[0].id;

  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= OFFSET) {
      activeId = section.id;
    }
  }

  document.querySelectorAll(".guide-nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.navId === activeId);
  });
}

// ---------------------------------------------------------------------------
// Lazy day loading
// ---------------------------------------------------------------------------

function setupLazyDays(state) {
  const placeholders = document.querySelectorAll(".guide-day-placeholder[data-lazy-day]");
  if (placeholders.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const placeholder = entry.target;
        const dayNumber = parseInt(placeholder.dataset.lazyDay, 10);
        const day = state.days.find((d) => d.day_number === dayNumber);
        if (!day) return;

        observer.unobserve(placeholder);

        const section = placeholder.closest(".guide-day-section");
        if (!section) return;

        const allVisible = filterItemsForViewer(state.items, state.viewerRole);
        const allBands = getLodgingBands(allVisible, state.bases, state.days, state.trip.start_date);
        const bandItemIds = new Set(allBands.map((b) => b.lodging.id));

        const dayItems = allVisible.filter((i) => i.day_id === day.id && !bandItemIds.has(i.id));
        const sorted = sortGuideItems(dayItems);
        const dayBands = allBands.filter(
          (b) => b.checkInDayNumber === dayNumber || b.checkOutDayNumber === dayNumber
        );

        section.innerHTML = renderFullDayContent(
          day,
          sorted,
          state.viewerRole,
          dayBands,
          state.bases,
          state.trip.start_date
        );
        window.lucide?.createIcons?.();
      });
    },
    { rootMargin: "300px 0px" }
  );

  placeholders.forEach((el) => observer.observe(el));
  cleanupFns.push(() => observer.disconnect());
}

// ---------------------------------------------------------------------------
// Overview content accordion — single-select category tabs
// ---------------------------------------------------------------------------

// Delegated on .guide-content, which persists across itinerary/journal tab
// switches and lazy day loads (only its innerHTML is replaced), so this only
// needs to be bound once per guide page load.
function wireOverviewAccordions() {
  const content = document.querySelector(".guide-content");
  if (!content || content.dataset.overviewAccordionDelegated === "true") {
    return;
  }
  content.dataset.overviewAccordionDelegated = "true";

  content.addEventListener("click", (event) => {
    const button = event.target.closest("[data-overview-category]");
    if (!button || !content.contains(button)) return;

    const section = button.closest(".guide-overview");
    if (!section) return;

    const wasActive = button.classList.contains("is-active");

    section.querySelectorAll("[data-overview-category]").forEach((tab) => {
      tab.classList.remove("is-active");
      tab.setAttribute("aria-selected", "false");
    });
    section.querySelectorAll("[data-overview-panel]").forEach((panel) => {
      panel.classList.remove("is-active");
      panel.setAttribute("hidden", "");
    });

    if (wasActive) return;

    button.classList.add("is-active");
    button.setAttribute("aria-selected", "true");
    const panel = section.querySelector(`[data-overview-panel="${button.dataset.overviewCategory}"]`);
    if (panel) {
      panel.classList.add("is-active");
      panel.removeAttribute("hidden");
    }
  });
}

// ---------------------------------------------------------------------------
// Tab switching — Itinerary ↔ Journal
// ---------------------------------------------------------------------------

function wireTabSwitching() {
  document.querySelectorAll("[data-guide-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.guideTab;
      if (tab === _currentMode) return;
      if (tab === "journal") switchToJournal();
      else switchToItinerary();
    });
  });
}

async function switchToJournal() {
  if (!_guideState) return;
  if (_journalState.isFetching) return;

  setActiveTab("journal");

  if (!_journalState.hasFetched) {
    _journalState.isFetching = true;

    try {
      await ensureMembersLoaded();
      const memberUserIds = _guideState.members.map((member) => member.user_id);
      const doneUserIds = _guideState.items
        .map((item) => item.done_by)
        .filter(Boolean);
      const data = await fetchJournalData(_guideState.tripId, memberUserIds, doneUserIds);
      _journalState.entries = data.entries;
      _journalState.photos = data.photos;
      _journalState.profiles = data.profiles;
      _journalState.hasFetched = true;
    } catch (error) {
      console.error("Failed to load journal data:", error);
      _journalState.isFetching = false;
      setActiveTab("itinerary");
      _currentMode = "itinerary";
      persistActiveMode("itinerary");
      return;
    }

    _journalState.isFetching = false;
  }

  _currentMode = "journal";
  persistActiveMode("journal");
  renderJournalModeContent();
  startJournalAutoRefresh();
}

function switchToItinerary() {
  if (!_guideState) return;

  teardownJournalMode();
  stopJournalAutoRefresh();
  setActiveTab("itinerary");
  _currentMode = "itinerary";
  persistActiveMode("itinerary");
  renderItineraryModeContent();
}

function getStoredActiveMode() {
  const hashMode = getModeFromHash(window.location.hash);
  return hashMode || "itinerary";
}

function persistActiveMode(mode) {
  syncGuideModeHash(mode);

  try {
    window.sessionStorage.setItem(GUIDE_ACTIVE_MODE_KEY, mode);
  } catch (_error) {
    // Ignore sessionStorage failures.
  }
}

function getModeFromHash(hashValue) {
  return String(hashValue || "").toLowerCase() === "#journal" ? "journal" : null;
}

function syncGuideModeHash(mode) {
  const url = new URL(window.location.href);
  const nextHash = mode === "journal" ? "#journal" : "";

  if (url.hash === nextHash) {
    return;
  }

  url.hash = nextHash;
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function setActiveTab(tab) {
  document.querySelectorAll("[data-guide-tab]").forEach((btn) => {
    const isActive = btn.dataset.guideTab === tab;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
}

function renderJournalModeContent() {
  const nav = document.querySelector(".guide-day-nav");
  const content = document.querySelector(".guide-content");
  if (!nav || !content || !_guideState) return;

  syncGuideStateFromTripStore();
  syncTripDetailModalState();
  renderJournalHeroControls();
  // Replace only the nav items, not the <nav> element itself
  nav.innerHTML = renderJournalDayNav(_guideState.days, _guideState.trip, _todayDayNumber);
  content.innerHTML = `
    ${renderJournalContent(_guideState, _journalState)}
    ${renderJournalItemEditorOverlays()}
  `;

  window.lucide?.createIcons?.();
  wireNavClicks();
  setupLazyJournalDays();
  wireJournalMode(_guideState, _journalState);
  wireJournalControls();
  const itemEditorHandlers = createGuideItemEditorHandlers();
  wireJournalItemEditorButtons(itemEditorHandlers);
  wireTripDetailPageEvents(itemEditorHandlers);
  restoreDayNavSelection();
}

function renderItineraryModeContent() {
  const nav = document.querySelector(".guide-day-nav");
  const content = document.querySelector(".guide-content");
  if (!nav || !content || !_guideState) return;

  const { trip, bases, days, items, overviewBlocks, viewerRole } = _guideState;
  renderJournalHeroControls();

  const overviewNavEntries = getOverviewNavEntries(days, bases, overviewBlocks || []);

  // Build nav items only (not the <nav> wrapper — we set innerHTML of the existing nav)
  nav.innerHTML = renderJournalDayNav(days, trip, _todayDayNumber, overviewNavEntries);

  const visibleItems = filterItemsForViewer(items, viewerRole);
  const isMember = viewerRole !== "public";
  const statItems = isMember ? items : visibleItems;
  const statTiles = getTripStatTiles(trip, bases, statItems);
  const lodgingBands = getLodgingBands(visibleItems, bases, days, trip.start_date);
  const lodgingBandItemIds = new Set(lodgingBands.map((b) => b.lodging.id));
  const baseTransitionDayNumbers = getBaseTransitionDayNumbers(days);
  const tripOverviewHtml = renderOverviewSection(null, overviewBlocks || [], "Trip Overview", "guide-trip-overview");

  const daySections = days
    .map((day, index) => {
      const dayItems = visibleItems.filter((i) => i.day_id === day.id && !lodgingBandItemIds.has(i.id));
      const sorted = sortGuideItems(dayItems);
      const dayBands = lodgingBands.filter(
        (b) => b.checkInDayNumber === day.day_number || b.checkOutDayNumber === day.day_number
      );
      const dayBase = bases.find((b) => b.id === day.base_id);
      const baseName = dayBase?.name || dayBase?.location_name || "This base";
      const baseOverviewHtml = baseTransitionDayNumbers.has(day.day_number)
        ? renderOverviewSection(day.base_id, overviewBlocks || [], `${baseName} Overview`, `guide-base-overview-${day.base_id}`)
        : "";

      if (index === 0) {
        return `${baseOverviewHtml}<section class="guide-day-section guide-nav-anchor" id="guide-day-${day.day_number}" data-day-number="${day.day_number}" aria-label="Day ${day.day_number}">
          ${renderFullDayContent(day, sorted, viewerRole, dayBands, bases, trip.start_date)}
        </section>`;
      }
      return `${baseOverviewHtml}<section class="guide-day-section guide-nav-anchor" id="guide-day-${day.day_number}" data-day-number="${day.day_number}" aria-label="Day ${day.day_number}">
        <div class="guide-day-placeholder" data-lazy-day="${day.day_number}"></div>
      </section>`;
    })
    .join("");

  content.innerHTML = `
    <section class="trip-stat-tiles guide-trip-stat-tiles" aria-label="Trip stats">
      ${statTiles.map((tile) => `
        <article class="panel trip-stat-tile">
          <h3>${tile.count}</h3>
          <p>${tile.label}</p>
        </article>
      `).join("")}
    </section>
    ${tripOverviewHtml}
    ${daySections}
  `;

  window.lucide?.createIcons?.();
  wireNavClicks();
  setupLazyDays(_guideState);

  if (_todayDayNumber) scrollOrJumpToTarget(`guide-day-${_todayDayNumber}`);
  else if (!isMobileLayout()) updateActiveSection();
  else document.querySelector(".guide-nav-item")?.classList.add("is-active");
}

function createGuideItemEditorHandlers() {
  const handlers = createItemEditorHandlers({
    getTripItemErrorMessage,
  });

  return {
    ...handlers,
    onAfterItemEditorOpen: () => {
      handlers.onAfterItemEditorOpen?.();
      if (document.querySelector("#item-editor-modal[aria-hidden='false']")) {
        syncItemEditorDraftFromForm();
        tripDetailState.itemEditorInitialSnapshot = tripDetailState.itemEditorDraft
          ? serializeItemEditorDraft(tripDetailState.itemEditorDraft)
          : "";
      }
    },
  };
}

function syncGuideStateFromTripStore() {
  if (!_guideState) return;
  const currentTrip = tripStore.getCurrentTrip();

  if (currentTrip?.id !== _guideState.tripId) {
    return;
  }

  _guideState.trip = currentTrip;
  _guideState.bases = tripStore.getCurrentBases();
  _guideState.days = tripStore.getCurrentDays();
  _guideState.items = tripStore.getCurrentItems();
  _guideState.overviewBlocks = tripStore.getCurrentOverviewBlocks();
}

function renderJournalItemEditorOverlays() {
  const { tripDetail } = appStore.getState();
  const bases = tripStore.getCurrentBases();
  const days = tripStore.getCurrentDays();
  const items = tripStore.getCurrentItems();
  const editingItem = items.find((item) => item.id === tripDetail.editingItemId) || null;

  return `
    ${renderItemEditorModal({
      item: editingItem,
      bases,
      days,
      mode: tripDetail.itemEditorMode,
      context: tripDetail.itemEditorContext,
      isSaving: tripDetail.isSavingItem,
      isDeleting: tripDetail.isDeletingItem && tripDetail.deletingItemId === editingItem?.id,
    })}
    ${renderDiscardConfirmModal(tripDetail.showDiscardConfirm)}
    ${renderDeleteItemConfirmModal({
      item: items.find((entry) => entry.id === tripDetail.deletingItemId) || null,
      isOpen: tripDetail.showDeleteItemConfirm,
      isDeleting: tripDetail.isDeletingItem,
    })}
  `;
}

function syncTripDetailModalState() {
  const { tripDetail } = appStore.getState();
  const hasOpenModal = Boolean(
    tripDetail.editingItemId ||
    tripDetail.itemEditorMode === "add" ||
    tripDetail.showDiscardConfirm ||
    tripDetail.showDeleteItemConfirm ||
    tripDetailState.pendingDiscardAction
  );

  document.body.classList.toggle("modal-open", hasOpenModal);
}

function wireJournalControls() {
  bindJournalTap("[data-journal-refresh]", () => {
    void refreshJournalData({ showLoading: true });
  });
}

function renderJournalHeroControls() {
  const hero = document.querySelector(".guide-hero");
  if (!hero) return;

  hero.querySelector("[data-journal-hero-controls]")?.remove();

  if (_currentMode !== "journal") {
    return;
  }

  const controls = document.createElement("div");
  controls.className = "journal-hero-controls";
  controls.setAttribute("data-journal-hero-controls", "");
  controls.innerHTML = renderJournalRefreshButton(_journalState);
  hero.append(controls);
  window.lucide?.createIcons?.();
}

function bindJournalTap(selector, handler, options = {}) {
  const clickFallback = options.clickFallback !== false;

  document.querySelectorAll(selector).forEach((element) => {
    if (element.dataset.journalTapBound === "true") {
      return;
    }

    element.dataset.journalTapBound = "true";
    let lastPointerAt = 0;

    element.addEventListener("pointerup", (event) => {
      if (
        typeof PointerEvent !== "undefined"
        && event instanceof PointerEvent
        && (event.pointerType === "touch" || event.pointerType === "pen")
      ) {
        lastPointerAt = Date.now();
        event.preventDefault();
        event.stopImmediatePropagation();
        handler(element, event);
      }
    });

    element.addEventListener("click", (event) => {
      if (!clickFallback) {
        event.stopImmediatePropagation();
        return;
      }
      if (Date.now() - lastPointerAt < 500) {
        event.stopImmediatePropagation();
        return;
      }
      event.stopImmediatePropagation();
      handler(element, event);
    });
  });
}

function wireJournalItemEditorButtons(handlers) {
  _journalItemEditorHandlers = handlers;
  const content = document.querySelector(".guide-content");
  if (!content || content.dataset.journalItemEditorDelegated === "true") {
    return;
  }

  let lastPointerAt = 0;

  const handleJournalItemEditorEvent = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const editButton = target.closest(".journal-item-card [data-edit-item]");
    const addButton = target.closest("[data-add-item-to-day]");
    const button = editButton || addButton;

    if (!button || !content.contains(button)) {
      return;
    }

    const isTouchPointer = (
      event.type === "pointerup"
      && typeof PointerEvent !== "undefined"
      && event instanceof PointerEvent
      && (event.pointerType === "touch" || event.pointerType === "pen")
    );

    if (event.type === "pointerup" && !isTouchPointer) {
      return;
    }

    if (isTouchPointer) {
      lastPointerAt = Date.now();
    } else if (event.type === "click" && Date.now() - lastPointerAt < 500) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (editButton) {
      _journalItemEditorHandlers?.onEditItem?.(editButton.getAttribute("data-edit-item"));
      return;
    }

    _journalItemEditorHandlers?.onAddItemToDay?.(addButton.getAttribute("data-add-item-to-day"));
  };

  content.dataset.journalItemEditorDelegated = "true";
  content.addEventListener("pointerup", handleJournalItemEditorEvent, true);
  content.addEventListener("click", handleJournalItemEditorEvent, true);
}

function startJournalAutoRefresh() {
  stopJournalAutoRefresh();
  _journalAutoRefreshTimer = window.setInterval(() => {
    void refreshJournalData({ showLoading: false });
  }, JOURNAL_AUTO_REFRESH_MS);
}

function stopJournalAutoRefresh() {
  if (!_journalAutoRefreshTimer) {
    return;
  }

  window.clearInterval(_journalAutoRefreshTimer);
  _journalAutoRefreshTimer = null;
}

function isJournalInteractionInProgress() {
  return Boolean(
    document.querySelector("[data-journal-editor]:not([hidden])") ||
    document.querySelector(".journal-photo-slot.is-uploading") ||
    document.querySelector("#item-editor-modal[aria-hidden='false']")
  );
}

async function refreshJournalData({ showLoading }) {
  if (!_guideState || _currentMode !== "journal" || _journalState.isRefreshing) {
    return;
  }

  if (!showLoading && isJournalInteractionInProgress()) {
    return;
  }

  _journalState.isRefreshing = true;
  _journalState.isManualRefreshing = Boolean(showLoading);
  if (showLoading) {
    renderJournalModeContent();
  }

  try {
    await ensureMembersLoaded();
    const bundle = await fetchTripDetailBundle(_guideState.tripId);
    const memberUserIds = _guideState.members.map((member) => member.user_id);
    const doneUserIds = (bundle.items || [])
      .map((item) => item.done_by)
      .filter(Boolean);
    const data = await fetchJournalData(_guideState.tripId, memberUserIds, doneUserIds);

    if (!showLoading && isJournalInteractionInProgress()) {
      return;
    }

    tripStore.setCurrentTripBundle(bundle);
    _guideState = {
      ..._guideState,
      trip: bundle.trip,
      bases: bundle.bases,
      days: bundle.days,
      items: bundle.items,
      overviewBlocks: bundle.overviewBlocks || [],
    };
    _journalState.entries = data.entries;
    _journalState.photos = data.photos;
    _journalState.profiles = data.profiles;
    _journalState.hasFetched = true;
    renderJournalModeContent();
  } catch (error) {
    console.error("Failed to refresh journal data:", error);
    if (showLoading) {
      showToast("Couldn't reload the journal. Try again.", "error");
    }
  } finally {
    _journalState.isRefreshing = false;
    _journalState.isManualRefreshing = false;
    if (showLoading && _currentMode === "journal") {
      renderJournalModeContent();
    }
  }
}

function restoreDayNavSelection() {
  if (!document.querySelector(".guide-nav-item")) return;

  if (!isMobileLayout()) {
    updateActiveSection();
    return;
  }

  if (_todayDayNumber) {
    const targetId = `guide-day-${_todayDayNumber}`;
    document.querySelectorAll(".guide-nav-item").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.navId === targetId);
    });
    return;
  }

  document.querySelector(".guide-nav-item")?.classList.add("is-active");
}

function getGuideDayNavOffset() {
  const navShell = document.querySelector(".guide-day-nav-shell");
  if (!navShell) {
    return 0;
  }

  const rawValue = navShell.style.getPropertyValue("--guide-day-nav-top-offset");
  const parsedValue = Number.parseFloat(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getGuideDayNavHeight() {
  const nav = document.querySelector(".guide-day-nav");
  if (!nav) {
    return 0;
  }

  return Math.ceil(nav.getBoundingClientRect().height);
}

function syncMobileDayNavOffset() {
  const navShell = document.querySelector(".guide-day-nav-shell");
  const nav = navShell?.querySelector(".guide-day-nav");
  if (!navShell) {
    return;
  }

  if (window.innerWidth >= GUIDE_MOBILE_STICKY_BREAKPOINT_PX) {
    navShell.style.removeProperty("--guide-day-nav-top-offset");
    navShell.style.removeProperty("--guide-day-nav-shell-height");
    nav?.style.removeProperty("--guide-day-nav-left");
    nav?.style.removeProperty("--guide-day-nav-width");
    nav?.classList.remove("is-sticky-active");
    return;
  }

  let offset = 0;

  document.querySelectorAll(".topbar, [data-guide-fixed-header]").forEach((element) => {
    const computedStyle = window.getComputedStyle(element);
    if (!["fixed", "sticky"].includes(computedStyle.position)) {
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.bottom <= 0) {
      return;
    }

    offset = Math.max(offset, Math.ceil(rect.bottom));
  });

  navShell.style.setProperty("--guide-day-nav-top-offset", `${offset}px`);
  navShell.style.setProperty("--guide-day-nav-shell-height", `${Math.ceil(navShell.getBoundingClientRect().height)}px`);
  if (nav) {
    const rect = navShell.getBoundingClientRect();
    nav.style.setProperty("--guide-day-nav-left", `${Math.round(rect.left)}px`);
    nav.style.setProperty("--guide-day-nav-width", `${Math.round(rect.width)}px`);
  }
}

function setupDayNavStickyOffsetTracking() {
  syncMobileDayNavOffset();

  const queueSync = () => {
    if (dayNavOffsetRafId) {
      return;
    }

    dayNavOffsetRafId = requestAnimationFrame(() => {
      dayNavOffsetRafId = null;
      syncMobileDayNavOffset();
    });
  };

  window.addEventListener("resize", queueSync);
  window.addEventListener("scroll", queueSync, { passive: true });

  cleanupFns.push(() => {
    window.removeEventListener("resize", queueSync);
    window.removeEventListener("scroll", queueSync);
    if (dayNavOffsetRafId) {
      cancelAnimationFrame(dayNavOffsetRafId);
      dayNavOffsetRafId = null;
    }
  });
}

function updateMobileDayNavStickyState() {
  const navShell = document.querySelector(".guide-day-nav-shell");
  const nav = navShell?.querySelector(".guide-day-nav");
  if (!navShell || !nav) {
    return;
  }

  if (window.innerWidth >= GUIDE_MOBILE_STICKY_BREAKPOINT_PX) {
    nav.classList.remove("is-sticky-active");
    navShell.style.removeProperty("--guide-day-nav-shell-height");
    return;
  }

  syncMobileDayNavOffset();
  const topOffset = getGuideDayNavOffset();
  const rect = navShell.getBoundingClientRect();
  const isStickyActive = rect.top <= topOffset;
  nav.classList.toggle("is-sticky-active", isStickyActive);
}

function setupMobileDayNavStickyState() {
  updateMobileDayNavStickyState();

  const queueStickyUpdate = () => {
    if (dayNavStickyRafId) {
      return;
    }

    dayNavStickyRafId = requestAnimationFrame(() => {
      dayNavStickyRafId = null;
      updateMobileDayNavStickyState();
    });
  };

  window.addEventListener("resize", queueStickyUpdate);
  window.addEventListener("scroll", queueStickyUpdate, { passive: true });

  cleanupFns.push(() => {
    window.removeEventListener("resize", queueStickyUpdate);
    window.removeEventListener("scroll", queueStickyUpdate);
    if (dayNavStickyRafId) {
      cancelAnimationFrame(dayNavStickyRafId);
      dayNavStickyRafId = null;
    }
  });
}

function setupLazyJournalDays() {
  const placeholders = document.querySelectorAll(".guide-day-placeholder[data-lazy-journal-day]");
  if (placeholders.length === 0) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const placeholder = entry.target;
        const dayNumber = parseInt(placeholder.dataset.lazyJournalDay, 10);
        const day = _guideState.days.find((d) => d.day_number === dayNumber);
        if (!day) return;

        observer.unobserve(placeholder);

        const section = placeholder.closest(".guide-day-section");
        if (!section) return;

        section.innerHTML = renderJournalDaySection(day, _guideState, _journalState);
        window.lucide?.createIcons?.();
        wireJournalMode(_guideState, _journalState);
      });
    },
    { rootMargin: "300px 0px" }
  );

  placeholders.forEach((el) => observer.observe(el));
  cleanupFns.push(() => observer.disconnect());
}
