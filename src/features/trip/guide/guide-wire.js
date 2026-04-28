import { navigate } from "../../../app/router.js";
import {
  filterItemsForViewer,
  getLodgingBands,
  renderFullDayContent,
  sortGuideItems,
  getTodayDayNumber,
} from "./guide-view.js";
import { getTripStatTiles } from "../detail/trip-detail-ui.js";
import {
  renderJournalContent,
  renderJournalDayNav,
  renderJournalDaySection,
} from "./journal-view.js";
import { wireJournalMode, teardownJournalMode } from "./journal-wire.js";
import { fetchJournalData } from "../../../services/journal-service.js";

const GUIDE_ACTIVE_MODE_KEY = "guide-active-mode";

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
  entries: [],
  photos: [],
  profiles: [],
};

export function teardownGuideView() {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  isUserScrolling = false;
  clearTimeout(touchEndTimer);
  teardownJournalMode();
  _guideState = null;
  _currentMode = "itinerary";
  _todayDayNumber = null;
  _journalState = { hasFetched: false, isFetching: false, entries: [], photos: [], profiles: [] };
}

function isMobileLayout() {
  return window.innerWidth <= 840;
}

export function wireGuideView(state) {
  _guideState = state;
  _todayDayNumber = getTodayDayNumber(state.trip);
  _currentMode = getStoredActiveMode();

  wireBackLink(state.tripId);
  wireDashboardLink();
  wireTabSwitching();
  wireNavClicks();
  setupTouchScrollTracking();
  setupScrollTracking();
  setupLazyDays(state);

  if (_todayDayNumber) {
    window.setTimeout(() => scrollOrJumpToDay(_todayDayNumber), 100);
  }

  // Desktop: derive initial active state from scroll position.
  // Mobile: scrollOrJumpToDay handles active state; default to day 1 otherwise.
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

function wireNavClicks() {
  document.querySelectorAll("[data-guide-nav-day]").forEach((button) => {
    button.addEventListener("click", () => {
      const dayNumber = parseInt(button.dataset.guideNavDay, 10);
      scrollOrJumpToDay(dayNumber);
    });
  });
}

// Desktop: smooth-scroll to offset position; scroll-spy updates active state.
// Mobile: set active pill immediately then scrollIntoView — no scroll-spy.
function scrollOrJumpToDay(dayNumber) {
  if (isMobileLayout()) {
    document.querySelectorAll(".guide-nav-item").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.dayNumber === String(dayNumber));
    });
    document.getElementById(`guide-day-${dayNumber}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  } else {
    scrollToDay(dayNumber);
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

function scrollToDay(dayNumber) {
  if (isUserScrolling) return;
  const section = document.getElementById(`guide-day-${dayNumber}`);
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
  const sections = [...document.querySelectorAll(".guide-day-section[data-day-number]")];
  if (sections.length === 0) return;

  let activeDayNumber = sections[0].dataset.dayNumber;

  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= OFFSET) {
      activeDayNumber = section.dataset.dayNumber;
    }
  }

  document.querySelectorAll(".guide-nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.dayNumber === activeDayNumber);
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
      const memberUserIds = _guideState.members.map((m) => m.user_id);
      const data = await fetchJournalData(_guideState.tripId, memberUserIds);
      _journalState.entries = data.entries;
      _journalState.photos = data.photos;
      _journalState.profiles = data.profiles;
      _journalState.hasFetched = true;
    } catch (error) {
      console.error("Failed to load journal data:", error);
      _journalState.isFetching = false;
      setActiveTab("itinerary");
      return;
    }

    _journalState.isFetching = false;
  }

  _currentMode = "journal";
  persistActiveMode("journal");
  renderJournalModeContent();
}

function switchToItinerary() {
  if (!_guideState) return;

  teardownJournalMode();
  setActiveTab("itinerary");
  _currentMode = "itinerary";
  persistActiveMode("itinerary");
  renderItineraryModeContent();
}

function getStoredActiveMode() {
  try {
    const value = window.sessionStorage.getItem(GUIDE_ACTIVE_MODE_KEY);
    return value === "journal" ? "journal" : "itinerary";
  } catch (_error) {
    return "itinerary";
  }
}

function persistActiveMode(mode) {
  try {
    window.sessionStorage.setItem(GUIDE_ACTIVE_MODE_KEY, mode);
  } catch (_error) {
    // Ignore sessionStorage failures.
  }
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

  // Replace only the nav items, not the <nav> element itself
  nav.innerHTML = renderJournalDayNav(_guideState.days, _guideState.trip, _todayDayNumber);
  content.innerHTML = renderJournalContent(_guideState, _journalState);

  window.lucide?.createIcons?.();
  wireNavClicks();
  setupLazyJournalDays();
  wireJournalMode(_guideState, _journalState);
  restoreDayNavSelection();
}

function renderItineraryModeContent() {
  const nav = document.querySelector(".guide-day-nav");
  const content = document.querySelector(".guide-content");
  if (!nav || !content || !_guideState) return;

  const { trip, bases, days, items, viewerRole } = _guideState;

  // Build nav items only (not the <nav> wrapper — we set innerHTML of the existing nav)
  nav.innerHTML = renderJournalDayNav(days, trip, _todayDayNumber);

  const visibleItems = filterItemsForViewer(items, viewerRole);
  const isMember = viewerRole !== "public";
  const statItems = isMember ? items : visibleItems;
  const statTiles = getTripStatTiles(trip, bases, statItems);
  const lodgingBands = getLodgingBands(visibleItems, bases, days, trip.start_date);
  const lodgingBandItemIds = new Set(lodgingBands.map((b) => b.lodging.id));

  const daySections = days
    .map((day, index) => {
      const dayItems = visibleItems.filter((i) => i.day_id === day.id && !lodgingBandItemIds.has(i.id));
      const sorted = sortGuideItems(dayItems);
      const dayBands = lodgingBands.filter(
        (b) => b.checkInDayNumber === day.day_number || b.checkOutDayNumber === day.day_number
      );
      if (index === 0) {
        return `<section class="guide-day-section" id="guide-day-${day.day_number}" data-day-number="${day.day_number}" aria-label="Day ${day.day_number}">
          ${renderFullDayContent(day, sorted, viewerRole, dayBands, bases, trip.start_date)}
        </section>`;
      }
      return `<section class="guide-day-section" id="guide-day-${day.day_number}" data-day-number="${day.day_number}" aria-label="Day ${day.day_number}">
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
    ${daySections}
  `;

  window.lucide?.createIcons?.();
  wireNavClicks();
  setupLazyDays(_guideState);

  if (_todayDayNumber) scrollOrJumpToDay(_todayDayNumber);
  else if (!isMobileLayout()) updateActiveSection();
  else document.querySelector(".guide-nav-item")?.classList.add("is-active");
}

function restoreDayNavSelection() {
  if (!document.querySelector(".guide-nav-item")) return;

  if (!isMobileLayout()) {
    updateActiveSection();
    return;
  }

  if (_todayDayNumber) {
    document.querySelectorAll(".guide-nav-item").forEach((item) => {
      item.classList.toggle("is-active", item.dataset.dayNumber === String(_todayDayNumber));
    });
    return;
  }

  document.querySelector(".guide-nav-item")?.classList.add("is-active");
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
