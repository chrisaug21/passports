import { navigate } from "../../../app/router.js";
import {
  filterItemsForViewer,
  getLodgingBands,
  renderFullDayContent,
  sortGuideItems,
  getTodayDayNumber,
} from "./guide-view.js";

let cleanupFns = [];

// Programmatic scrolls on desktop can fight touch momentum. Set on touchstart;
// cleared 400ms after touchend to let momentum settle before re-enabling.
let isUserScrolling = false;
let touchEndTimer = null;

export function teardownGuideView() {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  isUserScrolling = false;
  clearTimeout(touchEndTimer);
}

function isMobileLayout() {
  return window.innerWidth <= 840;
}

export function wireGuideView(state) {
  wireBackLink(state.tripId);
  wireDashboardLink();
  wireNavClicks();
  setupTouchScrollTracking();
  setupScrollTracking();
  setupLazyDays(state);

  const todayDayNumber = getTodayDayNumber(state.trip);
  if (todayDayNumber) {
    window.setTimeout(() => scrollOrJumpToDay(todayDayNumber), 100);
  }

  // Desktop: derive initial active state from scroll position.
  // Mobile: scrollOrJumpToDay handles active state; default to day 1 otherwise.
  if (!isMobileLayout()) {
    updateActiveSection();
  } else if (!todayDayNumber) {
    document.querySelector(".guide-nav-item")?.classList.add("is-active");
  }
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
