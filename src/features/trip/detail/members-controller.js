import { appStore } from "../../../state/app-store.js";
import { sessionStore } from "../../../state/session-store.js";
import { tripStore } from "../../../state/trip-store.js";
import {
  fetchTripMembersWithEmails,
  addTripMember,
  removeTripMember,
  getUserIdByEmail,
} from "../../../services/members-service.js";
import { showToast } from "../../shared/toast.js";
import { escapeHtml } from "./trip-detail-ui.js";
import { tripDetailState, rerenderTripDetail } from "./trip-detail-state.js";

function getMembersState() {
  return tripDetailState.membersModalState;
}

function setMembersState(patch) {
  tripDetailState.membersModalState = {
    ...(tripDetailState.membersModalState || {}),
    ...patch,
  };
}

function getAvatarInitial(email) {
  return email ? email.charAt(0).toUpperCase() : "?";
}

function renderMemberRow(member, currentUserId, ownerId) {
  const isCurrentUser = member.user_id === currentUserId;
  const isOwner = member.user_id === ownerId;
  const showRemove = !isOwner && !isCurrentUser;
  const state = getMembersState();
  const isPendingRemove = state?.confirmRemoveUserId === member.user_id;
  const isRemoving = state?.isRemoving && isPendingRemove;
  const email = member.email || "Unknown user";
  const initial = getAvatarInitial(member.email);
  const role = member.role || "";

  if (isPendingRemove) {
    return `
      <li class="members-list__item members-list__item--confirm">
        <p class="members-list__confirm-text">Remove <strong>${escapeHtml(email)}</strong> from this trip?</p>
        <div class="members-list__confirm-actions">
          <button class="button button--secondary button--sm" data-cancel-remove-member type="button">Cancel</button>
          <button class="button button--danger button--sm" data-confirm-remove-member="${escapeHtml(member.user_id)}" type="button" ${isRemoving ? "disabled" : ""}>${isRemoving ? "Removing…" : "Remove"}</button>
        </div>
      </li>
    `;
  }

  return `
    <li class="members-list__item">
      <div class="members-list__avatar">${escapeHtml(initial)}</div>
      <div class="members-list__info">
        <span class="members-list__email">${escapeHtml(email)}</span>
        <span class="members-list__role">${escapeHtml(role.charAt(0).toUpperCase() + role.slice(1))}</span>
      </div>
      <div class="members-list__badges">
        ${isCurrentUser ? `<span class="members-badge members-badge--you">You</span>` : ""}
        ${isOwner ? `<span class="members-badge members-badge--owner">Owner</span>` : ""}
      </div>
      ${showRemove ? `<button class="icon-button members-list__remove-btn" data-remove-member="${escapeHtml(member.user_id)}" type="button" aria-label="Remove member">×</button>` : ""}
    </li>
  `;
}

export function renderMembersModal() {
  const { tripDetail } = appStore.getState();

  if (!tripDetail.isShowingMembersModal) {
    return "";
  }

  const trip = tripStore.getCurrentTrip();
  const currentUserId = sessionStore.getState().session?.user?.id;
  const state = getMembersState() || { isLoading: true };

  let bodyContent;

  if (state.isLoading) {
    bodyContent = `<p class="muted members-modal__status">Loading members…</p>`;
  } else if (state.loadError) {
    bodyContent = `<p class="muted members-modal__status members-modal__status--error">Could not load members. Try closing and reopening.</p>`;
  } else {
    const members = state.members || [];
    bodyContent = `
      <ul class="members-list" aria-label="Trip members">
        ${members.map((m) => renderMemberRow(m, currentUserId, trip?.owner_id)).join("")}
      </ul>
    `;
  }

  const addError = state.addError ? `<p class="members-modal__add-error">${escapeHtml(state.addError)}</p>` : "";
  const isAdding = state.isAdding;

  return `
    <div class="modal-shell" id="members-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-members-modal></div>
      <section class="panel modal-card members-modal">
        <div class="modal-card__header">
          <h3>Trip Members</h3>
          <button class="icon-button" id="close-members-modal" type="button" aria-label="Close members">×</button>
        </div>

        <div class="members-modal__body">
          ${bodyContent}
        </div>

        <form class="members-modal__add-form" id="members-add-form" novalidate>
          <div class="members-modal__add-row">
            <input
              class="members-modal__add-input"
              id="members-add-email"
              type="email"
              placeholder="Email address"
              value="${escapeHtml(state.addEmail || "")}"
              autocomplete="off"
              ${isAdding ? "disabled" : ""}
            />
            <button class="button members-modal__add-btn" type="submit" ${isAdding ? "disabled" : ""}>${isAdding ? "Adding…" : "Add"}</button>
          </div>
          ${addError}
        </form>

        <div class="modal-card__actions modal-card__actions--end">
          <button class="button" id="close-members-modal-footer" type="button">Done</button>
        </div>
      </section>
    </div>
  `;
}

