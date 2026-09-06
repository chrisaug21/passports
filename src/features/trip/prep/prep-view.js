import { escapeHtml } from "../detail/trip-detail-ui.js";

const TODO_TITLE_MAX_LENGTH = 200;
const TODO_SECTION_MAX_LENGTH = 60;

// Thought-starters, not defaults — none apply to every trip. A chip is
// dropped once a todo with a matching title already exists (case-insensitive)
// so the tray only ever offers things not yet added, and a group disappears
// once every one of its chips has been used.
const STARTER_SUGGESTIONS = [
  {
    section: "Documents & Money",
    items: [
      "Check passport expiration",
      "Check visa requirements",
      "Notify bank/credit cards of travel",
      "Get local currency or a no-foreign-fee card",
    ],
  },
  {
    section: "Logistics",
    items: [
      "Book flights",
      "Book hotel",
      "Book restaurant reservations",
      "Arrange airport transport",
      "Check baggage allowance",
    ],
  },
  {
    section: "Health & Comfort",
    items: ["Pack prescriptions + extra supply", "Get travel insurance"],
  },
  {
    section: "Home & Tech",
    items: [
      "Arrange pet/plant/mail care",
      "Confirm cell/data plan works abroad",
      "Download offline maps or entertainment",
      "Confirm outlet/plug converters needed",
    ],
  },
];

// Ungrouped items render first, then named sections in the order their
// earliest item was added — no separate sections table, so "order" is
// derived from each group's first todo rather than stored anywhere.
function groupTodosBySection(todos) {
  const ungrouped = [];
  const sectionsByName = new Map();

  todos.forEach((todo) => {
    const section = String(todo.section || "").trim();

    if (!section) {
      ungrouped.push(todo);
      return;
    }

    if (!sectionsByName.has(section)) {
      sectionsByName.set(section, { section, items: [], firstCreatedAt: todo.created_at });
    }

    sectionsByName.get(section).items.push(todo);
  });

  const namedGroups = [...sectionsByName.values()].sort((a, b) =>
    String(a.firstCreatedAt).localeCompare(String(b.firstCreatedAt))
  );

  const groups = [];
  if (ungrouped.length > 0) {
    groups.push({ section: null, items: ungrouped });
  }
  groups.push(...namedGroups);

  return groups;
}

// Stable partition: completed items sink to the bottom of their section but
// otherwise keep their relative (creation) order, same as the incomplete ones.
function sortTodosForDisplay(items) {
  return [
    ...items.filter((todo) => !todo.is_complete),
    ...items.filter((todo) => todo.is_complete),
  ];
}

function getRemainingSuggestionGroups(todos) {
  const existingTitles = new Set(todos.map((todo) => String(todo.title || "").trim().toLowerCase()));

  return STARTER_SUGGESTIONS.map((group) => ({
    section: group.section,
    items: group.items.filter((title) => !existingTitles.has(title.toLowerCase())),
  })).filter((group) => group.items.length > 0);
}

function getExistingSectionNames(todos) {
  const names = new Set(
    todos.map((todo) => String(todo.section || "").trim()).filter(Boolean)
  );

  return [...names].sort((a, b) => a.localeCompare(b));
}

function renderTodoRow(todo) {
  return `
    <li class="prep-todo-row${todo.is_complete ? " is-complete" : ""}" data-prep-todo-row="${escapeHtml(todo.id)}">
      <button class="prep-todo-checkbox" data-toggle-todo-complete="${escapeHtml(todo.id)}" type="button" role="checkbox" aria-checked="${todo.is_complete ? "true" : "false"}" aria-label="${todo.is_complete ? "Mark as not done" : "Mark as done"}">
        <i data-lucide="check" aria-hidden="true"></i>
      </button>
      <span class="prep-todo-title">${escapeHtml(todo.title)}</span>
      <div class="prep-todo-actions">
        <button class="prep-todo-icon-button" data-edit-todo="${escapeHtml(todo.id)}" type="button" aria-label="Edit item">
          <i data-lucide="pencil" aria-hidden="true"></i>
        </button>
        <button class="prep-todo-icon-button" data-request-delete-todo="${escapeHtml(todo.id)}" type="button" aria-label="Delete item">
          <i data-lucide="trash-2" aria-hidden="true"></i>
        </button>
      </div>
    </li>
  `;
}

