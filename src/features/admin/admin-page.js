import { escapeHtml } from "../trip/detail/trip-detail-ui.js";
import { showToast } from "../shared/toast.js";
import { navigate } from "../../app/router.js";
import { sessionStore } from "../../state/session-store.js";
import {
  createInviteCode,
  fetchAdminStatus,
  fetchAdminUsers,
  fetchCodeRedemptions,
  fetchInviteCodes,
  fetchSignupSetting,
  removeInviteCode,
  saveSignupSetting,
  setUserAdmin,
  updateInviteCode,
} from "../../services/admin-service.js";

// How long a "tap again to confirm" button stays armed before it resets.
const CONFIRM_WINDOW_MS = 4000;

const TABS = [
  { id: "signups", label: "Sign-ups" },
  { id: "users", label: "Users" },
];

const STATUS_LABELS = { active: "Active", used_up: "Used up", expired: "Expired", off: "Off" };

let activeTab = "signups";
let loadToken = 0;
const usersView = { page: 1, search: "" };

export function renderAdminPage() {
  return `
    <section class="dashboard admin-page">
      <div class="dashboard-header">
        <p class="eyebrow">Admin</p>
        <h1>Passports admin</h1>
      </div>
      <div class="settings-toggle" role="tablist" aria-label="Admin sections">
        ${TABS.map(
          (tab) => `
            <button
              class="settings-toggle__option${tab.id === activeTab ? " is-active" : ""}"
              type="button"
              role="tab"
              aria-selected="${tab.id === activeTab}"
              data-admin-tab="${tab.id}"
            >${tab.label}</button>`
        ).join("")}
      </div>
      <div id="admin-content" aria-live="polite">
        <section class="admin-state"><p class="muted">Loading…</p></section>
      </div>
    </section>
  `;
}

export function wireAdminPage() {
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-admin-tab");
      if (next === activeTab) return;
      activeTab = next;
      document.querySelectorAll("[data-admin-tab]").forEach((tabButton) => {
        const isActive = tabButton.getAttribute("data-admin-tab") === activeTab;
        tabButton.classList.toggle("is-active", isActive);
        tabButton.setAttribute("aria-selected", String(isActive));
      });
      void loadActiveTab();
    });
  });

  const content = document.querySelector("#admin-content");
  content?.addEventListener("click", handleContentClick);
  content?.addEventListener("submit", handleContentSubmit);
  content?.addEventListener("change", handleContentChange);
}

export async function loadAdminPage() {
  // The menu item being hidden is cosmetic; this is the page-level gate (the
  // server re-checks on every request). Non-admins land on the dashboard,
  // the same place any unknown address goes.
  const { isAdmin } = await fetchAdminStatus();
  if (!isAdmin) {
    window.history.replaceState({}, "", "/app");
    navigate("/app");
    return;
  }
  sessionStore.setAdmin(true);
  await loadActiveTab();
}

