import { getSession, onAuthStateChange, signOut } from "../services/auth-service.js";
import { initializeEnv } from "../config/env.js";
import { initializeSupabase } from "../lib/supabase.js";
import { renderRoute, startRouter } from "./router.js";
import { sessionStore } from "../state/session-store.js";
import { showToast } from "../features/shared/toast.js";
import { openProfileModal } from "../features/shared/profile-modal.js";
import { appStore } from "../state/app-store.js";
import { tripStore } from "../state/trip-store.js";
import { APP_VERSION } from "../config/constants.js";
import { fetchUserProfile } from "../services/journal-service.js";

const appRoot = document.querySelector("#app");
let accountMenuListenersBound = false;
let profileRequestToken = 0;

function refreshIcons() {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons();
  }
}

export async function bootstrapApp() {
  try {
    appRoot.innerHTML = renderBootstrapLoadingScreen();

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

function renderBootstrapLoadingScreen() {
  return `
    <main class="app-shell app-shell--loading">
      <section class="bootstrap-loader" aria-live="polite" aria-busy="true">
        <div class="bootstrap-loader__brand">
          <span class="bootstrap-loader__wordmark">Passports</span>
          <span class="bootstrap-loader__version">${APP_VERSION}</span>
        </div>
        <p>Loading your trips...</p>
        <div class="bootstrap-loader__skeleton" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </section>
    </main>
  `;
}

export function renderAppShell(content, options = {}) {
  const { showDashboardLink = false, showNewTripButton = false } = options;
  const { session } = sessionStore.getState();
  const userId = session?.user?.id || "";
  const email = session?.user?.email || "";
  const initials = getUserInitials({ email });

  appRoot.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div class="topbar__left">
          <button class="topbar__brand" id="topbar-home" type="button" aria-label="Go to dashboard">
            <span class="topbar__wordmark-wrap">
              <span class="topbar__wordmark">Passports</span>
              <span class="topbar__version">${APP_VERSION}</span>
            </span>
          </button>
          ${
            showDashboardLink
              ? `
                <button class="topbar__dashboard-link" id="trip-back-to-dashboard" type="button">
                  <i data-lucide="home" aria-hidden="true"></i>
                  <span>Dashboard</span>
                </button>
              `
              : ""
          }
        </div>
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
                    <button class="account-menu__profile" id="open-profile-modal" type="button">Profile</button>
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
    void hydrateAccountMenuProfile({ userId, email });

    document.querySelector("#open-profile-modal")?.addEventListener("click", () => {
      document.querySelector("#account-menu").open = false;
      openProfileModal();
    });

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

export function updateAccountMenuProfile(profile = {}) {
  const { session } = sessionStore.getState();
  const email = session?.user?.email || "";
  const avatar = document.querySelector(".account-menu__avatar");
  if (!avatar) return;
  avatar.textContent = getUserInitials({
    email,
    firstName: profile.first_name || "",
    lastName: profile.last_name || "",
  });
}

async function hydrateAccountMenuProfile({ userId, email }) {
  if (!userId) return;
  const token = ++profileRequestToken;

  try {
    const profile = await fetchUserProfile(userId);
    if (token !== profileRequestToken) return;
    updateAccountMenuProfile(profile || { email });
  } catch (_error) {
    if (token !== profileRequestToken) return;
    updateAccountMenuProfile({ email });
  }
}

function getUserInitials({ email, firstName = "", lastName = "" }) {
  if (firstName) {
    return `${firstName.charAt(0)}${lastName ? lastName.charAt(0) : ""}`.toUpperCase();
  }
  return String(email || "").charAt(0).toUpperCase() || "U";
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
