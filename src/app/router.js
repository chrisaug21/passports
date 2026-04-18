import { renderAppShell } from "./bootstrap.js";
import { renderLoginPage, wireLoginPage } from "../features/auth/login-page.js";
import { sessionStore } from "../state/session-store.js";

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
    `
      <section class="panel hero-panel">
        <p class="eyebrow">Checkpoint 1</p>
        <h2>Your account is ready.</h2>
        <p class="muted">Supabase auth is connected. The next checkpoint will replace this screen with the first dashboard view.</p>
      </section>
    `,
    {
      afterRender: () => {
        document.title = "Passports";
      },
    }
  );
}
