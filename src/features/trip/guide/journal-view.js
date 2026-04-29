import {
  formatTimeLabel,
  formatItemTypeLabel,
  getTripDateByDayNumber,
} from "../../../lib/format.js";
import { deriveTripStatus } from "../../../lib/derive.js";
import {
  escapeHtml,
  getCountLabel,
  getTripStatTiles,
  renderItemTypeIcon,
  sanitizeCoverUrl,
} from "../detail/trip-detail-ui.js";
import { filterItemsForViewer, sortGuideItems } from "./guide-view.js";

const JOURNAL_PROFILE_PROMPT_DISMISSED_KEY = "journal-profile-prompt-dismissed";

function getJournalTripMode(trip) {
  const derivedStatus = deriveTripStatus(trip);
  const isCompleted = trip.status === "done" || derivedStatus === "past";

  return {
    isEnabled: trip.status === "active" || isCompleted,
    isReadOnly: false,
  };
}

// ---------------------------------------------------------------------------
// Attribution helpers
// ---------------------------------------------------------------------------

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getDisplayName(userId, members, profiles) {
  const profile = profiles.find((p) => p.id === userId);
  if (profile?.first_name) {
    return [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  }
  const member = members.find((m) => m.user_id === userId);
  return member?.email || userId;
}

export function getAvatarInitial(userId, members, profiles) {
  const profile = profiles.find((p) => p.id === userId);
  if (profile?.first_name) return profile.first_name.charAt(0).toUpperCase();
  const member = members.find((m) => m.user_id === userId);
  return member?.email ? member.email.charAt(0).toUpperCase() : userId.charAt(0).toUpperCase();
}

export function renderJournalAvatar(userId, members, profiles) {
  const hue = hashCode(userId) % 360;
  const initial = getAvatarInitial(userId, members, profiles);
  const name = getDisplayName(userId, members, profiles);

  return `
    <div class="journal-attribution">
      <div class="journal-avatar" style="--avatar-hue: ${hue}deg" aria-hidden="true">${escapeHtml(initial)}</div>
      <span class="journal-attribution__name">${escapeHtml(name)}</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Day-level journal entry area
// ---------------------------------------------------------------------------

function getDayLabel(day) {
  return day.title ? day.title : `Day ${day.day_number}`;
}

function renderEntryEditor(ariaLabel, notes, placeholder, savedClass, rows) {
  return `
    <div class="journal-entry-editor" data-journal-editor hidden>
      <textarea
        class="journal-entry-textarea"
        placeholder="${escapeHtml(placeholder)}"
        data-journal-textarea
        rows="${rows}"
        aria-label="${escapeHtml(ariaLabel)}"
      >${escapeHtml(notes || "")}</textarea>
      <div class="journal-entry-actions">
        <span class="${savedClass}" aria-live="polite"></span>
        <button class="journal-entry-actions__cancel" data-journal-cancel type="button">Cancel</button>
        <button class="journal-entry-actions__save" data-journal-save type="button">Save</button>
      </div>
    </div>
  `;
}

function renderEntryDisplay(notes, placeholder, isEditable) {
  const text = String(notes || "").trim();
  const content = text
    ? `<p class="journal-entry-display__text">${escapeHtml(text)}</p>`
    : `<p class="journal-entry-display__placeholder">${escapeHtml(placeholder)}</p>`;

  if (!isEditable) {
    return `<div class="journal-entry-display journal-entry-display--read-only" data-journal-placeholder="${escapeHtml(placeholder)}">${content}</div>`;
  }

  return `
    <button class="journal-entry-display journal-entry-display--editable" data-journal-edit-toggle data-journal-placeholder="${escapeHtml(placeholder)}" type="button">
      ${content}
    </button>
  `;
}

function renderDayEntryWrite(day, currentUserEntry, members, profiles, currentUserId) {
  const placeholder = "Tap to add a note...";
  const existingNotes = currentUserEntry?.notes || "";

  return `
    <div class="journal-day-entry journal-day-entry--editable"
      data-journal-day-entry="${escapeHtml(day.id)}"
      data-entry-id="${escapeHtml(currentUserEntry?.id || "")}"
    >
      <div class="journal-day-entry__body">
        ${renderJournalAvatar(currentUserId, members, profiles)}
        <div class="journal-day-entry__content">
          ${renderEntryDisplay(existingNotes, placeholder, true)}
          ${renderEntryEditor(
            `Journal entry for ${getDayLabel(day)}`,
            existingNotes,
            `How was ${getDayLabel(day)}? Add highlights, notes, or reflections…`,
            "journal-day-entry__saved",
            3
          )}
        </div>
      </div>
    </div>
  `;
}

function renderDayEntryRead(entry, day, members, profiles) {
  if (!entry.notes?.trim()) return "";

  return `
    <div class="journal-day-entry journal-day-entry--read">
      ${renderJournalAvatar(entry.user_id, members, profiles)}
      ${renderEntryDisplay(entry.notes, `No note for ${getDayLabel(day)}.`, false)}
    </div>
  `;
}

export function renderDayJournalArea(day, entries, members, profiles, isWritable, currentUserId) {
  const dayEntries = entries.filter((e) => e.day_id === day.id && !e.item_id);
  if (dayEntries.length === 0 && !isWritable) return "";

  const currentUserEntry = dayEntries.find((e) => e.user_id === currentUserId) || null;
  const otherEntries = dayEntries.filter((e) => e.user_id !== currentUserId);

  const parts = [];

  if (isWritable) {
    parts.push(renderDayEntryWrite(day, currentUserEntry, members, profiles, currentUserId));
  } else if (currentUserEntry) {
    parts.push(renderDayEntryRead(currentUserEntry, day, members, profiles));
  }

  otherEntries.forEach((entry) => {
    parts.push(renderDayEntryRead(entry, day, members, profiles));
  });

  if (parts.length === 0) return "";

  return `<div class="journal-day-entries">${parts.join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Item-level journal entry area
// ---------------------------------------------------------------------------

function renderItemEntryWrite(item, currentUserEntry) {
  const placeholder = "Tap to add a note...";
  const existingNotes = currentUserEntry?.notes || "";

  return `
    <div class="journal-item-entry journal-item-entry--editable"
      data-journal-item-entry="${escapeHtml(item.id)}"
      data-entry-id="${escapeHtml(currentUserEntry?.id || "")}"
    >
      ${renderEntryDisplay(existingNotes, placeholder, true)}
      ${renderEntryEditor(
        `Note about ${item.title || "this stop"}`,
        existingNotes,
        `Add a note about ${item.title || "this stop"}…`,
        "journal-item-entry__saved",
        2
      )}
    </div>
  `;
}

function renderItemEntryRead(entry) {
  if (!entry.notes?.trim()) return "";
  return `<div class="journal-item-entry journal-item-entry--read">${renderEntryDisplay(entry.notes, "", false)}</div>`;
}

function renderItemJournalArea(item, entries, photos, members, profiles, isWritable, currentUserId) {
  const itemEntries = entries.filter((e) => e.item_id === item.id);
  const itemPhotos = photos.filter((p) => p.item_id === item.id);

  const memberUserIds = new Set();
  if (isWritable && currentUserId) {
    memberUserIds.add(currentUserId);
  }
  itemEntries.forEach((entry) => memberUserIds.add(entry.user_id));
  itemPhotos.forEach((photo) => memberUserIds.add(photo.user_id));

  const memberRows = [...memberUserIds].map((memberUserId) => {
    const entry = itemEntries.find((itemEntry) => itemEntry.user_id === memberUserId) || null;
    const photo = itemPhotos.find((itemPhoto) => itemPhoto.user_id === memberUserId) || null;
    const isCurrentUser = memberUserId === currentUserId;
    const noteHtml =
      isCurrentUser && isWritable
        ? renderItemEntryWrite(item, entry)
        : entry?.notes
          ? renderItemEntryRead(entry)
          : "";
    const photoHtml = isCurrentUser && isWritable
      ? renderItemPhotoSlot(item, photo, true)
      : photo
        ? renderItemPhotoRead(photo)
        : "";

    if (!noteHtml && !photoHtml) {
      return "";
    }

    return `
      <div class="journal-member-row">
        <div class="journal-member-row__note">
          ${renderJournalAvatar(memberUserId, members, profiles)}
          ${noteHtml || ""}
        </div>
        <div class="journal-member-row__photo${photoHtml ? "" : " journal-member-row__photo--empty"}">
          ${photoHtml || ""}
        </div>
      </div>
    `;
  }).filter(Boolean);

  if (memberRows.length === 0) return "";

  return `<div class="journal-item-journal" data-journal-item-zone="${escapeHtml(item.id)}">${memberRows.join("")}</div>`;
}

// ---------------------------------------------------------------------------
// Item photos
// ---------------------------------------------------------------------------

export function renderItemPhotoSlot(item, existingPhoto, isWritable) {
  if (!isWritable) return "";

  if (existingPhoto) {
    return `
      <div class="journal-photo-slot journal-photo-slot--has-photo"
        data-journal-photo-slot="${escapeHtml(item.id)}"
        data-photo-id="${escapeHtml(existingPhoto.id)}"
        data-storage-path="${escapeHtml(existingPhoto.storage_path)}"
      >
        <img
          class="journal-photo-slot__img"
          src="${escapeHtml(existingPhoto.public_url)}"
          alt="Your photo for ${escapeHtml(item.title || "this stop")}"
          loading="lazy"
        />
        <div class="journal-photo-slot__overlay">
          <button class="journal-photo-slot__action" data-journal-photo-replace="${escapeHtml(item.id)}" type="button" aria-label="Replace photo">
            <i data-lucide="refresh-cw" aria-hidden="true"></i>
          </button>
          <button class="journal-photo-slot__action journal-photo-slot__action--remove" data-journal-photo-remove="${escapeHtml(item.id)}" type="button" aria-label="Remove photo">
            <i data-lucide="trash-2" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div class="journal-photo-slot" data-journal-photo-slot="${escapeHtml(item.id)}">
      <button class="journal-photo-add" data-journal-photo-add="${escapeHtml(item.id)}" type="button">
        <i data-lucide="camera" aria-hidden="true"></i>
        <span>Add photo</span>
      </button>
    </div>
  `;
}

function renderItemPhotoRead(photo) {
  if (!photo?.public_url) return "";

  return `
    <div class="journal-photo-read">
      <img
        class="journal-photo-read__img"
        src="${escapeHtml(photo.public_url)}"
        alt="Photo"
        loading="lazy"
      />
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Done toggle
// ---------------------------------------------------------------------------

function renderDoneToggle(item, showDoneToggle) {
  if (!showDoneToggle) return "";

  const isDone = item.status === "done";

  return `
    <button
      class="journal-done-toggle${isDone ? " is-done" : ""}"
      data-journal-done-toggle="${escapeHtml(item.id)}"
      type="button"
      aria-label="${isDone ? "Mark not done" : "Mark as done"}"
      aria-pressed="${String(isDone)}"
    >
      <i data-lucide="check" aria-hidden="true"></i>
    </button>
  `;
}

// ---------------------------------------------------------------------------
// Item card (Journal Mode)
// ---------------------------------------------------------------------------

function renderJournalItemCard(item, entries, photos, members, profiles, isWritable, currentUserId, showDoneToggle) {
  const isDone = item.status === "done";

  let timeLabel = "";
  if (item.time_start) {
    const prefix = item.time_is_estimated ? "~" : "";
    timeLabel = prefix + formatTimeLabel(item.time_start);
    if (item.time_end) timeLabel += ` – ${formatTimeLabel(item.time_end)}`;
  }

  const itemUrl = sanitizeCoverUrl(item.url);
  let urlLabel = "";
  if (itemUrl) {
    try { urlLabel = new URL(itemUrl).hostname.replace(/^www\./, ""); }
    catch { urlLabel = "View details"; }
  }

  const journalArea = renderItemJournalArea(item, entries, photos, members, profiles, isWritable, currentUserId);

  return `
    <article
      class="guide-item-card journal-item-card${isDone ? " journal-item-card--done" : ""}"
      data-status="${escapeHtml(item.status)}"
      data-item-type="${escapeHtml(item.item_type)}"
      data-item-id="${escapeHtml(item.id)}"
    >
      ${renderDoneToggle(item, showDoneToggle)}
      <div class="guide-item-card__header">
        ${renderItemTypeIcon(item, "guide-item-card__type-icon")}
        <h4 class="guide-item-card__title">${escapeHtml(item.title || "Untitled stop")}</h4>
      </div>
      <div class="guide-item-card__details">
        ${timeLabel ? `<p class="guide-item-card__time">${escapeHtml(timeLabel)}</p>` : ""}
        ${item.item_type === "meal" && item.meal_slot ? `<p class="guide-item-card__subtype">${escapeHtml(formatItemTypeLabel(item.meal_slot))}</p>` : ""}
        ${item.item_type === "activity" && item.activity_type ? `<p class="guide-item-card__subtype">${escapeHtml(formatItemTypeLabel(item.activity_type))}</p>` : ""}
        ${item.item_type === "transport" && (item.transport_origin || item.transport_destination)
          ? `<p class="guide-item-card__route">${escapeHtml([item.transport_origin, item.transport_destination].filter(Boolean).join(" → "))}</p>`
          : ""}
        ${item.notes ? `<p class="guide-item-card__notes">${escapeHtml(item.notes)}</p>` : ""}
        ${item.confirmation_ref ? `<p class="guide-item-card__confirm-ref"><i data-lucide="hash" aria-hidden="true"></i>${escapeHtml(item.confirmation_ref)}</p>` : ""}
        ${itemUrl ? `<a class="guide-item-card__url" href="${escapeHtml(itemUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link" aria-hidden="true"></i><span>${escapeHtml(urlLabel)}</span></a>` : ""}
      </div>
      ${journalArea ? `<div class="journal-item-card__journal">${journalArea}</div>` : ""}
    </article>
  `;
}

// ---------------------------------------------------------------------------
// Day section (Journal Mode)
// ---------------------------------------------------------------------------

export function renderJournalDaySection(day, state, journalState) {
  const { trip, bases, items, members, viewerRole, userId } = state;
  const { entries, photos, profiles } = journalState;

  const base = bases.find((b) => b.id === day.base_id) || null;
  const baseName = base?.name || base?.location_name || "";

  const visibleItems = filterItemsForViewer(items, viewerRole);
  const dayItems = visibleItems.filter((i) => i.day_id === day.id);
  const sorted = sortGuideItems(dayItems);

  const isMember = viewerRole !== "public";
  const { isReadOnly } = getJournalTripMode(trip);
  const isWritable = isMember && Boolean(userId) && !isReadOnly;
  const showDoneToggle = isWritable;

  let dateLabel = "";
  let dowLabel = "";
  if (trip.start_date) {
    const date = getTripDateByDayNumber(trip.start_date, day.day_number);
    if (date) {
      dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
      dowLabel = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
    }
  }

  const dayJournalArea = renderDayJournalArea(day, entries, members, profiles, isWritable, userId);

  const itemCards = sorted.map((item) =>
    renderJournalItemCard(item, entries, photos, members, profiles, isWritable, userId, showDoneToggle)
  ).join("");

  const hasContent = sorted.length > 0 || dayJournalArea;

  return `
    <div class="guide-day-header">
      <div class="guide-day-header__eyebrow">
        <span class="guide-day-header__number">Day ${day.day_number}</span>
        ${dowLabel ? `<span class="guide-day-header__dow">${escapeHtml(dowLabel)}</span>` : ""}
        ${dateLabel ? `<span class="guide-day-header__date">${escapeHtml(dateLabel)}</span>` : ""}
        ${baseName ? `<span class="guide-day-header__base">${escapeHtml(baseName)}</span>` : ""}
      </div>
      ${day.title ? `<h2 class="guide-day-header__title">${escapeHtml(day.title)}</h2>` : ""}
    </div>
    ${dayJournalArea ? `
      <section class="journal-day-notes" aria-label="Day notes">
        <p class="journal-day-notes__label">Day notes</p>
        ${dayJournalArea}
      </section>
    ` : ""}
    <div class="guide-day-items">
      ${itemCards}
      ${!hasContent ? `<p class="guide-day-empty muted">Nothing planned for this day yet.</p>` : ""}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Profile prompt banner
// ---------------------------------------------------------------------------

export function renderProfilePromptBanner() {
  return `
    <div class="journal-profile-prompt" id="journal-profile-prompt" role="alert">
      <span>Add your name so your journal entries are attributed correctly.</span>
      <button class="journal-profile-prompt__link" id="journal-open-profile" type="button">Set up profile →</button>
      <button class="journal-profile-prompt__dismiss" id="journal-dismiss-profile-prompt" type="button" aria-label="Dismiss">×</button>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Journal day nav (same structure as itinerary nav)
// ---------------------------------------------------------------------------

export function renderJournalDayNav(days, trip, todayDayNumber) {
  const items = days
    .map((day) => {
      let dateLabel = "";
      const isToday = todayDayNumber === day.day_number;
      if (trip.start_date) {
        const date = getTripDateByDayNumber(trip.start_date, day.day_number);
        if (date) {
          dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
        }
      }

      return `
        <button
          class="guide-nav-item${isToday ? " is-today" : ""}"
          data-day-number="${day.day_number}"
          data-guide-nav-day="${day.day_number}"
          type="button"
          aria-label="Go to Day ${day.day_number}"
        >
          <span class="guide-nav-item__label">Day ${day.day_number}</span>
          ${dateLabel ? `<span class="guide-nav-item__date">${escapeHtml(dateLabel)}</span>` : ""}
        </button>
      `;
    })
    .join("");

  return items;
}

function shouldShowProfilePrompt(state, journalState) {
  if (!state.userId || state.viewerRole === "public") {
    return false;
  }

  try {
    if (window.sessionStorage.getItem(JOURNAL_PROFILE_PROMPT_DISMISSED_KEY) === "true") {
      return false;
    }
  } catch (_error) {
    // Ignore sessionStorage failures.
  }

  const currentUserProfile = journalState.profiles.find((p) => p.id === state.userId)
    || state.currentUserProfile
    || null;

  return !currentUserProfile || (!currentUserProfile.first_name && !currentUserProfile.last_name);
}

export function renderJournalStatTiles(state, journalState) {
  const doneItems = state.items.filter((item) => item.status === "done");
  const itemTypeTiles = getTripStatTiles(state.trip, state.bases, doneItems)
    .filter((tile) => tile.label !== "Days" && tile.label !== "Bases");
  const photoCount = journalState.photos.length;
  const tiles = [
    { label: getCountLabel(Number(state.trip.trip_length) || 0, "Day", "Days"), count: Number(state.trip.trip_length) || 0 },
    { label: getCountLabel(state.bases.length, "Base", "Bases"), count: state.bases.length },
    ...itemTypeTiles,
    { label: "Journal entries", count: journalState.entries.length },
    ...(photoCount > 0 ? [{ label: getCountLabel(photoCount, "Photo", "Photos"), count: photoCount }] : []),
  ];

  return `
    <section class="trip-stat-tiles guide-trip-stat-tiles" data-journal-stat-tiles aria-label="Journal stats">
      ${tiles.map((tile) => `
        <article class="panel trip-stat-tile">
          <h3>${tile.count}</h3>
          <p>${tile.label}</p>
        </article>
      `).join("")}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Full Journal Mode content (guide-content area)
// ---------------------------------------------------------------------------

export function renderJournalContent(state, journalState) {
  const { days } = state;
  const needsProfilePrompt = shouldShowProfilePrompt(state, journalState);

  const daySections = days
    .map((day, index) => {
      if (index === 0) {
        return `
          <section class="guide-day-section" id="guide-day-${day.day_number}" data-day-number="${day.day_number}" aria-label="Day ${day.day_number}">
            ${renderJournalDaySection(day, state, journalState)}
          </section>
        `;
      }
      return `
        <section class="guide-day-section" id="guide-day-${day.day_number}" data-day-number="${day.day_number}" aria-label="Day ${day.day_number}">
          <div class="guide-day-placeholder" data-lazy-journal-day="${day.day_number}"></div>
        </section>
      `;
    })
    .join("");

  return `
    ${renderJournalStatTiles(state, journalState)}
    ${needsProfilePrompt ? renderProfilePromptBanner() : ""}
    ${daySections}
  `;
}
