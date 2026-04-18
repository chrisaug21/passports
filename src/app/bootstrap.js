import { getSession, onAuthStateChange, signOut } from "../services/auth-service.js";
import { initializeEnv } from "../config/env.js";
import { initializeSupabase } from "../lib/supabase.js";
import { renderRoute, startRouter } from "./router.js";
import { sessionStore } from "../state/session-store.js";
import { showToast } from "../features/shared/toast.js";
import { appStore } from "../state/app-store.js";
import { tripStore } from "../state/trip-store.js";

const appRoot = document.querySelector("#app");

export async function bootstrapApp() {
  try {
    appRoot.innerHTML = `<main class="app-shell"><section class="panel panel--center"><p class="eyebrow">Passports</p><h1>Loading…</h1><p class="muted">Connecting your travel workspace.</p></section></main>`;

    const env = await initializeEnv();
    initializeSupabase(env);

    const session = await getSession();
    sessionStore.setSession(session);

    onAuthStateChange((nextSession) => {
      sessionStore.setSession(nextSession);
      tripStore.setTrips([]);
      appStore.resetDashboard();
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
  const { session } = sessionStore.getState();
  const heading = session?.user?.email ? `Signed in as ${session.user.email}` : "Personal travel planner";

  appRoot.innerHTML = `
    <main class="app-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Passports</p>
          <h1 class="topbar__title">${heading}</h1>
        </div>
        ${
          session
            ? '<button class="button button--secondary" id="sign-out-button" type="button">Sign Out</button>'
            : ""
        }
      </header>
      ${content}
    </main>
  `;

  if (session) {
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
}
