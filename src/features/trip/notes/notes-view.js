import { escapeHtml } from "../detail/trip-detail-ui.js";

const NOTE_TITLE_MAX_LENGTH = 150;
const NOTE_BODY_MAX_LENGTH = 5000;

// Scans line by line rather than pre-splitting into blank-line-separated
// blocks — a blank line between list items (common when people type or paste
// with spacing for readability) must not break the list into several
// single-item <ol>/<ul> elements, each of which would restart its own count
// at 1. A blank line still ends a plain-text paragraph, so multi-paragraph
// prose keeps rendering as separate blocks. No other markdown syntax
// (bold/italic/headers/links) is parsed on purpose.
function renderNoteBody(body) {
  const text = String(body || "");

  if (!text.trim()) {
    return "";
  }

  const htmlParts = [];
  let mode = null; // "ul" | "ol" | "p"
  let buffer = [];

  const flush = () => {
    if (buffer.length === 0) {
      return;
    }

    if (mode === "ul" || mode === "ol") {
      const items = buffer.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
      htmlParts.push(`<${mode} class="note-card__list">${items}</${mode}>`);
    } else if (mode === "p") {
      htmlParts.push(`<p class="note-card__paragraph">${buffer.map((line) => escapeHtml(line)).join("<br />")}</p>`);
    }

    buffer = [];
    mode = null;
  };

  text.split("\n").forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      // A blank line ends a plain-text paragraph, but leaves an in-progress
      // list open — items are still merged once a matching list line follows.
      if (mode === "p") {
        flush();
      }
      return;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);

    if (bulletMatch) {
      if (mode && mode !== "ul") {
        flush();
      }
      mode = "ul";
      buffer.push(bulletMatch[1]);
      return;
    }

    if (numberedMatch) {
      if (mode && mode !== "ol") {
        flush();
      }
      mode = "ol";
      buffer.push(numberedMatch[1]);
      return;
    }

    if (mode && mode !== "p") {
      flush();
    }
    mode = "p";
    buffer.push(line);
  });

  flush();

  return htmlParts.join("");
}

// Fairly conservative — keeps a card in a 3-up grid from towering over its
// row-mates before the reader opts into the full text via "Read more".
const NOTE_BODY_PREVIEW_LENGTH = 220;

function getBodyPreviewText(body, maxLength) {
  const text = String(body || "").replace(/\s+/g, " ").trim();

  if (text.length <= maxLength) {
    return null;
  }

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const clean = lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated;

  return `${clean.trim()}…`;
}

function renderNoteCard(note, isExpanded) {
  const hasUrl = Boolean(note.url);
  const titleMarkup = hasUrl
    ? `<a class="note-card__title note-card__title--link" href="${escapeHtml(note.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(note.title)}</a>`
    : `<span class="note-card__title">${escapeHtml(note.title)}</span>`;

  const previewText = getBodyPreviewText(note.body, NOTE_BODY_PREVIEW_LENGTH);
  const isTruncatable = Boolean(previewText);
  const showFullBody = !isTruncatable || isExpanded;

  const bodyMarkup = !note.body
    ? ""
    : showFullBody
      ? `<div class="note-card__body">${renderNoteBody(note.body)}</div>`
      : `<div class="note-card__body"><p class="note-card__paragraph">${escapeHtml(previewText)}</p></div>`;

  const toggleMarkup = isTruncatable
    ? `<button class="note-card__toggle" data-toggle-note-body="${escapeHtml(note.id)}" type="button">${isExpanded ? "Read less" : "Read more"}</button>`
    : "";

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
      ${bodyMarkup}
      ${toggleMarkup}
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
  const { trip, notes, notesPage } = state;
  const expandedNoteIds = notesPage.expandedNoteIds || [];

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
          : `<div class="note-card-grid">${notes.map((note) => renderNoteCard(note, expandedNoteIds.includes(note.id))).join("")}</div>`
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
