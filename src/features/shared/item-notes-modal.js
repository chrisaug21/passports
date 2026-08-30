import { escapeHtml } from "../trip/detail/trip-detail-ui.js";

let isDelegationBound = false;
let escapeKeyHandler = null;

export function initItemNotesModalDelegation() {
  if (isDelegationBound) {
    return;
  }
  isDelegationBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    if (target.closest("[data-close-item-notes-modal]")) {
      closeItemNotesModal();
      return;
    }

    const trigger = target.closest("[data-open-item-notes]");
    if (trigger) {
      event.preventDefault();
      openItemNotesModal({
        title: trigger.getAttribute("data-notes-title") || "Untitled stop",
        notes: trigger.getAttribute("data-notes-full") || "",
      });
    }
  });
}

function openItemNotesModal({ title, notes }) {
  closeItemNotesModal();

  const modal = document.createElement("div");
  modal.id = "item-notes-modal";
  modal.className = "modal-shell";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-item-notes-modal></div>
    <section class="panel modal-card modal-card--confirm" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)} notes">
      <div class="modal-card__header">
        <div>
          <p class="eyebrow">Notes</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <button class="icon-button" data-close-item-notes-modal type="button" aria-label="Close notes">×</button>
      </div>
      <p class="item-notes-modal__body">${escapeHtml(notes)}</p>
    </section>
  `;

  document.body.append(modal);
  document.body.classList.add("modal-open");

  escapeKeyHandler = (event) => {
    if (event.key === "Escape") {
      closeItemNotesModal();
    }
  };
  document.addEventListener("keydown", escapeKeyHandler);
}

function closeItemNotesModal() {
  const modal = document.querySelector("#item-notes-modal");
  if (!modal) {
    return;
  }

  modal.remove();
  document.body.classList.remove("modal-open");

  if (escapeKeyHandler) {
    document.removeEventListener("keydown", escapeKeyHandler);
    escapeKeyHandler = null;
  }
}
