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
} from "../features/trip/trip-detail-page.js";
import { tripStore } from "../state/trip-store.js";
import { renderGuidePage, loadGuidePage } from "../features/trip/guide/guide-page.js";

function normalizePath(pathname) {
  if (
    pathname === "/login" ||
    pathname === "/app" ||
    /^\/app\/trip\/[0-9a-f-]+$/i.test(pathname) ||
    /^\/app\/trip\/[0-9a-f-]+\/guide$/i.test(pathname)
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

  // Guide route: public access allowed — handle before session check
  const guideMatch = pathname.match(/^\/app\/trip\/([0-9a-f-]+)\/guide$/i);
  if (guideMatch) {
    const tripId = guideMatch[1];

    renderAppShell(renderGuidePage(), {
      showDashboardLink: Boolean(session),
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
    if (pathname !== "/login") {
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
    window.history.replaceState({}, "", "/app");
  }

  if (pathname === "/app") {
    renderAppShell(renderDashboardPage(), {
      showNewTripButton: true,
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

  if (pathname.startsWith("/app/trip/")) {
    const tripId = pathname.split("/").pop();

    renderAppShell(renderTripDetailPage(), {
      showDashboardLink: true,
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
