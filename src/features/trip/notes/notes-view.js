import { escapeHtml } from "../detail/trip-detail-ui.js";

const NOTE_TITLE_MAX_LENGTH = 150;
const NOTE_BODY_MAX_LENGTH = 5000;

// Splits on blank-line-separated paragraphs. A paragraph renders as a real
// <ul>/<ol> only when every one of its lines starts with a bullet/number
// marker — otherwise it's plain text with line breaks preserved. No other
// markdown syntax (bold/italic/headers/links) is parsed on purpose.
function renderNoteBody(body) {
  const text = String(body || "").trim();

  if (!text) {
    return "";
  }

  const blocks = text.split(/\n{2,}/);

  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return "";
      }

      const bulletMatches = lines.map((line) => line.match(/^[-*]\s+(.*)$/));
      const numberedMatches = lines.map((line) => line.match(/^\d+\.\s+(.*)$/));

      if (bulletMatches.every(Boolean)) {
        return `<ul class="note-card__list">${bulletMatches.map((match) => `<li>${escapeHtml(match[1])}</li>`).join("")}</ul>`;
      }

      if (numberedMatches.every(Boolean)) {
        return `<ol class="note-card__list">${numberedMatches.map((match) => `<li>${escapeHtml(match[1])}</li>`).join("")}</ol>`;
      }

      return `<p class="note-card__paragraph">${lines.map((line) => escapeHtml(line)).join("<br />")}</p>`;
    })
    .join("");
}

function renderNoteCard(note) {
  const hasUrl = Boolean(note.url);
  const titleMarkup = hasUrl
    ? `<a class="note-card__title note-card__title--link" href="${escapeHtml(note.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(note.title)}</a>`
    : `<span class="note-card__title">${escapeHtml(note.title)}</span>`;

  return `
    <article class="note-card">
      <div class="note-card__header">
        ${titleMarkup}
        <div class="note-card__actions">
          <button class="note-card__icon-button" data-pin-note="${escapeHtml(note.id)}" type="button" aria-label="${note.is_pinned ? "Unpin note" : "Pin note"}" aria-pressed="${note.is_pinned ? "true" : "false"}">
            <i data-lucide="${note.is_pinned ? "pin-off" : "pin"}" aria-hidden="true"></i>
          </button>
          <button class="note-card__icon-button" data-edit-note="${escapeHtml(note.id)}" type="button" aria-label="Edit note">
            <i data-lucide="pencil" aria-hidden="true"></i>
          </button>
          <button class="note-card__icon-button" data-request-delete-note="${escapeHtml(note.id)}" type="button" aria-label="Delete note">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </div>
      </div>
      ${note.body ? `<div class="note-card__body">${renderNoteBody(note.body)}</div>` : ""}
    </article>
  `;
}

export function renderNotesLoadingView() {
  return `
    <section class="panel notes-page__state">
      <h3>Loading notes…</h3>
      <p class="muted">Pulling your saved notes and references now.</p>
    </section>
  `;
}

export function renderNotesErrorView() {
  return `
    <section class="panel notes-page__state">
      <h3>Could not load notes</h3>
      <p class="muted">Try refreshing the page.</p>
    </section>
  `;
}

export function renderNotesView(state) {
  const { trip, notes } = state;

  return `
    <div class="notes-page">
      <div class="notes-page__top">
        <a class="notes-back-link" href="/app/trip/${escapeHtml(trip.id)}" data-notes-back aria-label="Back to planning">
          <i data-lucide="arrow-left" aria-hidden="true"></i>
          <span>Back to planning</span>
        </a>
      </div>

      <div class="notes-page__header">
        <div>
          <p class="eyebrow">${escapeHtml(trip.title || "Trip")}</p>
          <h1>Notes &amp; References</h1>
        </div>
        <button class="button" data-add-note type="button">+ Add Note</button>
      </div>

      ${
        notes.length === 0
          ? `
            <section class="panel notes-page__state">
              <p class="eyebrow">No Notes Yet</p>
              <h3>Save planning research here.</h3>
              <p class="muted">Paste an article, jot down recommendations, or save a link to come back to later.</p>
              <button class="button" data-add-note type="button">Add Your First Note</button>
            </section>
          `
          : `<div class="note-card-grid">${notes.map((note) => renderNoteCard(note)).join("")}</div>`
      }

      ${renderNoteEditorModal(state)}
      ${renderDeleteNoteConfirmModal(state)}
    </div>
  `;
}

export function renderNoteEditorModal({ notesPage, notes }) {
  const { editorMode, editingNoteId, isSaving, editorError } = notesPage;

  if (!editorMode) {
    return "";
  }

  const isAddMode = editorMode === "add";
  const note = isAddMode ? null : notes.find((entry) => entry.id === editingNoteId);
  const modalTitle = isAddMode ? "Add Note" : "Edit Note";

  return `
    <div class="modal-shell" id="note-editor-modal" aria-hidden="false">
      <div class="modal-backdrop" data-close-note-editor></div>
      <section class="panel modal-card modal-card--editor">
        <div class="modal-card__header">
          <div>
            <h3>${escapeHtml(modalTitle)}</h3>
          </div>
          <button class="icon-button" id="close-note-editor" type="button" aria-label="Close editor">×</button>
        </div>

        <form class="note-editor-form" id="note-editor-form">
          <div class="note-editor-form__content">
            <label class="field">
              <span>Title</span>
              <input name="title" type="text" maxlength="${NOTE_TITLE_MAX_LENGTH}" required value="${escapeHtml(note?.title || "")}" placeholder="e.g. Kyoto neighborhood guide" />
            </label>

            <label class="field">
              <span>Link (optional)</span>
              <input name="url" type="url" value="${escapeHtml(note?.url || "")}" placeholder="https://..." />
            </label>

            <label class="field">
              <span>Content (optional)</span>
              <textarea name="body" rows="10" maxlength="${NOTE_BODY_MAX_LENGTH}" placeholder="Paste an article, write notes, or list recommendations. Lines starting with -, *, or 1. become a bulleted or numbered list.">${escapeHtml(note?.body || "")}</textarea>
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

export function renderDeleteNoteConfirmModal({ notesPage, notes }) {
  const { showDeleteConfirm, deletingNoteId, isDeleting } = notesPage;

  if (!showDeleteConfirm) {
    return "";
  }

  const note = notes.find((entry) => entry.id === deletingNoteId);

  if (!note) {
    return "";
  }

  return `
    <div class="modal-shell" id="delete-note-confirm-modal" aria-hidden="false">
      <div class="modal-backdrop" data-cancel-delete-note></div>
      <section class="panel modal-card modal-card--confirm">
        <div class="modal-card__header">
          <div>
            <p class="eyebrow">Remove note</p>
            <h3>Remove "${escapeHtml(note.title || "this note")}"?</h3>
          </div>
        </div>
        <p class="muted">This cannot be undone.</p>
        <div class="modal-card__actions">
          <button class="button button--secondary" id="cancel-delete-note" type="button">Cancel</button>
          <button class="button button--danger" id="confirm-delete-note" type="button" ${isDeleting ? "disabled" : ""}>${isDeleting ? "Removing…" : "Remove"}</button>
        </div>
      </section>
    </div>
  `;
}
