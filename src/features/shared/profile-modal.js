import { sessionStore } from "../../state/session-store.js";
import { fetchUserProfile, upsertUserProfile } from "../../services/journal-service.js";
import { escapeHtml } from "../trip/detail/trip-detail-ui.js";
import { showToast } from "./toast.js";
import { updateAccountMenuProfile } from "../../app/bootstrap.js";

// ---------------------------------------------------------------------------
// Profile modal — render, open, wire, close
// ---------------------------------------------------------------------------

let _onProfileSaved = null;

export function openProfileModal({ onSaved } = {}) {
  if (document.querySelector("#profile-modal")) return;

  _onProfileSaved = onSaved || null;

  const { session } = sessionStore.getState();
  const userId = session?.user?.id;
  const email = session?.user?.email || "";

  if (!userId) return;

  const modal = document.createElement("div");
  modal.id = "profile-modal";
  modal.className = "modal-shell";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = renderProfileModalHTML({ firstName: "", lastName: "", email, isSaving: false });
  document.body.append(modal);
  document.body.classList.add("modal-open");
  window.lucide?.createIcons?.();

  // Pre-fill with existing profile data
  fetchUserProfile(userId).then((profile) => {
    const form = document.querySelector("#profile-modal-form");
    if (!form) return;
    const fn = form.querySelector('[name="firstName"]');
    const ln = form.querySelector('[name="lastName"]');
    if (fn) fn.value = profile?.first_name || "";
    if (ln) ln.value = profile?.last_name || "";
  }).catch(() => {});

  wireProfileModal(userId);
}

function renderProfileModalHTML({ firstName, lastName, email, isSaving }) {
  return `
    <div class="modal-backdrop" data-close-profile-modal></div>
    <section class="panel modal-card modal-card--editor" role="dialog" aria-modal="true" aria-label="Your Profile">
      <div class="modal-card__header">
        <h3>Your Profile</h3>
        <button class="icon-button" data-close-profile-modal type="button" aria-label="Close profile">×</button>
      </div>
      <form id="profile-modal-form" class="profile-modal-form">
        <div class="item-editor-form__content">
          <label class="field">
            <span>First name</span>
            <input name="firstName" type="text" maxlength="80" value="${escapeHtml(firstName)}" placeholder="First name" autocomplete="given-name" />
          </label>
          <label class="field">
            <span>Last name</span>
            <input name="lastName" type="text" maxlength="80" value="${escapeHtml(lastName)}" placeholder="Last name" autocomplete="family-name" />
          </label>
          <div class="field">
            <span>Email</span>
            <p class="profile-modal__email">${escapeHtml(email)}</p>
          </div>
          <p id="profile-modal-status" class="profile-modal__status" aria-live="polite"></p>
        </div>
        <div class="modal-card__actions modal-card__actions--end profile-modal__actions">
          <button class="button" type="submit" id="profile-modal-save" ${isSaving ? "disabled" : ""}>
            ${isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </section>
  `;
}

function wireProfileModal(userId) {
  const modal = document.querySelector("#profile-modal");
  if (!modal) return;

  const close = () => {
    modal.remove();
    document.body.classList.remove("modal-open");
    _onProfileSaved = null;
  };

  modal.querySelectorAll("[data-close-profile-modal]").forEach((el) => {
    el.addEventListener("click", close);
  });

  const form = modal.querySelector("#profile-modal-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const firstName = String(formData.get("firstName") || "").trim();
    const lastName = String(formData.get("lastName") || "").trim();

    const saveBtn = modal.querySelector("#profile-modal-save");
    const statusEl = modal.querySelector("#profile-modal-status");

    if (saveBtn) saveBtn.disabled = true;
    if (saveBtn) saveBtn.textContent = "Saving…";

    try {
      const profile = await upsertUserProfile({ userId, firstName, lastName });

      if (statusEl) {
        statusEl.textContent = "Profile saved";
        statusEl.classList.add("is-success");
      }

      updateAccountMenuProfile(profile);
      _onProfileSaved?.(profile);

      window.setTimeout(() => close(), 1000);
    } catch (error) {
      console.error(error);
      showToast("Couldn't save profile. Try again.", "error");

      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
    }
  });
}
