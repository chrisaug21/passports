import { escapeHtml } from "../detail/trip-detail-ui.js";

const TODO_TITLE_MAX_LENGTH = 200;
const TODO_SECTION_MAX_LENGTH = 60;

// Thought-starters, not defaults — none apply to every trip. A chip is
// dropped once a todo with a matching title already exists (case-insensitive)
// so the tray only ever offers things not yet added, and a group disappears
// once every one of its chips has been used. Each group only ever shows its
// first MAX_VISIBLE_SUGGESTIONS_PER_GROUP unused items (see
// getRemainingSuggestionGroups) — later items in the array are a reserve
// pool that surfaces automatically as earlier ones get used, so list order
// here doubles as priority order within the group.
const STARTER_SUGGESTIONS = [
  {
    section: "Documents & Money",
    items: [
      "Get local currency cash",
      "Check passport expiration",
      "Check visa requirements",
      "Notify bank/credit cards of travel",
      "Make copies of passport & ID (photo + physical)",
      "Check reciprocity or entry permit fees",
      "Set a travel budget",
      "Get a no-foreign-fee card",
      "Get an International Driving Permit",
    ],
  },
  {
    section: "Logistics",
    items: [
      "Book flights",
      "Book train tickets",
      "Book hotel",
      "Book restaurant reservations",
      "Book rental car",
      "Arrange airport transport",
      "Check baggage allowance",
      "Book must-do tours or attractions in advance",
      "Check transit passes or city cards",
      "Confirm hotel check-in/check-out times",
    ],
  },
  {
    section: "Health & Comfort",
    items: [
      "Pack sunscreen & weather protection",
      "Pack flight comfort items (gum, fidget toys, etc.)",
      "Pack prescriptions, vitamins & refills for the trip",
      "Get travel insurance",
      "Pack a basic first-aid kit",
      "Check insurance coverage for planned activities",
      "Schedule required vaccinations",
    ],
  },
  {
    section: "Home & Tech",
    items: [
      "Arrange pet/plant care",
      "Confirm outlet/plug converters needed",
      "Confirm cell/data plan works abroad",
      "Share your itinerary with friends via Passports",
      "Set up a mail hold",
      "Download entertainment to devices",
      "Download offline maps to phone",
      "Set a vacation auto-reply for email",
      "Back up your phone/photos before departure",
    ],
  },
  {
    section: "Packing",
    items: [
      "Pack chargers (phone, laptop, camera, watch)",
      "Pack toiletries in travel-size containers",
      "Pack pajamas",
      "Pack socks and underclothes",
      "Pack headphones",
      "Pack a change of clothes for your carry-on",
      "Pack a rain jacket or umbrella",
      "Pack a reusable water bottle",
      "Pack comfortable shoes",
      "Pack a swimsuit",
      "Pack packing cubes or laundry bags",
      "Pack a light jacket or sweater for AC/evenings",
      "Pack a portable battery pack",
      "Pack a day bag/daypack",
    ],
  },
];

// Each suggestion group only ever shows this many unused chips at once —
// the rest are a reserve that surfaces as earlier ones get added.
const MAX_VISIBLE_SUGGESTIONS_PER_GROUP = 6;

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
  // A todo created from a chip is matched by its original suggestion text
  // (source_suggestion), not its current title — so renaming it doesn't
  // bring the chip back. A manually-typed todo has no source_suggestion and
  // still matches on its live title, same as before. Deleting the todo
  // removes the row entirely, so the chip naturally reappears either way.
  const existingTitles = new Set(
    todos.map((todo) => String(todo.source_suggestion || todo.title || "").trim().toLowerCase())
  );

  return STARTER_SUGGESTIONS.map((group) => ({
    section: group.section,
    items: group.items
      .filter((title) => !existingTitles.has(title.toLowerCase()))
      .slice(0, MAX_VISIBLE_SUGGESTIONS_PER_GROUP),
  })).filter((group) => group.items.length > 0);
}

// Used by prep-wire.js to diff the visible chip set before/after adding a
// todo, so it can tell which chip newly surfaced and play its enter animation.
export function getVisibleSuggestionTitles(todos) {
  return new Set(getRemainingSuggestionGroups(todos).flatMap((group) => group.items));
}

function getExistingSectionNames(todos) {
  const names = new Set(
    todos.map((todo) => String(todo.section || "").trim()).filter(Boolean)
  );

  return [...names].sort((a, b) => a.localeCompare(b));
}

const SECTION_PRESETS = STARTER_SUGGESTIONS.map((group) => group.section);

