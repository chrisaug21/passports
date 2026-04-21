import { getSession, onAuthStateChange, signOut } from "../services/auth-service.js";
import { initializeEnv } from "../config/env.js";
import { initializeSupabase } from "../lib/supabase.js";
import { renderRoute, startRouter } from "./router.js";
import { sessionStore } from "../state/session-store.js";
import { showToast } from "../features/shared/toast.js";
import { appStore } from "../state/app-store.js";
import { tripStore } from "../state/trip-store.js";
import { APP_VERSION } from "../config/constants.js";

const appRoot = document.querySelector("#app");
let accountMenuListenersBound = false;

function refreshIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

export async function bootstrapApp() {
  try {
    appRoot.innerHTML = `<main class="app-shell"><section class="panel panel--center"><p class="eyebrow">Passports</p><h1>Loading…</h1><p class="muted">Connecting your travel workspace.</p></section></main>`;

    const env = await initializeEnv();
    initializeSupabase(env);

    const session = await getSession();
    sessionStore.setSession(session);

    onAuthStateChange((event, nextSession) => {
      const previousSession = sessionStore.getState().session;
      const previousUserId = previousSession?.user?.id || "";
      const nextUserId = nextSession?.user?.id || "";
      const isSameSignedInUser = previousUserId && previousUserId === nextUserId;
      sessionStore.setSession(nextSession);

      if (
        event === "INITIAL_SESSION" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED" ||
        (event === "SIGNED_IN" && isSameSignedInUser)
      ) {
        return;
      }

      tripStore.setTrips([]);
      tripStore.resetCurrentTrip();
      appStore.resetDashboard();
      appStore.resetTripDetail();
      renderRoute();
    });

    startRouter();
    renderRoute();
  } catch (error) {
    console.error(error);
    appRoot.innerHTML = `
      <main class="app-shell">
        <section class="panel panel--center">
          <p class="eyebrow">Passports</p>
          <h1>Setup issue</h1>
          <p class="muted">The app could not load its public configuration.</p>
          <button class="button" id="retry-bootstrap" type="button">Try Again</button>
        </section>
      </main>
    `;

    document.querySelector("#retry-bootstrap")?.addEventListener("click", () => {
      window.location.reload();
    });
  }
}

export function renderAppShell(content, options = {}) {
  const { showNewTripButton = false } = options;
  const { session } = sessionStore.getState();
  const email = session?.user?.email || "";
  const initials = getUserInitials(email);

  appRoot.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <button class="topbar__brand" id="topbar-home" type="button" aria-label="Go to dashboard">
          <span class="topbar__wordmark-wrap">
            <span class="topbar__wordmark">Passports</span>
            <span class="topbar__version">${APP_VERSION}</span>
          </span>
        </button>
        <div class="topbar__actions">
          ${showNewTripButton && session ? `<button class="button topbar__new-trip" id="open-create-trip-modal" type="button">New Trip</button>` : ""}
          ${
            session
              ? `
                <details class="account-menu" id="account-menu">
                  <summary class="account-menu__trigger" aria-label="Open account menu">
                    <span class="account-menu__avatar">${escapeHtml(initials)}</span>
                  </summary>
                  <div class="account-menu__panel">
                    <p class="account-menu__email">${escapeHtml(email)}</p>
                    <button class="button button--secondary account-menu__signout" id="sign-out-button" type="button">Sign Out</button>
                  </div>
                </details>
              `
              : ""
          }
        </div>
      </header>
      ${content}
    </main>
  `;

  document.querySelector("#topbar-home")?.addEventListener("click", () => {
    window.history.pushState({}, "", "/app");
    renderRoute();
  });

  if (session) {
    bindAccountMenuListeners();
    document.querySelector("#sign-out-button")?.addEventListener("click", async () => {
      const button = document.querySelector("#sign-out-button");

      if (button) {
        button.disabled = true;
        button.textContent = "Signing Out…";
      }

      try {
        await signOut();
        showToast("Signed out.", "success");
      } catch (error) {
        console.error(error);
        showToast("Could not sign you out right now.", "error");

        if (button) {
          button.disabled = false;
          button.textContent = "Sign Out";
        }
      }
    });
  }

  if (options.afterRender) {
    options.afterRender();
  }

  refreshIcons();
}

function getUserInitials(email) {
  const localPart = String(email || "").split("@")[0] || "";
  const segments = localPart.split(/[._-]+/).filter(Boolean);

  if (segments.length >= 2) {
    return `${segments[0][0] || ""}${segments[1][0] || ""}`.toUpperCase();
  }

  return localPart.slice(0, 2).toUpperCase() || "U";
}

function bindAccountMenuListeners() {
  if (accountMenuListenersBound) {
    return;
  }

  document.addEventListener("click", (event) => {
    const menu = document.querySelector("#account-menu");

    if (!menu || !(event.target instanceof Element)) {
      return;
    }

    if (!menu.contains(event.target)) {
      menu.open = false;
    }
  });

  accountMenuListenersBound = true;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