async function loadActiveTab() {
  const token = ++loadToken;
  const content = document.querySelector("#admin-content");
  if (!content) return;
  content.innerHTML = `<section class="admin-state"><p class="muted">Loading…</p></section>`;

  try {
    const html = activeTab === "users" ? buildUsersTab() : await buildSignupsTab();
    if (token !== loadToken) return;
    content.innerHTML = html;
    window.lucide?.createIcons?.();
    if (activeTab === "users") void refreshUsersResults();
  } catch (error) {
    console.error(error);
    if (token !== loadToken) return;
    content.innerHTML = `
      <section class="admin-state">
        <h3>Could not load this section</h3>
        <p class="muted">${escapeHtml(error.message || "Try refreshing the page.")}</p>
        <button class="button button--secondary" type="button" data-admin-action="reload">Try again</button>
      </section>`;
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function seatsText(code) {
  return `${code.redeemedCount} / ${code.maxUses === null ? "∞" : code.maxUses}`;
}

function inviteLink(code) {
  return `${window.location.origin}/login?invite=${encodeURIComponent(code)}`;
}

// ---------------------------------------------------------------------------
// Sign-ups tab: the policy switch, creating codes, and the codes table
// ---------------------------------------------------------------------------

async function buildSignupsTab() {
  const [setting, codes] = await Promise.all([fetchSignupSetting(), fetchInviteCodes()]);
  return `
    ${renderPolicyPanel(setting.requiresInvite)}
    ${renderCreateCodePanel()}
    <section class="admin-panel" id="admin-codes-panel">${renderCodesTable(codes)}</section>
  `;
}

function policyDescription(requiresInvite) {
  return requiresInvite ? "Sign-ups need an invite code." : "Sign-ups are open to anyone.";
}

function renderPolicyPanel(requiresInvite) {
  return `
    <section class="admin-panel">
      <h3>Sign-up policy</h3>
      <div class="admin-policy">
        <div class="admin-policy__text">
          <span class="admin-policy__label">Require an invite code to sign up</span>
          <span class="muted admin-policy__description" id="admin-policy-description">${policyDescription(requiresInvite)}</span>
        </div>
        <label class="toggle-switch" aria-label="Require an invite code to sign up">
          <input type="checkbox" class="toggle-switch__input" id="admin-policy-toggle" ${requiresInvite ? "checked" : ""} />
          <span class="toggle-switch__track" aria-hidden="true"></span>
        </label>
      </div>
    </section>
  `;
}

function renderCreateCodePanel() {
  return `
    <section class="admin-panel">
      <h3>Create an invite code</h3>
      <form class="admin-form" id="admin-create-code-form">
        <label class="field">
          <span>Code</span>
          <input name="code" type="text" maxlength="32" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Auto-generate" />
        </label>
        <label class="field">
          <span>Note</span>
          <input name="label" type="text" maxlength="80" autocomplete="off" placeholder="Who or what it's for" />
        </label>
        <label class="field">
          <span>Seats</span>
          <input name="maxUses" type="number" min="1" step="1" inputmode="numeric" placeholder="Blank = unlimited" />
        </label>
        <label class="field">
          <span>Expires</span>
          <input name="expiresOn" type="date" />
        </label>
        <p class="field-hint admin-form__hint">Seats and an expiry are the real limit on a code that's easy to guess, so it's worth setting both.</p>
        <button class="button" type="submit">Create code</button>
      </form>
    </section>
  `;
}

function renderCodesTable(codes) {
  if (!codes.length) {
    return `
      <h3>Invite codes</h3>
      <p class="muted">No invite codes yet. Create one above.</p>
    `;
  }

  return `
    <h3>Invite codes</h3>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Note</th>
            <th scope="col">Redeemed</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>${codes.map(renderCodeRow).join("")}</tbody>
      </table>
    </div>
  `;
}

function renderCodeRow(code) {
  const expiry = code.expiresAt ? `<span class="muted admin-table__sub">Expires ${escapeHtml(formatDate(code.expiresAt))}</span>` : "";
  return `
    <tr data-code-id="${escapeHtml(code.id)}">
      <td><code class="admin-code">${escapeHtml(code.code)}</code></td>
      <td>${escapeHtml(code.label || "—")}</td>
      <td>${escapeHtml(seatsText(code))}</td>
      <td><span class="admin-badge admin-badge--${escapeHtml(code.status)}">${escapeHtml(STATUS_LABELS[code.status] || code.status)}</span>${expiry}</td>
      <td>${escapeHtml(formatDate(code.createdAt))}</td>
      <td>
        <div class="admin-actions">
          <button class="button button--secondary button--sm" type="button" data-admin-action="copy-link" data-code="${escapeHtml(code.code)}">Copy link</button>
          <button class="button button--secondary button--sm" type="button" data-admin-action="toggle-redemptions" data-id="${escapeHtml(code.id)}">Who joined</button>
          <button class="button button--secondary button--sm" type="button" data-admin-action="toggle-active" data-id="${escapeHtml(code.id)}" data-active="${code.active}">${code.active ? "Turn off" : "Turn on"}</button>
          <button class="button button--danger-secondary button--sm" type="button" data-admin-action="remove-code" data-id="${escapeHtml(code.id)}" data-confirm="Confirm remove?">Remove</button>
        </div>
      </td>
    </tr>
    <tr class="admin-table__detail" data-detail-for="${escapeHtml(code.id)}" hidden>
      <td colspan="6"><div class="admin-detail" data-detail-body>Loading…</div></td>
    </tr>
  `;
}

async function reloadCodesPanel() {
  const panel = document.querySelector("#admin-codes-panel");
  if (!panel) return;
  panel.innerHTML = renderCodesTable(await fetchInviteCodes());
}

async function toggleRedemptions(id) {
  const detailRow = document.querySelector(`[data-detail-for="${CSS.escape(id)}"]`);
  if (!detailRow) return;

  if (!detailRow.hidden) {
    detailRow.hidden = true;
    return;
  }

  detailRow.hidden = false;
  const body = detailRow.querySelector("[data-detail-body]");
  body.textContent = "Loading…";
  try {
    const redemptions = await fetchCodeRedemptions(id);
    body.innerHTML = redemptions.length
      ? `<ul class="admin-detail__list">${redemptions
          .map((row) => `<li><span>${escapeHtml(row.email)}</span><span class="muted">${escapeHtml(formatDate(row.redeemedAt))}</span></li>`)
          .join("")}</ul>`
      : `<span class="muted">Nobody has used this code yet.</span>`;
  } catch (error) {
    console.error(error);
    body.textContent = "Couldn't load who joined. Try again.";
  }
}

async function submitCreateCode(form) {
  const data = new FormData(form);
  const seats = String(data.get("maxUses") || "").trim();
  const expiresOn = String(data.get("expiresOn") || "").trim();

  const fields = {
    code: String(data.get("code") || "").trim(),
    label: String(data.get("label") || "").trim(),
    maxUses: seats ? Number(seats) : null,
    // The code works through the end of the chosen day, in the admin's own time.
    expiresAt: expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : null,
  };

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const created = await createInviteCode(fields);
    showToast(`Code ${created.code} created.`, "success");
    form.reset();
    await reloadCodesPanel();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function changePolicy(toggle) {
  const requiresInvite = toggle.checked;
  toggle.disabled = true;
  try {
    const saved = await saveSignupSetting(requiresInvite);
    toggle.checked = saved.requiresInvite;
    const description = document.querySelector("#admin-policy-description");
    if (description) description.textContent = policyDescription(saved.requiresInvite);
    showToast(
      saved.requiresInvite
        ? "New sign-ups will need a code. Existing accounts aren't affected."
        : "Sign-ups are open to anyone again.",
      "success"
    );
  } catch (error) {
    toggle.checked = !requiresInvite;
    showToast(error.message, "error");
  } finally {
    toggle.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Users tab: read-only list, plus making people admins (and removing them)
// ---------------------------------------------------------------------------

function buildUsersTab() {
  return `
    <section class="admin-panel">
      <form class="admin-search" id="admin-user-search-form" role="search">
        <label class="field admin-search__field">
          <span class="sr-only">Search by email</span>
          <input type="search" name="search" value="${escapeHtml(usersView.search)}" placeholder="Search by email" autocomplete="off" />
        </label>
        <button class="button button--secondary" type="submit">Search</button>
      </form>
      <div id="admin-users-results" class="admin-results"><p class="muted">Loading…</p></div>
    </section>
  `;
}

// Reloads just the list (not the search box), so searching and paging don't
// blank the screen or take focus away from the search field.
let usersRequestToken = 0;
async function refreshUsersResults() {
  const results = document.querySelector("#admin-users-results");
  if (!results) return;

  const token = ++usersRequestToken;
  results.classList.add("is-refreshing");
  try {
    const data = await fetchAdminUsers(usersView);
    if (token !== usersRequestToken || !results.isConnected) return;
    results.innerHTML = renderUsersTable(data);
  } catch (error) {
    console.error(error);
    if (token !== usersRequestToken || !results.isConnected) return;
    results.innerHTML = `
      <p class="muted">${escapeHtml(error.message || "Couldn't load users.")}</p>
      <button class="button button--secondary button--sm" type="button" data-admin-action="users-refresh">Try again</button>`;
  } finally {
    if (token === usersRequestToken) results.classList.remove("is-refreshing");
  }
}

function renderUsersTable(data) {
  if (!data.users.length) {
    return `<p class="muted">${usersView.search ? "No one matches that email." : "No users yet."}</p>`;
  }

  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
  return `
    <p class="muted admin-count">${data.total} ${data.total === 1 ? "person" : "people"}</p>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th scope="col">Person</th>
            <th scope="col">Joined</th>
            <th scope="col">Last signed in</th>
            <th scope="col">Trips</th>
            <th scope="col">Joined via</th>
            <th scope="col">Admin</th>
          </tr>
        </thead>
        <tbody>${data.users.map(renderUserRow).join("")}</tbody>
      </table>
    </div>
    <div class="admin-pager">
      <button class="button button--secondary button--sm" type="button" data-admin-action="users-page" data-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Previous</button>
      <span class="muted">Page ${data.page} of ${lastPage}</span>
      <button class="button button--secondary button--sm" type="button" data-admin-action="users-page" data-page="${data.page + 1}" ${data.page >= lastPage ? "disabled" : ""}>Next</button>
    </div>
  `;
}

function renderAdminCell(user) {
  if (user.isOwner) {
    return `<span class="admin-badge admin-badge--owner">Owner</span>`;
  }
  if (user.isAdmin) {
    return `
      <div class="admin-actions">
        <span class="admin-badge admin-badge--admin">Admin</span>
        <button class="button button--danger-secondary button--sm" type="button" data-admin-action="set-admin" data-user-id="${escapeHtml(user.id)}" data-make-admin="false" data-confirm="Confirm remove?">Remove admin</button>
      </div>`;
  }
  return `<button class="button button--secondary button--sm" type="button" data-admin-action="set-admin" data-user-id="${escapeHtml(user.id)}" data-make-admin="true" data-confirm="Confirm admin?">Make admin</button>`;
}

function renderUserRow(user) {
  return `
    <tr>
      <td>
        <span class="admin-person__name">${escapeHtml(user.name || user.email)}</span>
        ${user.name ? `<span class="muted admin-table__sub">${escapeHtml(user.email)}</span>` : ""}
      </td>
      <td>${escapeHtml(formatDate(user.joinedAt))}</td>
      <td>${escapeHtml(formatDate(user.lastSignInAt))}</td>
      <td>${user.tripCount}</td>
      <td>${escapeHtml(user.joinedVia || "—")}</td>
      <td>${renderAdminCell(user)}</td>
    </tr>
  `;
}

async function changeUserAdmin(button) {
  const makeAdmin = button.dataset.makeAdmin === "true";
  button.disabled = true;
  try {
    await setUserAdmin(button.dataset.userId, makeAdmin);
    showToast(makeAdmin ? "They're an admin now." : "Admin access removed.", "success");
    await refreshUsersResults();
  } catch (error) {
    showToast(error.message, "error");
    button.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// One set of listeners on the content area, so re-rendering a tab never
// leaves stale handlers behind.
// ---------------------------------------------------------------------------

// Destructive buttons carry data-confirm: the first tap arms them (the label
// changes), the second tap within a few seconds does the thing.
function armConfirm(button) {
  const original = button.textContent;
  const { width, height } = button.getBoundingClientRect();

  // Hold the button at exactly its current size and let the longer label wrap
  // inside it, so arming a button never nudges the rest of the row.
  button.style.width = `${width}px`;
  button.style.height = `${height}px`;
  button.classList.add("is-confirming");
  button.dataset.armed = "1";
  button.textContent = button.dataset.confirm;

  window.setTimeout(() => {
    if (!button.isConnected) return;
    button.dataset.armed = "";
    button.textContent = original;
    button.classList.remove("is-confirming");
    button.style.width = "";
    button.style.height = "";
  }, CONFIRM_WINDOW_MS);
}

async function handleContentClick(event) {
  const button = event.target instanceof Element ? event.target.closest("[data-admin-action]") : null;
  if (!button || button.disabled) return;

  if (button.dataset.confirm && button.dataset.armed !== "1") {
    armConfirm(button);
    return;
  }

  const id = button.dataset.id;

  switch (button.dataset.adminAction) {
    case "reload":
      await loadActiveTab();
      break;
    case "copy-link":
      try {
        await navigator.clipboard.writeText(inviteLink(button.dataset.code));
        showToast("Invite link copied.", "success");
      } catch {
        showToast("Couldn't copy. Select the code and copy it by hand.", "error");
      }
      break;
    case "toggle-redemptions":
      await toggleRedemptions(id);
      break;
    case "toggle-active":
      try {
        await updateInviteCode(id, { active: button.dataset.active !== "true" });
        await reloadCodesPanel();
      } catch (error) {
        showToast(error.message, "error");
      }
      break;
    case "remove-code":
      try {
        await removeInviteCode(id);
        showToast("Code removed.", "success");
        await reloadCodesPanel();
      } catch (error) {
        showToast(error.message, "error");
      }
      break;
    case "set-admin":
      await changeUserAdmin(button);
      break;
    case "users-page":
      usersView.page = Math.max(1, Number(button.dataset.page) || 1);
      await refreshUsersResults();
      break;
    case "users-refresh":
      await refreshUsersResults();
      break;
    default:
      break;
  }
}

async function handleContentSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.id === "admin-create-code-form") {
    event.preventDefault();
    await submitCreateCode(form);
  } else if (form.id === "admin-user-search-form") {
    event.preventDefault();
    usersView.search = String(new FormData(form).get("search") || "").trim();
    usersView.page = 1;
    await refreshUsersResults();
  }
}

function handleContentChange(event) {
  if (event.target instanceof HTMLInputElement && event.target.id === "admin-policy-toggle") {
    void changePolicy(event.target);
  }
}
