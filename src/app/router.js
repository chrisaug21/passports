import { renderAppShell } from "./bootstrap.js";
import { renderLoginPage, wireLoginPage } from "../features/auth/login-page.js";
import { sessionStore } from "../state/session-store.js";
import {
  loadDashboard,
  renderDashboardPage,
  setDashboardRenderer,
  wireDashboardPage,
} from "../features/dashboard/dashboard-page.js";
import { appStore } from "../state/app-store.js";
import {
  loadTripDetail,
  renderTripDetailPage,
  setTripDetailRenderer,
  wireTripDetailPage,
  teardownTripDetailFocusRefresh,
} from "../features/trip/trip-detail-page.js";
import { tripStore } from "../state/trip-store.js";
import { renderGuidePage, loadGuidePage } from "../features/trip/guide/guide-page.js";
import { renderNotesPage, loadNotesPage } from "../features/trip/notes/notes-page.js";
import { renderPrepPage, loadPrepPage } from "../features/trip/prep/prep-page.js";
import { renderMcpConnectPage, wireMcpConnectPage } from "../features/shared/mcp-connect-page.js";
import { renderArchivePage, wireArchivePage, loadArchivePage } from "../features/archive/archive-page.js";
import {
  loadDestinationsPage,
  renderDestinationsPage,
  wireDestinationsPage,
} from "../features/destinations/destinations-page.js";
import { loadMapPage, renderMapPage, wireMapPage } from "../features/map/map-page.js";
import { loadAdminPage, renderAdminPage, wireAdminPage } from "../features/admin/admin-page.js";
import { INVITE_PREFILL_KEY } from "../config/constants.js";

// Where a signed-out person was headed (an email link, the connect page), so
// signing in drops them there instead of on the dashboard. localStorage rather
// than sessionStorage so it survives signing up and confirming the email in a
// different tab; the short expiry keeps a stale destination from hijacking a
// sign-in much later.
const LOGIN_RETURN_KEY = "login-return";
const LOGIN_RETURN_MAX_AGE_MS = 30 * 60 * 1000;

// Only in-app pages are ever accepted as a destination (never another site).
function isSafeReturnPath(path) {
  return typeof path === "string" && /^\/app\/[^\s]*$/.test(path) && !path.startsWith("//");
}

export function rememberReturnPath(path) {
  if (!isSafeReturnPath(path)) return;
  try {
    localStorage.setItem(LOGIN_RETURN_KEY, JSON.stringify({ path, savedAt: Date.now() }));
  } catch {
    // Storage unavailable (private window, blocked): sign-in just lands on the dashboard.
  }
}

function takeReturnPath() {
  try {
    const stored = JSON.parse(localStorage.getItem(LOGIN_RETURN_KEY) || "null");
    localStorage.removeItem(LOGIN_RETURN_KEY);
    if (stored && Date.now() - stored.savedAt <= LOGIN_RETURN_MAX_AGE_MS && isSafeReturnPath(stored.path)) {
      return stored.path;
    }
  } catch {
    // Unreadable or unavailable: nothing to restore.
  }
  return null;
}

function normalizePath(pathname) {
  if (
    pathname === "/login" ||
    pathname === "/app" ||
    pathname === "/app/connect" ||
    pathname === "/app/archive" ||
    pathname === "/app/destinations" ||
    pathname === "/app/map" ||
    pathname === "/app/admin" ||
    /^\/app\/trip\/[0-9a-f-]+$/i.test(pathname) ||
    /^\/app\/trip\/[0-9a-f-]+\/guide$/i.test(pathname) ||
    /^\/app\/trip\/[0-9a-f-]+\/notes$/i.test(pathname) ||
    /^\/app\/trip\/[0-9a-f-]+\/prep$/i.test(pathname)
  ) {
    return pathname;
  }

  return "/";
}

function normalizeNavigationTarget(target) {
  const url = new URL(String(target || "/"), window.location.origin);
  const pathname = normalizePath(url.pathname);

  if (pathname === "/") {
    return "/";
  }

  return `${pathname}${url.search}${url.hash}`;
}

export function startRouter() {
  window.addEventListener("popstate", () => {
    renderRoute();
  });
}

export function navigate(pathname) {
  const target = normalizeNavigationTarget(pathname);
  const currentTarget = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (currentTarget !== target) {
    window.history.pushState({}, "", target);
  }

  renderRoute();
}

