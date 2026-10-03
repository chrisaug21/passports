import { escapeHtml } from "../trip/detail/trip-detail-ui.js";
import { showToast } from "./toast.js";
import { fetchMcpConnections, revokeMcpConnection } from "../../services/mcp-connections-service.js";
import {
  fetchEmailPreferences,
  fetchUserProfile,
  updateEmailPreferences,
  updateMapsAppPreference,
} from "../../services/journal-service.js";
import { EMAIL_PREFERENCE_OPTIONS } from "../../config/constants.js";
import { getMapsAppPreference, getMapsAppPreferenceVersion, setMapsAppPreferenceCache } from "../../lib/preferences.js";
import { sessionStore } from "../../state/session-store.js";

const MAPS_APP_PREFERENCE_OPTIONS = [
  { value: "apple", label: "Apple Maps" },
  { value: "google", label: "Google Maps" },
];

export function openSettingsModal() {
  if (document.querySelector("#settings-modal")) return;

  const modal = document.createElement("div");
  modal.id = "settings-modal";
  modal.className = "modal-shell";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = renderSettingsModalHTML();
  document.body.append(modal);
  document.body.classList.add("modal-open");
  window.lucide?.createIcons?.();

  wireSettingsModal();
  void loadConnections();
  void refreshMapsAppPreference();
  void loadEmailPreferences();
}

function renderSettingsModalHTML() {
  return `
    <div class="modal-backdrop" data-close-settings-modal></div>
    <section class="panel modal-card modal-card--editor" role="dialog" aria-modal="true" aria-label="Settings">
      <div class="modal-card__header">
        <h3>Settings</h3>
        <button class="icon-button" data-close-settings-modal type="button" aria-label="Close settings">×</button>
      </div>
      <div class="item-editor-form__content">
        <section class="settings-modal__section">
          <h4 class="settings-modal__section-title">Maps App</h4>
          <p class="muted settings-modal__section-copy">Which app should open when you tap an address on a trip?</p>
          <div class="settings-toggle" role="group" aria-label="Preferred maps app">
            ${MAPS_APP_PREFERENCE_OPTIONS.map(
              (option) => `
                <button
                  class="settings-toggle__option${getMapsAppPreference() === option.value ? " is-active" : ""}"
                  type="button"
                  data-maps-app-option="${option.value}"
                  aria-pressed="${getMapsAppPreference() === option.value}"
                >${escapeHtml(option.label)}</button>
              `
            ).join("")}
          </div>
        </section>

        <section class="settings-modal__section">
          <h4 class="settings-modal__section-title">Email</h4>
          <p class="muted settings-modal__section-copy">Choose which emails Passports sends you.</p>
          <div id="email-preferences-list" class="settings-email-list">
            <p class="muted">Loading…</p>
          </div>
          <button class="button button--secondary settings-email-turn-off" id="email-turn-all-off" type="button" disabled>Turn all off</button>
        </section>

        <section class="settings-modal__section">
          <h4 class="settings-modal__section-title">Connected Apps</h4>
          <p class="muted settings-modal__section-copy">AI assistants you've connected to your Passports account. They can act as you, using your own permissions — revoke anytime.</p>
          <div id="mcp-connections-list" class="mcp-connections-list">
            <p class="muted">Loading…</p>
          </div>
        </section>
      </div>
    </section>
  `;
}

function wireSettingsModal() {
  const modal = document.querySelector("#settings-modal");
  if (!modal) return;

  const close = () => {
    modal.remove();
    document.body.classList.remove("modal-open");
  };

  modal.querySelectorAll("[data-close-settings-modal]").forEach((el) => {
    el.addEventListener("click", close);
  });

  modal.querySelectorAll("[data-maps-app-option]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextValue = button.getAttribute("data-maps-app-option");
      const previousValue = getMapsAppPreference();
      if (nextValue === previousValue) return;

      const { session } = sessionStore.getState();
      const userId = session?.user?.id;

      setMapsAppToggleUI(nextValue);
      setMapsAppToggleDisabled(true);

      try {
        if (!userId) throw new Error("Not signed in.");
        await updateMapsAppPreference(userId, nextValue);
        setMapsAppPreferenceCache(nextValue);
      } catch (error) {
        console.error(error);
        setMapsAppToggleUI(previousValue);
        showToast("Couldn't save that. Try again.", "error");
      } finally {
        setMapsAppToggleDisabled(false);
      }
    });
  });
}

