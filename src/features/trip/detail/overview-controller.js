import { appStore } from "../../../state/app-store.js";
import { tripStore } from "../../../state/trip-store.js";
import { sessionStore } from "../../../state/session-store.js";
import {
  OVERVIEW_CATEGORIES,
  OVERVIEW_CATEGORY_ICONS,
  OVERVIEW_CATEGORY_LABELS,
} from "../../../config/constants.js";
import {
  createOverviewBlock,
  reorderOverviewBlocks,
  softDeleteOverviewBlock,
  updateOverviewBlock,
} from "../../../services/overview-service.js";
import { showToast } from "../../shared/toast.js";
import { escapeHtml } from "./trip-detail-ui.js";
import { rerenderTripDetail } from "./trip-detail-state.js";
import {
  assignDaySortOrdersFromCombinedItems,
  moveCombinedItemByStep,
} from "./item-ordering.js";

function compareBySortOrder(left, right) {
  return (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0);
}

function getOverviewScopeLabel(baseId, bases) {
  if (!baseId) {
    return "Trip-wide";
  }

  return bases.find((base) => base.id === baseId)?.name || "Untitled base";
}

// Flat order: category (alphabetical), then sort_order within that category —
// keeps the up/down reorder groups (scoped per category) visually adjacent
// even though there's no category header/box separating them on screen.
function buildOverviewCardModels(scopeBaseId, overviewBlocks) {
  return OVERVIEW_CATEGORIES.flatMap((category) => {
    const group = overviewBlocks
      .filter((block) => (block.base_id || null) === scopeBaseId && block.category === category)
      .sort(compareBySortOrder);

    return group.map((block, index) => ({
      block,
      canMoveUp: index > 0,
      canMoveDown: index < group.length - 1,
    }));
  });
}

function renderOverviewCard(block, { canMoveUp, canMoveDown }) {
  const categoryLabel = OVERVIEW_CATEGORY_LABELS[block.category] || block.category;
  const iconName = OVERVIEW_CATEGORY_ICONS[block.category] || "circle-dot";

  return `
    <article class="overview-card">
      <div class="overview-card__meta">
        <span class="overview-card__category">
          <span class="overview-card__category-icon"><i data-lucide="${iconName}" aria-hidden="true"></i></span>
          <span>${escapeHtml(categoryLabel)}</span>
        </span>
        <div class="overview-card__reorder-controls" aria-label="Reorder block">
          <button
            class="overview-card__reorder-button"
            data-reorder-overview-block-up="${escapeHtml(block.id)}"
            type="button"
            aria-label="Move block up"
            ${canMoveUp ? "" : "disabled"}
          >
            <i data-lucide="chevron-up"></i>
          </button>
          <button
            class="overview-card__reorder-button"
            data-reorder-overview-block-down="${escapeHtml(block.id)}"
            type="button"
            aria-label="Move block down"
            ${canMoveDown ? "" : "disabled"}
          >
            <i data-lucide="chevron-down"></i>
          </button>
        </div>
      </div>
      <button class="overview-card__button" data-edit-overview-block="${escapeHtml(block.id)}" type="button">
        ${block.subtitle ? `<span class="overview-card__subtitle">${escapeHtml(block.subtitle)}</span>` : ""}
        <span class="overview-status-badge ${block.is_published ? "is-published" : "is-draft"}">${block.is_published ? "Published" : "Draft"}</span>
      </button>
    </article>
  `;
}

// Renders one scope's overview content — call once near the trip header for
// trip-wide content (scopeBaseId = null), and once per base, inline within
// that base's own section, for base-level content.
export function renderOverviewScopeSection(scopeBaseId, overviewBlocks) {
  const cardModels = buildOverviewCardModels(scopeBaseId, overviewBlocks);

  return `
    <div class="overview-scope">
      <div class="overview-scope__header">
        <p class="eyebrow">Overview Content</p>
        <button class="button button--secondary button--sm" data-add-overview-block="${escapeHtml(scopeBaseId || "")}" type="button">+ Add Content</button>
      </div>
      ${
        cardModels.length === 0
          ? `<p class="muted overview-scope__empty">No overview content yet.</p>`
          : `
            <div class="overview-card-grid">
              ${cardModels.map(({ block, canMoveUp, canMoveDown }) => renderOverviewCard(block, { canMoveUp, canMoveDown })).join("")}
            </div>
          `
      }
    </div>
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
              <span>Subtitle (optional)</span>
              <input name="subtitle" type="text" maxlength="120" value="${escapeHtml(subtitle)}" placeholder="e.g. Currency & Payments" />
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

    onReorderOverviewBlock: async ({ blockId, direction, button }) => {
      if (!blockId || !button || button.disabled) {
        return;
      }

      const block = tripStore.getCurrentOverviewBlocks().find((entry) => entry.id === blockId);
      if (!block) {
        return;
      }

      const groupBlocks = tripStore.getCurrentOverviewBlocks()
        .filter((entry) => (entry.base_id || null) === (block.base_id || null) && entry.category === block.category)
        .sort(compareBySortOrder);
      const currentIndex = groupBlocks.findIndex((entry) => entry.id === blockId);
      const targetIndex = currentIndex + direction;

      if (currentIndex === -1 || targetIndex < 0 || targetIndex >= groupBlocks.length) {
        return;
      }

      const reorderedGroup = moveCombinedItemByStep(groupBlocks, blockId, direction);
      const renumberedGroup = assignDaySortOrdersFromCombinedItems(reorderedGroup);
      const changedBlocks = renumberedGroup.filter((entry) => {
        const currentBlock = groupBlocks.find((original) => original.id === entry.id);
        return currentBlock && Number(currentBlock.sort_order) !== Number(entry.sort_order);
      });

      if (changedBlocks.length === 0) {
        return;
      }

      button.disabled = true;

      try {
        const savedBlocks = await reorderOverviewBlocks(
          changedBlocks.map((entry) => ({ id: entry.id, sortOrder: entry.sort_order }))
        );
        savedBlocks.forEach((savedBlock) => tripStore.updateCurrentOverviewBlock(savedBlock));
        rerenderTripDetail();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        showToast("Something went wrong saving. Please try again.", "error");
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