export function renderRoute(options = {}) {
  const { preserveScroll = false } = options;
  const previousScrollY = preserveScroll ? window.scrollY : 0;
  const { session } = sessionStore.getState();
  const pathname = normalizePath(window.location.pathname);
  document.body.classList.remove("modal-open");
  // Always torn down here and re-added inside the trip-detail branch below —
  // guarantees no stale focus/visibility listener survives a navigation away
  // from Plan view (to Guide, the dashboard, or another trip).
  teardownTripDetailFocusRefresh();

  // Guide route: public access allowed — handle before session check
  const guideMatch = pathname.match(/^\/app\/trip\/([0-9a-f-]+)\/guide$/i);
  if (guideMatch) {
    const tripId = guideMatch[1];

    renderAppShell(renderGuidePage(), {
      afterRender: () => {
        document.title = "Passports | Guide";
        loadGuidePage(tripId);
        if (preserveScroll) {
          window.scrollTo({ top: previousScrollY });
        }
      },
    });
    return;
  }

  if (!session) {
    if (pathname !== "/login" && pathname !== "/" && pathname !== "/app") {
      rememberReturnPath(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    }

    // A campaign link (/login?invite=VIP) is about to lose its query string
    // below, so hold the code for the sign-up form to prefill.
    const inviteParam = new URLSearchParams(window.location.search).get("invite");
    if (inviteParam) {
      try {
        sessionStorage.setItem(INVITE_PREFILL_KEY, inviteParam.trim().slice(0, 64));
      } catch {
        // Storage unavailable: the code just isn't prefilled.
      }
    }

    if (pathname !== "/login" || window.location.search) {
      window.history.replaceState({}, "", "/login");
    }

    renderAppShell(renderLoginPage(), {
      afterRender: () => {
        document.title = "Passports | Sign In";
        wireLoginPage();
        if (preserveScroll) {
          window.scrollTo({ top: previousScrollY });
        }
      },
    });
    return;
  }

  if (pathname === "/login" || pathname === "/") {
    const pendingReturn = takeReturnPath();
    if (pendingReturn) {
      window.history.replaceState({}, "", pendingReturn);
      renderRoute(options);
      return;
    }
  }

  if (pathname === "/app/connect") {
    renderAppShell(renderMcpConnectPage(), {
      afterRender: () => {
        document.title = "Passports | Connect AI Assistant";
        wireMcpConnectPage();
        if (preserveScroll) {
          window.scrollTo({ top: previousScrollY });
        }
      },
    });
    return;
  }

  if (pathname === "/app/admin") {
    renderAppShell(renderAdminPage(), {
      afterRender: () => {
        document.title = "Passports | Admin";
        wireAdminPage();
        loadAdminPage();
        if (preserveScroll) {
          window.scrollTo({ top: previousScrollY });
        }
      },
    });
    return;
  }

  if (pathname === "/login" || pathname === "/") {
    window.history.replaceState({}, "", "/app");
  }

  if (pathname === "/app") {
    renderAppShell(renderDashboardPage(), {
      showNewTripButton: true,
      activeNav: "trips",
      afterRender: () => {
        document.title = "Passports";
        wireDashboardPage();
        if (preserveScroll) {
          window.scrollTo({ top: previousScrollY });
        }
      },
    });

    setDashboardRenderer(() => {
      renderRoute({ preserveScroll: true });
    });

    if (appStore.getState().dashboard.status === "idle") {
      loadDashboard();
    }

    return;
  }

  if (pathname === "/app/archive") {
    renderAppShell(renderArchivePage(), {
      activeNav: "archive",
      afterRender: () => {
        document.title = "Passports | Archive";
        wireArchivePage();
        loadArchivePage();
        if (preserveScroll) {
          window.scrollTo({ top: previousScrollY });
        }
      },
    });
    return;
  }

  if (pathname === "/app/destinations") {
    renderAppShell(renderDestinationsPage(), {
      activeNav: "destinations",
      afterRender: () => {
        document.title = "Passports | Destinations";
        wireDestinationsPage();
        loadDestinationsPage();
        if (preserveScroll) {
          window.scrollTo({ top: previousScrollY });
        }
      },
    });
    return;
  }

  if (pathname === "/app/map") {
    renderAppShell(renderMapPage(), {
      activeNav: "map",
      afterRender: () => {
        document.title = "Passports | Map";
        wireMapPage();
        loadMapPage();
        if (preserveScroll) {
          window.scrollTo({ top: previousScrollY });
        }
      },
    });
    return;
  }

  const notesMatch = pathname.match(/^\/app\/trip\/([0-9a-f-]+)\/notes$/i);
  if (notesMatch) {
    const tripId = notesMatch[1];

    renderAppShell(renderNotesPage(), {
      afterRender: () => {
        document.title = "Passports | Notes & References";
        loadNotesPage(tripId);
        if (preserveScroll) {
          window.scrollTo({ top: previousScrollY });
        }
      },
    });
    return;
  }

  const prepMatch = pathname.match(/^\/app\/trip\/([0-9a-f-]+)\/prep$/i);
  if (prepMatch) {
    const tripId = prepMatch[1];

    renderAppShell(renderPrepPage(), {
      afterRender: () => {
        document.title = "Passports | Prep Checklist";
        loadPrepPage(tripId);
        if (preserveScroll) {
          window.scrollTo({ top: previousScrollY });
        }
      },
    });
    return;
  }

  if (pathname.startsWith("/app/trip/")) {
    const tripId = pathname.split("/").pop();

    renderAppShell(renderTripDetailPage(), {
      afterRender: () => {
        document.title = "Passports | Trip";
        wireTripDetailPage(tripId);
        if (preserveScroll) {
          window.scrollTo({ top: previousScrollY });
        }
      },
    });

    setTripDetailRenderer(() => {
      renderRoute({ preserveScroll: true });
    });

    const currentTrip = tripStore.getCurrentTrip();
    if (appStore.getState().tripDetail.status === "idle" || currentTrip?.id !== tripId) {
      loadTripDetail(tripId);
    }

    return;
  }

  window.history.replaceState({}, "", "/app");
  renderRoute();
}
