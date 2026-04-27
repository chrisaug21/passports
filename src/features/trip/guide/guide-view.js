import {
  formatTripDateSummary,
  formatItemTypeLabel,
  formatStatusLabel,
  formatTimeLabel,
  getTripDateByDayNumber,
} from "../../../lib/format.js";
import { deriveTripStatus } from "../../../lib/derive.js";
import {
  escapeHtml,
  getTripHeroPhotoUrl,
  renderItemTypeIcon,
  sanitizeCoverUrl,
} from "../detail/trip-detail-ui.js";

// ---------------------------------------------------------------------------
// Item ordering — guide-specific sort (spec §6)
// ---------------------------------------------------------------------------

export function sortGuideItems(items) {
  const compareTime = (a, b) =>
    String(a.time_start || "").localeCompare(String(b.time_start || "")) ||
    String(a.title || "").localeCompare(String(b.title || ""));

  const anchors = items.filter((i) => i.is_anchor).sort(compareTime);
  const flexWithTime = items
    .filter((i) => !i.is_anchor && i.time_start)
    .sort((a, b) => String(a.time_start).localeCompare(String(b.time_start)));
  const flexNoTime = items
    .filter((i) => !i.is_anchor && !i.time_start)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));

  return [...anchors, ...flexWithTime, ...flexNoTime];
}

// ---------------------------------------------------------------------------
// Visibility filtering (spec §6 visibility table)
// ---------------------------------------------------------------------------

export function filterItemsForViewer(items, viewerRole) {
  if (viewerRole === "member") {
    return items.filter((i) => i.status !== "idea");
  }
  // public: DB already enforces confirmed/reserved/done; filter defensively
  const PUBLIC_SHOWN = new Set(["confirmed", "reserved", "done"]);
  return items.filter((i) => PUBLIC_SHOWN.has(i.status));
}

// ---------------------------------------------------------------------------
// Lodging bands (spec §6 — lodging renders at first/last day of its base)
// ---------------------------------------------------------------------------

export function getLodgingBands(items, bases, days) {
  const bands = [];

  items
    .filter((i) => i.item_type === "lodging" && i.base_id)
    .forEach((lodging) => {
      const baseDays = days
        .filter((d) => d.base_id === lodging.base_id)
        .sort((a, b) => a.day_number - b.day_number);

      if (baseDays.length === 0) return;

      bands.push({
        lodging,
        checkInDayNumber: baseDays[0].day_number,
        checkOutDayNumber: baseDays[baseDays.length - 1].day_number,
      });
    });

  return bands;
}

// ---------------------------------------------------------------------------
// Cost symbol derivation (spec §6)
// ---------------------------------------------------------------------------

function getCostSymbol(low, high) {
  const value = Number(high ?? low ?? null);
  if (!value && value !== 0) return "";
  if (value <= 25) return "€";
  if (value <= 75) return "€€";
  if (value <= 150) return "€€€";
  return "€€€€";
}

// ---------------------------------------------------------------------------
// Today's day number (spec §5)
// ---------------------------------------------------------------------------