// The 5 preset categories always come first (in their fixed order), followed
// by any other section names already in use on this trip that aren't one of
// the presets — so a custom section someone typed in stays selectable even
// though it isn't a preset.
function getSectionComboboxOptions(todos) {
  const customNames = getExistingSectionNames(todos).filter((name) => !SECTION_PRESETS.includes(name));
  return [...SECTION_PRESETS, ...customNames];
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

function renderSuggestions(todos, prepPage) {
  const { isShowingSuggestions, justRevealedSuggestionTitle } = prepPage;
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
      ${isShowingSuggestions ? renderSuggestionTray(remainingGroups, justRevealedSuggestionTitle) : ""}
    `;
  }

  return renderSuggestionTray(remainingGroups, justRevealedSuggestionTitle);
}

function renderSuggestionTray(groups, justRevealedSuggestionTitle) {
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
                      <button class="prep-suggestion-chip${title === justRevealedSuggestionTitle ? " prep-suggestion-chip--enter" : ""}" type="button" data-add-suggested-todo data-todo-title="${escapeHtml(title)}" data-todo-section="${escapeHtml(group.section)}">
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

function renderPrepBackLink(tripId) {
  return `
    <div class="prep-page__top">
      <a class="prep-back-link" href="/app/trip/${escapeHtml(tripId)}" data-prep-back aria-label="Back to planning">
        <i data-lucide="arrow-left" aria-hidden="true"></i>
        <span>Back to planning</span>
      </a>
    </div>
  `;
}

function renderPrepHeader(trip) {
  return `
    <div class="prep-page__header">
      <div>
        <p class="eyebrow">${escapeHtml(trip.title || "Trip")}</p>
        <h1>Prep Checklist</h1>
      </div>
      <button class="button prep-add-item-button" data-add-todo type="button">
        <span class="prep-add-item-button__full">+ Add Item</span>
        <span class="prep-add-item-button__short">+ Add</span>
      </button>
    </div>
  `;
}

function renderPrepChecklistBody(todos, renderedGroups, isAllHidden) {
  if (todos.length === 0) {
    return `
      <section class="panel prep-page__state">
        <p class="eyebrow">Nothing Here Yet</p>
        <h3>Build your trip-readiness checklist.</h3>
        <p class="muted">Book flights, get local currency, pack for that one nice dinner — add anything you need to sort out before or during the trip.</p>
        <button class="button" data-add-todo type="button">Add Your First Item</button>
      </section>
    `;
  }

  if (isAllHidden) {
    return `
      <section class="panel prep-page__state">
        <p class="eyebrow">All Done</p>
        <h3>Everything's checked off.</h3>
        <p class="muted">Every item on this list is complete. Show them again anytime with the toggle above.</p>
      </section>
    `;
  }

  return `<div class="prep-section-list">${renderedGroups.join("")}</div>`;
}

export function renderPrepView(state) {
  const { trip, todos, prepPage } = state;
  const groups = groupTodosBySection(todos);
  const hasCompletedItems = todos.some((todo) => todo.is_complete);
  const renderedGroups = groups.map((group) => renderSectionGroup(group, prepPage.hideCompleted)).filter(Boolean);
  const isAllHidden = todos.length > 0 && renderedGroups.length === 0;

  return `
    <div class="prep-page">
      ${renderPrepBackLink(trip.id)}
      ${renderPrepHeader(trip)}

      ${
        todos.length > 0 && hasCompletedItems
          ? `<div class="prep-list-controls">${renderHideCompletedToggle(prepPage.hideCompleted)}</div>`
          : ""
      }

      ${renderPrepChecklistBody(todos, renderedGroups, isAllHidden)}

      ${renderSuggestions(todos, prepPage)}

      ${renderTodoEditorModal({ prepPage, todos })}
      ${renderDeleteTodoConfirmModal({ prepPage, todos })}
    </div>
  `;
}

function renderTodoEditorFields({ todo, sectionOptions, currentSection, editorError }) {
  return `
    <label class="field">
      <span>Title</span>
      <input name="title" type="text" maxlength="${TODO_TITLE_MAX_LENGTH}" required value="${escapeHtml(todo?.title || "")}" placeholder="e.g. Book airport transfer" />
    </label>

    <label class="field">
      <span>Section (optional)</span>
      <div class="prep-combobox">
        <input name="section" type="text" autocomplete="off" maxlength="${TODO_SECTION_MAX_LENGTH}" id="todo-section-input" value="${escapeHtml(currentSection)}" placeholder="e.g. Logistics" />
        <ul class="prep-combobox__options" id="todo-section-options" hidden>
          ${sectionOptions.map((name) => `<li class="prep-combobox__option" data-section-option="${escapeHtml(name)}">${escapeHtml(name)}</li>`).join("")}
        </ul>
      </div>
    </label>

    ${editorError ? `<p class="field-hint field-hint--warning">${escapeHtml(editorError)}</p>` : ""}
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
  const sectionOptions = getSectionComboboxOptions(todos);
  const currentSection = todo?.section || "";

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
            ${renderTodoEditorFields({ todo, sectionOptions, currentSection, editorError })}
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