function renderSectionGroup(group, hideCompleted) {
  const visibleItems = hideCompleted ? group.items.filter((todo) => !todo.is_complete) : group.items;

  if (visibleItems.length === 0) {
    return "";
  }

  return `
    <div class="prep-section">
      ${group.section ? `<h3 class="prep-section__title">${escapeHtml(group.section)}</h3>` : ""}
      <ul class="prep-todo-list">
        ${sortTodosForDisplay(visibleItems).map(renderTodoRow).join("")}
      </ul>
    </div>
  `;
}

function renderHideCompletedToggle(hideCompleted) {
  return `
    <button class="prep-hide-completed-toggle" data-toggle-hide-completed type="button" aria-pressed="${hideCompleted ? "true" : "false"}">
      <i data-lucide="${hideCompleted ? "eye-off" : "eye"}" aria-hidden="true"></i>
      <span>${hideCompleted ? "Show Completed" : "Hide Completed"}</span>
    </button>
  `;
}

function renderSuggestions(todos, isShowingSuggestions) {
  const remainingGroups = getRemainingSuggestionGroups(todos);

  if (remainingGroups.length === 0) {
    return "";
  }

  const isEmpty = todos.length === 0;

  if (!isEmpty) {
    return `
      <div class="prep-suggestions-toggle-row">
        <button class="prep-suggestions-toggle" data-toggle-suggestions type="button" aria-expanded="${isShowingSuggestions ? "true" : "false"}">
          <i data-lucide="lightbulb" aria-hidden="true"></i>
          <span>Suggestions</span>
          <i data-lucide="${isShowingSuggestions ? "chevron-up" : "chevron-down"}" aria-hidden="true"></i>
        </button>
      </div>
      ${isShowingSuggestions ? renderSuggestionTray(remainingGroups) : ""}
    `;
  }

  return renderSuggestionTray(remainingGroups);
}