export function getTodayDayNumber(trip) {
  if (!trip.start_date || trip.status !== "active") return null;
  const start = new Date(`${trip.start_date}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diffDays = Math.round((today - start) / (1000 * 60 * 60 * 24));
  const dayNumber = diffDays + 1;
  if (dayNumber < 1 || dayNumber > Number(trip.trip_length)) return null;
  return dayNumber;
}

// ---------------------------------------------------------------------------
// Nav date label (short form for sidebar/pill)
// ---------------------------------------------------------------------------

function formatNavDayDate(startDate, dayNumber) {
  const date = getTripDateByDayNumber(startDate, dayNumber);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

// ---------------------------------------------------------------------------
// Member avatars
// ---------------------------------------------------------------------------

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function renderMemberAvatars(members) {
  if (members.length === 0) return "";
  const displayed = members.slice(0, 5);
  const overflow = members.length - 5;
  const avatars = displayed
    .map((m) => {
      const hue = hashCode(m.user_id) % 360;
      const initial = (m.role || "M").charAt(0).toUpperCase();
      return `<div class="guide-hero__avatar" style="--avatar-hue: ${hue}deg" aria-label="${escapeHtml(m.role || "Member")}">${initial}</div>`;
    })
    .join("");
  const overflowEl =
    overflow > 0
      ? `<div class="guide-hero__avatar guide-hero__avatar--overflow">+${overflow}</div>`
      : "";

  return `<div class="guide-hero__members">${avatars}${overflowEl}</div>`;
}

// ---------------------------------------------------------------------------
// Item URL link
// ---------------------------------------------------------------------------

function renderItemUrl(url) {
  const safe = sanitizeCoverUrl(url);
  if (!safe) return "";
  let label = "";
  try {
    label = new URL(safe).hostname.replace(/^www\./, "");
  } catch {
    label = "View details";
  }
  return `
    <a class="guide-item-card__url" href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">
      <i data-lucide="external-link" aria-hidden="true"></i>
      <span>${escapeHtml(label)}</span>
    </a>
  `;
}

// ---------------------------------------------------------------------------
// Transport route line
// ---------------------------------------------------------------------------

function renderTransportRoute(item) {
  if (item.item_type !== "transport") return "";
  const origin = item.transport_origin || "";
  const dest = item.transport_destination || "";
  if (!origin && !dest) return "";
  const parts = [origin, dest].filter(Boolean);
  const label = parts.length === 2 ? `${origin} → ${dest}` : parts[0];
  return `<p class="guide-item-card__route">${escapeHtml(label)}</p>`;
}

// ---------------------------------------------------------------------------
// Item card (spec §6)
// ---------------------------------------------------------------------------

function renderGuideItemCard(item, viewerRole) {
  const isSpeculative = item.status === "option" || item.status === "shortlisted";
  const isMember = viewerRole === "member";

  let timeLabel = "";
  if (item.time_start) {
    const prefix = item.time_is_estimated ? "~" : "";
    timeLabel = prefix + formatTimeLabel(item.time_start);
    if (item.time_end) {
      timeLabel += ` – ${formatTimeLabel(item.time_end)}`;
    }
  }

  const costSymbol = isMember ? getCostSymbol(item.cost_low, item.cost_high) : "";

  return `
    <article
      class="guide-item-card${item.is_anchor ? " guide-item-card--anchor" : ""}${isSpeculative ? " guide-item-card--speculative" : ""}"
      data-status="${escapeHtml(item.status)}"
    >
      ${item.is_anchor ? `<i data-lucide="map-pin" class="guide-item-card__anchor-icon" aria-hidden="true"></i>` : ""}
      ${isSpeculative && isMember ? `<span class="guide-item-card__status-badge guide-item-card__status-badge--${escapeHtml(item.status)}">${escapeHtml(formatStatusLabel(item.status))}</span>` : ""}
      <div class="guide-item-card__header">
        ${renderItemTypeIcon(item, "guide-item-card__type-icon")}
        <h4 class="guide-item-card__title">${escapeHtml(item.title || "Untitled stop")}</h4>
      </div>
      <div class="guide-item-card__details">
        ${timeLabel ? `<p class="guide-item-card__time">${escapeHtml(timeLabel)}</p>` : ""}
        ${item.item_type === "meal" && item.meal_slot ? `<p class="guide-item-card__subtype">${escapeHtml(formatItemTypeLabel(item.meal_slot))}</p>` : ""}
        ${item.item_type === "activity" && item.activity_type ? `<p class="guide-item-card__subtype">${escapeHtml(formatItemTypeLabel(item.activity_type))}</p>` : ""}
        ${renderTransportRoute(item)}
        ${item.notes ? `<p class="guide-item-card__notes">${escapeHtml(item.notes)}</p>` : ""}
        ${item.confirmation_ref ? `<p class="guide-item-card__confirm-ref"><i data-lucide="hash" aria-hidden="true"></i>${escapeHtml(item.confirmation_ref)}</p>` : ""}
        ${item.url ? renderItemUrl(item.url) : ""}
        ${costSymbol ? `<p class="guide-item-card__cost" aria-label="Estimated cost: ${escapeHtml(costSymbol)}">${escapeHtml(costSymbol)}</p>` : ""}
      </div>
    </article>
  `;
}

// ---------------------------------------------------------------------------
// Lodging band (spec §6)
// ---------------------------------------------------------------------------

function renderLodgingBand(lodging, type) {
  const isCheckIn = type === "check-in";
  const timeValue = isCheckIn ? lodging.time_start : lodging.time_end;
  const typeLabel = isCheckIn ? "Check-in" : "Check-out";
  const timeLabel = timeValue ? `${typeLabel} · ${formatTimeLabel(timeValue)}` : typeLabel;

  return `
    <div class="guide-lodging-band guide-lodging-band--${type}">
      <i data-lucide="bed" class="guide-lodging-band__icon" aria-hidden="true"></i>
      <div class="guide-lodging-band__content">
        <span class="guide-lodging-band__name">${escapeHtml(lodging.title || "Lodging")}</span>
        <span class="guide-lodging-band__time">${escapeHtml(timeLabel)}</span>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Day header
// ---------------------------------------------------------------------------

function renderDayHeader(day, base, startDate) {
  const dateLabel = startDate ? formatNavDayDate(startDate, day.day_number) : "";
  const baseName = base?.name || base?.location_name || "";

  return `
    <div class="guide-day-header">
      <div class="guide-day-header__eyebrow">
        <span class="guide-day-header__number">Day ${day.day_number}</span>
        ${dateLabel ? `<span class="guide-day-header__date">${escapeHtml(dateLabel)}</span>` : ""}
        ${baseName ? `<span class="guide-day-header__base">${escapeHtml(baseName)}</span>` : ""}
      </div>
      ${day.title ? `<h2 class="guide-day-header__title">${escapeHtml(day.title)}</h2>` : ""}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Full day content (exported so guide-wire.js can use it for lazy loading)
// ---------------------------------------------------------------------------

export function renderFullDayContent(day, sortedItems, viewerRole, dayLodgingBands, bases, startDate) {
  const base = bases.find((b) => b.id === day.base_id) || null;
  const checkInBands = dayLodgingBands.filter((b) => b.checkInDayNumber === day.day_number);
  const checkOutBands = dayLodgingBands.filter((b) => b.checkOutDayNumber === day.day_number);
  const hasContent = sortedItems.length > 0 || checkInBands.length > 0 || checkOutBands.length > 0;

  return `
    ${renderDayHeader(day, base, startDate)}
    <div class="guide-day-items">
      ${checkInBands.map((b) => renderLodgingBand(b.lodging, "check-in")).join("")}
      ${sortedItems.map((item) => renderGuideItemCard(item, viewerRole)).join("")}
      ${!hasContent ? `<p class="guide-day-empty muted">Nothing planned for this day yet.</p>` : ""}
      ${checkOutBands.map((b) => renderLodgingBand(b.lodging, "check-out")).join("")}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Day section (lazy placeholder or full)
// ---------------------------------------------------------------------------

function renderDaySection(day, sortedItems, viewerRole, dayLodgingBands, bases, startDate, isLazy) {
  if (isLazy) {
    return `
      <section class="guide-day-section" id="guide-day-${day.day_number}" data-day-number="${day.day_number}" aria-label="Day ${day.day_number}">
        <div class="guide-day-placeholder" data-lazy-day="${day.day_number}"></div>
      </section>
    `;
  }

  return `
    <section class="guide-day-section" id="guide-day-${day.day_number}" data-day-number="${day.day_number}" aria-label="Day ${day.day_number}">
      ${renderFullDayContent(day, sortedItems, viewerRole, dayLodgingBands, bases, startDate)}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Day nav (sidebar on desktop, pills on mobile)
// ---------------------------------------------------------------------------

function renderGuideDayNav(days, trip, todayDayNumber) {
  const items = days
    .map((day) => {
      const dateLabel = trip.start_date ? formatNavDayDate(trip.start_date, day.day_number) : "";
      const isToday = todayDayNumber === day.day_number;

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

  return `<nav class="guide-day-nav" aria-label="Day navigation">${items}</nav>`;
}

// ---------------------------------------------------------------------------
// Hero section (spec §4)
// ---------------------------------------------------------------------------

function renderGuideHero(trip, bases, members, isMember, heroPhotoUrl, derivedStatus) {
  const baseNames = bases
    .map((b) => b.name || b.location_name || "")
    .filter(Boolean)
    .join(" → ");

  return `
    <div class="guide-hero">
      ${heroPhotoUrl
        ? `<img class="guide-hero__photo" src="${escapeHtml(heroPhotoUrl)}" alt="" />`
        : `<div class="guide-hero__photo guide-hero__photo--empty"></div>`
      }
      <div class="guide-hero__overlay"></div>
      <div class="guide-hero__top">
        ${isMember
          ? `<a class="guide-back-link" href="/app/trip/${escapeHtml(trip.id)}" data-guide-back aria-label="Back to planning">
               <i data-lucide="arrow-left" aria-hidden="true"></i>
               <span>Back to planning</span>
             </a>`
          : ""
        }
      </div>
      <div class="guide-hero__content">
        ${baseNames ? `<p class="guide-hero__destination">${escapeHtml(baseNames)}</p>` : ""}
        <h1 class="guide-hero__title">${escapeHtml(trip.title || "Untitled Trip")}</h1>
        <div class="guide-hero__meta">
          <span class="guide-hero__dates">${escapeHtml(formatTripDateSummary(trip))}</span>
          <span class="trip-pill">${escapeHtml(formatStatusLabel(derivedStatus))}</span>
        </div>
        ${isMember ? renderMemberAvatars(members) : ""}
        <div class="guide-hero__tabs" role="tablist">
          <button class="guide-hero__tab is-active" role="tab" aria-selected="true" type="button">Itinerary</button>
          <button class="guide-hero__tab" role="tab" aria-selected="false" disabled title="Available when trip is Active" type="button">Journal</button>
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Loading + error states
// ---------------------------------------------------------------------------

export function renderGuideLoadingView() {
  return `
    <div class="guide-loading">
      <div class="guide-loading__hero"></div>
      <div class="guide-loading__body">
        <div class="guide-loading__sidebar"></div>
        <div class="guide-loading__content">
          <div class="guide-loading__line"></div>
          <div class="guide-loading__line guide-loading__line--short"></div>
          <div class="guide-loading__line guide-loading__line--card"></div>
          <div class="guide-loading__line guide-loading__line--card"></div>
        </div>
      </div>
    </div>
  `;
}

export function renderGuideErrorView() {
  return `
    <section class="panel trip-detail__state">
      <p class="eyebrow">Guide</p>
      <h2>Could not load this trip</h2>
      <p class="muted">This trip may be private or unavailable. Sign in or return to the dashboard.</p>
      <div class="trip-detail__state-actions">
        <a class="button button--secondary" href="/app">Dashboard</a>
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Main render (spec §3)
// ---------------------------------------------------------------------------

export function renderGuideView(state) {
  const { trip, bases, days, items, members, viewerRole } = state;
  const derivedStatus = deriveTripStatus(trip);
  const isMember = viewerRole === "member";
  const heroPhotoUrl = getTripHeroPhotoUrl(trip);
  const todayDayNumber = getTodayDayNumber(trip);

  const visibleItems = filterItemsForViewer(items, viewerRole);
  const lodgingBands = getLodgingBands(visibleItems, bases, days);
  const lodgingBandItemIds = new Set(lodgingBands.map((b) => b.lodging.id));

  const daySections = days
    .map((day, index) => {
      const dayItems = visibleItems.filter(
        (i) => i.day_id === day.id && !lodgingBandItemIds.has(i.id)
      );
      const sorted = sortGuideItems(dayItems);
      const dayBands = lodgingBands.filter(
        (b) => b.checkInDayNumber === day.day_number || b.checkOutDayNumber === day.day_number
      );
      const isLazy = index > 0;

      return renderDaySection(day, sorted, viewerRole, dayBands, bases, trip.start_date, isLazy);
    })
    .join("");

  return `
    ${renderGuideHero(trip, bases, members, isMember, heroPhotoUrl, derivedStatus)}
    <div class="guide-body">
      ${renderGuideDayNav(days, trip, todayDayNumber)}
      <div class="guide-content">
        ${daySections}
      </div>
    </div>
  `;
}