async function loadMembers(tripId) {
  setMembersState({ isLoading: true, loadError: null });
  rerenderTripDetail();

  try {
    const members = await fetchTripMembersWithEmails(tripId);
    setMembersState({ members, isLoading: false });
  } catch (error) {
    console.error(error);
    setMembersState({ isLoading: false, loadError: true });
  }

  rerenderTripDetail();
}

export function createMembersHandlers() {
  return {
    onOpenMembersModal: () => {
      const trip = tripStore.getCurrentTrip();
      if (!trip?.id) return;

      tripDetailState.membersModalState = {
        members: [],
        isLoading: true,
        loadError: null,
        addEmail: "",
        addError: null,
        isAdding: false,
        confirmRemoveUserId: null,
        isRemoving: false,
      };

      appStore.updateTripDetail({ isShowingMembersModal: true });
      rerenderTripDetail();
      const emailInput = document.getElementById("members-add-email");
      if (emailInput && !emailInput.disabled) emailInput.focus();
      loadMembers(trip.id);
    },

    onCloseMembersModal: () => {
      appStore.updateTripDetail({ isShowingMembersModal: false });
      rerenderTripDetail();
    },

    onMembersAddSubmit: async (event) => {
      event.preventDefault();

      const trip = tripStore.getCurrentTrip();
      if (!trip?.id) return;

      const state = getMembersState();
      const input = document.getElementById("members-add-email");
      const emailValue = (input?.value || "").trim().toLowerCase();

      if (!emailValue) {
        setMembersState({ addError: "Enter an email address." });
        rerenderTripDetail();
        return;
      }

      setMembersState({ isAdding: true, addError: null, addEmail: emailValue });
      rerenderTripDetail();

      try {
        const userId = await getUserIdByEmail(emailValue);

        if (!userId) {
          setMembersState({ isAdding: false, addError: "No account found with that email." });
          rerenderTripDetail();
          return;
        }

        const alreadyMember = (getMembersState()?.members || []).some((m) => m.user_id === userId);

        if (alreadyMember) {
          setMembersState({ isAdding: false, addError: "Already a member of this trip." });
          rerenderTripDetail();
          return;
        }

        await addTripMember({ tripId: trip.id, userId });
        setMembersState({ isAdding: false, addEmail: "", addError: null });
        await loadMembers(trip.id);
      } catch (error) {
        console.error(error);
        setMembersState({ isAdding: false, addError: "Something went wrong. Please try again." });
        rerenderTripDetail();
      }
    },

    onRequestRemoveMember: (userId) => {
      if (!userId) return;
      setMembersState({ confirmRemoveUserId: userId });
      rerenderTripDetail();
    },

    onCancelRemoveMember: () => {
      setMembersState({ confirmRemoveUserId: null, isRemoving: false });
      rerenderTripDetail();
    },

    onConfirmRemoveMember: async (userId) => {
      const trip = tripStore.getCurrentTrip();
      if (!trip?.id || !userId) return;

      setMembersState({ isRemoving: true });
      rerenderTripDetail();

      try {
        await removeTripMember({ tripId: trip.id, userId });
        setMembersState({ confirmRemoveUserId: null, isRemoving: false });
        await loadMembers(trip.id);
      } catch (error) {
        console.error(error);
        setMembersState({ isRemoving: false });
        rerenderTripDetail();
        showToast("Could not remove member. Please try again.", "error");
      }
    },
  };
}