function setMapsAppToggleUI(value) {
  document.querySelectorAll("[data-maps-app-option]").forEach((button) => {
    const isActive = button.getAttribute("data-maps-app-option") === value;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setMapsAppToggleDisabled(disabled) {
  document.querySelectorAll("[data-maps-app-option]").forEach((button) => {
    button.disabled = disabled;
  });
}

async function refreshMapsAppPreference() {
  const { session } = sessionStore.getState();
  const userId = session?.user?.id;
  if (!userId) return;

  const versionAtStart = getMapsAppPreferenceVersion();

  try {
    const profile = await fetchUserProfile(userId);
    if (getMapsAppPreferenceVersion() !== versionAtStart) return; // a newer read or save already landed
    const preference = profile?.preferred_maps_app === "google" ? "google" : "apple";
    setMapsAppPreferenceCache(preference);
    setMapsAppToggleUI(preference);
  } catch (error) {
    console.error(error);
  }
}

async function loadConnections() {
  const listEl = document.querySelector("#mcp-connections-list");
  if (!listEl) return;

  try {
    const connections = await fetchMcpConnections();
    listEl.innerHTML = renderConnectionsList(connections);
    wireRevokeButtons();
  } catch (error) {
    console.error(error);
    listEl.innerHTML = `<p class="muted">Couldn't load connected apps right now.</p>`;
  }
}

function renderConnectionsList(connections) {
  if (!connections || connections.length === 0) {
    return `<p class="muted">No AI assistants connected yet.</p>`;
  }

  return connections
    .map(
      (connection) => `
        <div class="mcp-connection-row" data-connection-id="${escapeHtml(connection.id)}">
          <div class="mcp-connection-row__details">
            <p class="mcp-connection-row__label">${escapeHtml(connection.label || "Connected app")}</p>
            <p class="muted mcp-connection-row__meta">
              ${connection.status === "needs_reconnect" ? '<span class="mcp-connection-row__status mcp-connection-row__status--warn">Needs reconnecting</span> · ' : ""}
              Connected ${formatDateTime(connection.created_at)} · Last used ${formatDateTime(connection.last_used_at)}
            </p>
          </div>
          <button class="button button--secondary" data-revoke-connection type="button">Revoke</button>
        </div>
      `
    )
    .join("");
}

function wireRevokeButtons() {
  document.querySelectorAll("[data-revoke-connection]").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("[data-connection-id]");
      const connectionId = row?.getAttribute("data-connection-id");
      if (!connectionId) return;

      button.disabled = true;
      button.textContent = "Revoking…";

      try {
        await revokeMcpConnection(connectionId);
        showToast("Connection revoked.", "success");
        void loadConnections();
      } catch (error) {
        console.error(error);
        showToast("Couldn't revoke this connection. Try again.", "error");
        button.disabled = false;
        button.textContent = "Revoke";
      }
    });
  });
}

function formatDateTime(value) {
  if (!value) return "never";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

// ---------------------------------------------------------------------------
// Email preferences
// ---------------------------------------------------------------------------

function renderEmailPreferenceRows(preferences) {
  return EMAIL_PREFERENCE_OPTIONS.map(
    (option) => `
      <div class="settings-email-row">
        <div class="settings-email-row__text">
          <span class="settings-email-row__label">${escapeHtml(option.label)}</span>
          <span class="muted settings-email-row__description">${escapeHtml(option.description)}</span>
        </div>
        <label class="toggle-switch" aria-label="${escapeHtml(option.label)}">
          <input
            type="checkbox"
            class="toggle-switch__input"
            data-email-preference="${escapeHtml(option.column)}"
            ${preferences[option.column] === false ? "" : "checked"}
          />
          <span class="toggle-switch__track" aria-hidden="true"></span>
        </label>
      </div>
    `
  ).join("");
}

function getEmailPreferenceInputs() {
  return [...document.querySelectorAll("[data-email-preference]")];
}

// "Turn all off" has nothing to do once every switch is already off, so it
// disables itself rather than showing a separate "unsubscribed from all" state.
function syncTurnAllOffButton() {
  const button = document.querySelector("#email-turn-all-off");
  if (!button) return;
  const inputs = getEmailPreferenceInputs();
  button.disabled = inputs.length === 0 || inputs.every((input) => !input.checked);
}

function setEmailPreferencesBusy(busy) {
  getEmailPreferenceInputs().forEach((input) => {
    input.disabled = busy;
  });
  const button = document.querySelector("#email-turn-all-off");
  if (button && busy) button.disabled = true;
  if (!busy) syncTurnAllOffButton();
}

async function loadEmailPreferences() {
  const listEl = document.querySelector("#email-preferences-list");
  if (!listEl) return;

  const { session } = sessionStore.getState();
  const userId = session?.user?.id;
  if (!userId) {
    listEl.innerHTML = `<p class="muted">Sign in to manage email settings.</p>`;
    return;
  }

  try {
    const preferences = await fetchEmailPreferences(userId);
    listEl.innerHTML = renderEmailPreferenceRows(preferences);
    wireEmailPreferences(userId);
    syncTurnAllOffButton();
  } catch (error) {
    console.error(error);
    listEl.innerHTML = `<p class="muted">Couldn't load email settings right now.</p>`;
  }
}

function wireEmailPreferences(userId) {
  getEmailPreferenceInputs().forEach((input) => {
    input.addEventListener("change", async () => {
      const column = input.getAttribute("data-email-preference");
      const nextValue = input.checked;

      setEmailPreferencesBusy(true);
      try {
        await updateEmailPreferences(userId, { [column]: nextValue });
      } catch (error) {
        console.error(error);
        input.checked = !nextValue;
        showToast("Couldn't save that. Try again.", "error");
      } finally {
        setEmailPreferencesBusy(false);
      }
    });
  });

  document.querySelector("#email-turn-all-off")?.addEventListener("click", async () => {
    const values = Object.fromEntries(EMAIL_PREFERENCE_OPTIONS.map((option) => [option.column, false]));
    const previouslyChecked = getEmailPreferenceInputs().filter((input) => input.checked);

    setEmailPreferencesBusy(true);
    try {
      await updateEmailPreferences(userId, values);
      getEmailPreferenceInputs().forEach((input) => {
        input.checked = false;
      });
      showToast("All emails turned off.", "success");
    } catch (error) {
      console.error(error);
      previouslyChecked.forEach((input) => {
        input.checked = true;
      });
      showToast("Couldn't save that. Try again.", "error");
    } finally {
      setEmailPreferencesBusy(false);
    }
  });
}
