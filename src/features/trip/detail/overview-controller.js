import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { sessionStore } from "../../../state/session-store.js";
import {
  OVERVIEW_CATEGORIES,
  OVERVIEW_CATEGORY_LABELS,
} from "../../../config/constants.js";
import {
  createOverviewBlock,
  softDeleteOverviewBlock,
  updateOverviewBlock,
} from "../../../services/overview-service.js";
import { showToast } from "../../shared/toast.js";
import { escapeHtml } from "./trip-detail-ui.js";
import { rerenderTripDetail } from "./trip-detail-state.js";

function getOverviewScopeLabel(baseId, bases) {
  if (!baseId) {
    return "Trip-wide";
  }

  return bases.find((base) => base.id === baseId)?.name || "Untitled base";
}

function groupOverviewBlocksByScope(bases, overviewBlocks) {
  const scopes = [{ baseId: null, label: "Trip-wide" }, ...bases.map((base) => ({ baseId: base.id, label: base.name || "Untitled base" }))];

  return scopes.map((scope) => ({
    ...scope,
    blocksByCategory: OVERVIEW_CATEGORIES
      .map((category) => ({
        category,
        blocks: overviewBlocks.filter((block) => (block.base_id || null) === scope.baseId && block.category === category),
      }))
      .filter((group) => group.blocks.length > 0),
  }));
}

function renderOverviewBlockRow(block) {
  return `
    <li class="overview-block-row">
      <button class="overview-block-row__button" data-edit-overview-block="${escapeHtml(block.id)}" type="button">
        <span class="overview-block-row__subtitle">${escapeHtml(block.subtitle || "Untitled")}</span>
        <span class="overview-status-badge ${block.is_published ? "is-published" : "is-draft"}">${block.is_published ? "Published" : "Draft"}</span>
      </button>
    </li>
  `;
}