function renderSuggestionTray(groups) {
  return `
    <div class="prep-suggestion-tray">
      ${groups
        .map(
          (group) => `
            <div class="prep-suggestion-group">
              <p class="prep-suggestion-group__title">${escapeHtml(group.section)}</p>
              <div class="prep-suggestion-chips">
                ${group.items
                  .map(
                    (title) => `
                      <button class="prep-suggestion-chip" type="button" data-add-suggested-todo data-todo-title="${escapeHtml(title)}" data-todo-section="${escapeHtml(group.section)}">
                        + ${escapeHtml(title)}
                      </button>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

export function renderPrepLoadingView() {
  return `
    <section class="panel prep-page__state">
      <h3>Loading prep checklist…</h3>
      <p class="muted">Pulling your trip-readiness todos now.</p>
    </section>
  `;
}

export function renderPrepErrorView() {
  return `
    <section class="panel prep-page__state">
      <h3>Could not load prep checklist</h3>
      <p class="muted">Try refreshing the page.</p>
    </section>
  `;
}

export function renderPrepView(state) {
  const { trip, todos, prepPage } = state;
  const groups = groupTodosBySection(todos);
  const hasCompletedItems = todos.some((todo) => todo.is_complete);
  const renderedGroups = groups.map((group) => renderSectionGroup(group, prepPage.hideCompleted)).filter(Boolean);
  const isAllHidden = todos.length > 0 && renderedGroups.length === 0;

  return `
    <div class="prep-page">
      <div class="prep-page__top">
        <a class="prep-back-link" href="/app/trip/${escapeHtml(trip.id)}" data-prep-back aria-label="Back to planning">
          <i data-lucide="arrow-left" aria-hidden="true"></i>
          <span>Back to planning</span>
        </a>
      </div>

      <div class="prep-page__header">
        <div>
          <p class="eyebrow">${escapeHtml(trip.title || "Trip")}</p>
          <h1>Prep Checklist</h1>
        </div>
        <button class="button" data-add-todo type="button">+ Add Item</button>
      </div>

      ${
        todos.length > 0 && hasCompletedItems
          ? `<div class="prep-list-controls">${renderHideCompletedToggle(prepPage.hideCompleted)}</div>`
          : ""
      }

      ${
        todos.length === 0
          ? `
            <section class="panel prep-page__state">
              <p class="eyebrow">Nothing Here Yet</p>
              <h3>Build your trip-readiness checklist.</h3>
              <p class="muted">Book flights, get local currency, pack for that one nice dinner — add anything you need to sort out before or during the trip.</p>
              <button class="button" data-add-todo type="button">Add Your First Item</button>
            </section>
          `
          : isAllHidden
            ? `
              <section class="panel prep-page__state">
                <p class="eyebrow">All Done</p>
                <h3>Everything's checked off.</h3>
                <p class="muted">Every item on this list is complete. Show them again anytime with the toggle above.</p>
              </section>
            `
            : `<div class="prep-section-list">${renderedGroups.join("")}</div>`
      }

      ${renderSuggestions(todos, prepPage.isShowingSuggestions)}

      ${renderTodoEditorModal({ prepPage, todos })}
      ${renderDeleteTodoConfirmModal({ prepPage, todos })}
    </div>
  `;
}

export function renderTodoEditorModal({ prepPage, todos }) {
  const { editorMode, editingTodoId, isSaving, editorError } = prepPage;

  if (!editorMode) {
    return "";
  }

  const isAddMode = editorMode === "add";
  const todo = isAddMode ? null : todos.find((entry) => entry.id === editingTodoId);
  const modalTitle = isAddMode ? "Add Item" : "Edit Item";
  const sectionOptions = getExistingSectionNames(todos);

  return `
    <div class="modal-shell" id="todo-editor-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-todo-editor></div>
      <section class="panel modal-card modal-card--editor">
        <div class="modal-card__header">
          <div>
            <h3>${escapeHtml(modalTitle)}</h3>
          </div>
          <button class="icon-button" id="close-todo-editor" type="button" aria-label="Close editor">×</button>
        </div>

        <form class="todo-editor-form" id="todo-editor-form">
          <div class="todo-editor-form__content">
            <label class="field">
              <span>Title</span>
              <input name="title" type="text" maxlength="${TODO_TITLE_MAX_LENGTH}" required value="${escapeHtml(todo?.title || "")}" placeholder="e.g. Book airport transfer" />
            </label>

            <label class="field">
              <span>Section (optional)</span>
              <input name="section" type="text" maxlength="${TODO_SECTION_MAX_LENGTH}" list="prep-section-options" value="${escapeHtml(todo?.section || "")}" placeholder="e.g. Logistics" />
              <datalist id="prep-section-options">
                ${sectionOptions.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}
              </datalist>
            </label>

            ${editorError ? `<p class="field-hint field-hint--warning">${escapeHtml(editorError)}</p>` : ""}
          </div>

          <div class="modal-card__actions modal-card__actions--sticky">
            <span></span>
            <button class="button" type="submit" ${isSaving ? "disabled" : ""}>${isSaving ? "Saving…" : isAddMode ? "Add" : "Save Changes"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

export function renderDeleteTodoConfirmModal({ prepPage, todos }) {
  const { showDeleteConfirm, deletingTodoId, isDeleting } = prepPage;

  if (!showDeleteConfirm) {
    return "";
  }

  const todo = todos.find((entry) => entry.id === deletingTodoId);

  if (!todo) {
    return "";
  }

  return `
    <div class="modal-shell" id="delete-todo-confirm-modal" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-delete-todo></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Remove item</p>
            <h3>Remove "${escapeHtml(todo.title || "this item")}"?</h3>
          </div>
        </div>
        <p class="muted">This cannot be undone.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-delete-todo" type="button">Cancel</button>
          <button class="button button--danger" id="confirm-delete-todo" type="button" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Removing…" : "Remove"}</button>
        </div>
      </section>
    </div>
  `;
}
