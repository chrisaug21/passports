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

function normalizePath(pathname) {
  if (pathname === "/login" || pathname === "/app") {
    return pathname;
  }

  return "/";
}

export function startRouter() {
  window.addEventListener("popstate", () => {
    renderRoute();
  });
}

export function navigate(pathname) {
  const target = normalizePath(pathname);

  if (window.location.pathname !== target) {
    window.history.pushState({}, "", target);
  }

  renderRoute();
}

export function renderRoute() {
  const { session } = sessionStore.getState();
  const pathname = normalizePath(window.location.pathname);

  if (!session) {
    if (pathname !== "/login") {
      window.history.replaceState({}, "", "/login");
    }

    renderAppShell(renderLoginPage(), {
      afterRender: () => {
        document.title = "Passports | Sign In";
        wireLoginPage();
      },
    });
    return;
  }

  if (pathname === "/login" || pathname === "/") {
    window.history.replaceState({}, "", "/app");
  }

  renderAppShell(
    renderDashboardPage(),
    {
      afterRender: () => {
        document.title = "Passports";
        wireDashboardPage();
      },
    }
  );

  setDashboardRenderer(() => {
    renderRoute();
  });

  if (window.location.pathname === "/app" && appStore.getState().dashboard.status === "idle") {
    loadDashboard();
  }
}