export function renderOverviewSection(trip, bases, overviewBlocks) {
  const scopeGroups = groupOverviewBlocksByScope(bases, overviewBlocks);

  return `
    <section class="panel overview-panel">
      <div class="overview-panel__header">
        <p class="eyebrow">Overview Content</p>
        <h3>Trip & Base Overview</h3>
      </div>
      <div class="overview-groups">
        ${scopeGroups.map((scope) => `
          <div class="overview-group">
            <div class="overview-group__header">
              <h4>${escapeHtml(scope.label)}</h4>
              <button class="button button--secondary button--sm" data-add-overview-block="${escapeHtml(scope.baseId || "")}" type="button">+ Add Content</button>
            </div>
            ${
              scope.blocksByCategory.length === 0
                ? `<p class="muted overview-group__empty">No overview content yet.</p>`
                : scope.blocksByCategory.map((group) => `
                  <div class="overview-category">
                    <p class="overview-category__label">${escapeHtml(OVERVIEW_CATEGORY_LABELS[group.category] || group.category)}</p>
                    <ul class="overview-block-list">
                      ${group.blocks.map((block) => renderOverviewBlockRow(block)).join("")}
                    </ul>
                  </div>
                `).join("")
            }
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

export function renderOverviewEditorModal({ mode, block, scopeBaseId, bases, isSaving, error }) {
  if (!mode) {
    return "";
  }

  const isAddMode = mode === "add";
  const scopeLabel = getOverviewScopeLabel(isAddMode ? scopeBaseId : block?.base_id, bases);
  const modalTitle = isAddMode ? `Add Overview Content — ${scopeLabel}` : `Edit — ${scopeLabel}`;
  const category = block?.category || OVERVIEW_CATEGORIES[0];
  const subtitle = block?.subtitle || "";
  const body = block?.body || "";
  const isPublished = Boolean(block?.is_published);

  return `
    <div class="modal-shell" id="overview-editor-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-overview-editor></div>
      <section class="panel modal-card modal-card--editor">
        <div class="modal-card__header">
          <div>
            <h3>${escapeHtml(modalTitle)}</h3>
          </div>
          <button class="icon-button" id="close-overview-editor" type="button" aria-label="Close editor">×</button>
        </div>

        <form class="overview-editor-form" id="overview-editor-form">
          <div class="overview-editor-form__content">
            <label class="field">
              <span>Category</span>
              <select name="category" required>
                ${OVERVIEW_CATEGORIES.map((value) => `<option value="${value}" ${category === value ? "selected" : ""}>${escapeHtml(OVERVIEW_CATEGORY_LABELS[value] || value)}</option>`).join("")}
              </select>
            </label>

            <label class="field">
              <span>Subtitle</span>
              <input name="subtitle" type="text" maxlength="120" value="${escapeHtml(subtitle)}" placeholder="e.g. Currency & Payments" required />
            </label>

            <label class="field">
              <span>Content</span>
              <textarea name="body" rows="8" placeholder="Write the block's content here...">${escapeHtml(body)}</textarea>
            </label>

            <div class="overview-editor-form__publish-row">
              <div class="overview-editor-form__publish-label-group">
                <span>Published</span>
                <p class="field-hint">Visible on the public share link once published. Trip members always see drafts.</p>
              </div>
              <label class="toggle-switch" aria-label="Published">
                <input name="isPublished" type="checkbox" class="toggle-switch__input" ${isPublished ? "checked" : ""} />
                <span class="toggle-switch__track" aria-hidden="true"></span>
              </label>
            </div>

            ${error ? `<p class="field-hint field-hint--warning">${escapeHtml(error)}</p>` : ""}
          </div>

          <div class="modal-card__actions modal-card__actions--sticky">
            ${isAddMode ? "<span></span>" : `<button class="button-link button-link--danger" id="delete-overview-block-button" type="button" ${isSaving ? "disabled" : ""}>Remove</button>`}
            <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : isAddMode ? "Add" : "Save Changes"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

export function renderDeleteOverviewBlockConfirmModal({ block, isOpen, isDeleting }) {
  if (!isOpen || !block) {
    return "";
  }

  return `
    <div class="modal-shell" id="delete-overview-block-confirm-modal" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-delete-overview-block></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Remove overview content</p>
            <h3>Remove "${escapeHtml(block.subtitle || "this block")}"?</h3>
          </div>
        </div>
        <p class="muted">This cannot be undone.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-delete-overview-block" type="button">Cancel</button>
          <button class="button button--danger" id="confirm-delete-overview-block" type="button" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Removing…" : "Remove"}</button>
        </div>
      </section>
    </div>
  `;
}

export function createOverviewHandlers() {
  return {
    onAddOverviewBlock: (rawBaseId) => {
      appStore.updateTripDetail({
        overviewEditorMode: "add",
        editingOverviewBlockId: null,
        overviewEditorScopeBaseId: rawBaseId || null,
        overviewEditorError: "",
      });
      rerenderTripDetail();
    },

    onEditOverviewBlock: (blockId) => {
      if (!blockId) {
        return;
      }

      const block = tripStore.getCurrentOverviewBlocks().find((entry) => entry.id === blockId);
      if (!block) {
        return;
      }

      appStore.updateTripDetail({
        overviewEditorMode: "edit",
        editingOverviewBlockId: blockId,
        overviewEditorScopeBaseId: block.base_id || null,
        overviewEditorError: "",
      });
      rerenderTripDetail();
    },

    onCloseOverviewEditor: () => {
      appStore.updateTripDetail({
        overviewEditorMode: null,
        editingOverviewBlockId: null,
        overviewEditorScopeBaseId: null,
        overviewEditorError: "",
      });
      rerenderTripDetail();
    },

    onOverviewEditorSubmit: async (event) => {
      event.preventDefault();

      const trip = tripStore.getCurrentTrip();
      const { session } = sessionStore.getState();
      const { tripDetail } = appStore.getState();

      if (!trip?.id) {
        return;
      }

      const form = event.currentTarget;
      const formData = new FormData(form);
      const category = String(formData.get("category") || "").trim();
      const subtitle = String(formData.get("subtitle") || "").trim();
      const body = String(formData.get("body") || "").trim();
      const isPublished = formData.get("isPublished") === "on";

      if (!subtitle) {
        appStore.updateTripDetail({ overviewEditorError: "Add a subtitle first." });
        rerenderTripDetail();
        return;
      }

      if (!session?.user?.id) {
        showToast("Your session expired. Sign in again.", "error");
        return;
      }

      appStore.updateTripDetail({ isSavingOverviewBlock: true, overviewEditorError: "" });
      rerenderTripDetail();

      try {
        if (tripDetail.overviewEditorMode === "add") {
          const blocksInScope = tripStore.getCurrentOverviewBlocks()
            .filter((entry) => (entry.base_id || null) === tripDetail.overviewEditorScopeBaseId && entry.category === category);
          const nextSortOrder = blocksInScope.reduce((max, entry) => Math.max(max, Number(entry.sort_order) || 0), -1) + 1;

          const newBlock = await createOverviewBlock({
            tripId: trip.id,
            baseId: tripDetail.overviewEditorScopeBaseId,
            category,
            subtitle,
            body,
            sortOrder: nextSortOrder,
            isPublished,
            createdBy: session.user.id,
          });

          tripStore.appendCurrentOverviewBlock(newBlock);
          showToast("Overview content added.", "success");
        } else {
          const updatedBlock = await updateOverviewBlock({
            blockId: tripDetail.editingOverviewBlockId,
            category,
            subtitle,
            body,
            isPublished,
          });

          tripStore.updateCurrentOverviewBlock(updatedBlock);
          showToast("Overview content saved.", "success");
        }

        appStore.updateTripDetail({
          isSavingOverviewBlock: false,
          overviewEditorMode: null,
          editingOverviewBlockId: null,
          overviewEditorScopeBaseId: null,
          overviewEditorError: "",
        });
        rerenderTripDetail();
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({
          isSavingOverviewBlock: false,
          overviewEditorError: "Something went wrong saving. Please try again.",
        });
        rerenderTripDetail();
      }
    },

    onRequestDeleteOverviewBlock: () => {
      const { editingOverviewBlockId } = appStore.getState().tripDetail;
      if (!editingOverviewBlockId) {
        return;
      }

      appStore.updateTripDetail({
        showDeleteOverviewBlockConfirm: true,
        deletingOverviewBlockId: editingOverviewBlockId,
      });
      rerenderTripDetail();
    },

    onCancelDeleteOverviewBlock: () => {
      appStore.updateTripDetail({
        showDeleteOverviewBlockConfirm: false,
        deletingOverviewBlockId: null,
      });
      rerenderTripDetail();
    },

    onConfirmDeleteOverviewBlock: async () => {
      const { deletingOverviewBlockId } = appStore.getState().tripDetail;
      if (!deletingOverviewBlockId) {
        return;
      }

      appStore.updateTripDetail({ isDeletingOverviewBlock: true });
      rerenderTripDetail();

      try {
        await softDeleteOverviewBlock(deletingOverviewBlockId);
        tripStore.removeCurrentOverviewBlock(deletingOverviewBlockId);
        appStore.updateTripDetail({
          isDeletingOverviewBlock: false,
          showDeleteOverviewBlockConfirm: false,
          deletingOverviewBlockId: null,
          overviewEditorMode: null,
          editingOverviewBlockId: null,
          overviewEditorScopeBaseId: null,
        });
        rerenderTripDetail();
        showToast("Overview content removed.", "success");
      } catch (error) {
        console.error(error);
        appStore.updateTripDetail({ isDeletingOverviewBlock: false });
        rerenderTripDetail();
        showToast("Something went wrong. Please try again.", "error");
      }
    },
  };
}
