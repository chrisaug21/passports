import { escapeHtml } from "../trip/detail/trip-detail-ui.js";
import { showToast } from "./toast.js";
import { fetchMcpConnections, revokeMcpConnection } from "../../services/mcp-connections-service.js";
import { getMapsAppPreference, setMapsAppPreference } from "../../lib/preferences.js";

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
          <p class="muted settings-modal__section-copy">Which app should open when you tap an address on a trip.</p>
          <select id="maps-app-preference-select" aria-label="Preferred maps app">
            ${MAPS_APP_PREFERENCE_OPTIONS.map(
              (option) => `<option value="${option.value}" ${getMapsAppPreference() === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`
            ).join("")}
          </select>
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

  modal.querySelector("#maps-app-preference-select")?.addEventListener("change", (event) => {
    setMapsAppPreference(event.target.value);
  });
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
