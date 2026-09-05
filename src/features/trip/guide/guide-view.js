import {
  formatTripDateSummary,
  formatItemTypeLabel,
  formatStatusLabel,
  formatTimeLabel,
  getTripDateByDayNumber,
} from "../../../lib/format.js";
import { deriveTripStatus } from "../../../lib/derive.js";
import {
  OVERVIEW_CATEGORIES,
  OVERVIEW_CATEGORY_ICONS,
  OVERVIEW_CATEGORY_LABELS,
} from "../../../config/constants.js";
import {
  escapeHtml,
  getTripHeroPhotoUrl,
  getTripStatTiles,
  renderExpandableItemNotes,
  renderItemMapLink,
  renderItemTypeIcon,
  sanitizeCoverUrl,
} from "../detail/trip-detail-ui.js";

// ---------------------------------------------------------------------------
// Item ordering — guide-specific sort (spec §6)
// ---------------------------------------------------------------------------

export function sortGuideItems(items) {
  return [...items].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
}

// ---------------------------------------------------------------------------
// Visibility filtering (spec §6 visibility table)
// ---------------------------------------------------------------------------

export function filterItemsForViewer(items, viewerRole) {
  if (viewerRole !== "public") {
    const MEMBER_SHOWN = new Set(["option", "shortlisted", "confirmed", "reserved"]);
    return items.filter((i) => MEMBER_SHOWN.has(i.status));
  }
  // public: DB already enforces confirmed/reserved visibility; filter defensively
  const PUBLIC_SHOWN = new Set(["confirmed", "reserved"]);
  return items.filter((i) => PUBLIC_SHOWN.has(i.status));
}

// ---------------------------------------------------------------------------
// Lodging bands (spec §6 — lodging renders at first/last day of its base)
// ---------------------------------------------------------------------------

export function getLodgingBands(items, bases, days, startDate = null) {
  const bands = [];

  items
    .filter((i) => i.item_type === "lodging" && i.base_id)
    .forEach((lodging) => {
      const baseDays = days
        .filter((d) => d.base_id === lodging.base_id)
        .sort((a, b) => a.day_number - b.day_number);

      if (baseDays.length === 0) return;

      // Default: last day of the base. Override with check_out_date if set and
      // it maps to a real day in this trip (falls back to last-day-of-base if not).
      let checkOutDayNumber = baseDays[baseDays.length - 1].day_number;
      if (lodging.check_out_date && startDate) {
        const coDate = new Date(`${lodging.check_out_date}T12:00:00`);
        const stDate = new Date(`${startDate}T12:00:00`);
        const diffDays = Math.round((coDate - stDate) / (1000 * 60 * 60 * 24));
        const derivedDayNumber = diffDays + 1;
        if (days.find((d) => d.day_number === derivedDayNumber)) {
          checkOutDayNumber = derivedDayNumber;
        }
      }

      bands.push({
        lodging,
        checkInDayNumber: baseDays[0].day_number,
        checkOutDayNumber,
      });
    });

  return bands;
}

// ---------------------------------------------------------------------------
// Cost symbol derivation (spec §6)
// ---------------------------------------------------------------------------

function getCostSymbol(low, high) {
  const raw = high ?? low ?? null;
  if (raw === null || raw === undefined) return "";
  const value = Number(raw);
  if (!isFinite(value) || value === 0) return "";
  if (value <= 25) return "$";
  if (value <= 75) return "$$";
  if (value <= 150) return "$$$";
  return "$$$$";
}

// ---------------------------------------------------------------------------
// Today's day number (spec §5)
// ---------------------------------------------------------------------------

export function getTodayDayNumber(trip) {
  const derivedStatus = deriveTripStatus(trip);

  if (!trip.start_date || (trip.status !== "active" && derivedStatus !== "traveling")) {
    return null;
  }

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
      // Use first character of email; first-name initial is future work once profile data is available
      const initial = m.email ? m.email.charAt(0).toUpperCase() : "?";
      return `<div class="guide-hero__avatar" style="--avatar-hue: ${hue}deg" aria-label="${escapeHtml(m.email || m.role || "Member")}">${initial}</div>`;
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
  const isOption = item.status === "option";
  const isShortlisted = item.status === "shortlisted";
  const isMember = viewerRole !== "public";

  let timeLabel = "";
  if (item.time_start) {
    const prefix = item.time_is_estimated ? "~" : "";
    timeLabel = prefix + formatTimeLabel(item.time_start);
    if (item.time_end) {
      timeLabel += ` – ${formatTimeLabel(item.time_end)}`;
    }
  }

  const costSymbol = isMember ? getCostSymbol(item.cost_low, item.cost_high) : "";

  const speculativeClass = isOption
    ? " guide-item-card--option"
    : isShortlisted
      ? " guide-item-card--shortlisted"
      : "";

  return `
    <article
      class="guide-item-card${item.is_anchor ? " guide-item-card--anchor" : ""}${speculativeClass}"
      data-status="${escapeHtml(item.status)}"
      data-item-type="${escapeHtml(item.item_type)}"
    >
      ${renderItemMapLink(item, "guide-item-card__map-button")}
      <span class="guide-item-card__status-badge guide-item-card__status-badge--${escapeHtml(item.status)}">${escapeHtml(formatStatusLabel(item.status))}</span>
      <div class="guide-item-card__header">
        ${renderItemTypeIcon(item, "guide-item-card__type-icon")}
        <h4 class="guide-item-card__title${item.address ? " guide-item-card__title--with-map" : ""}">${escapeHtml(item.title || "Untitled stop")}${item.is_anchor ? ` <i data-lucide="lock" class="guide-item-card__anchor-icon" aria-hidden="true"></i>` : ""}</h4>
      </div>
      <div class="guide-item-card__details">
        ${timeLabel ? `<p class="guide-item-card__time">${escapeHtml(timeLabel)}</p>` : ""}
        ${item.item_type === "meal" && item.meal_slot ? `<p class="guide-item-card__subtype">${escapeHtml(formatItemTypeLabel(item.meal_slot))}</p>` : ""}
        ${item.item_type === "activity" && item.activity_type ? `<p class="guide-item-card__subtype">${escapeHtml(formatItemTypeLabel(item.activity_type))}</p>` : ""}
        ${renderTransportRoute(item)}
        ${renderExpandableItemNotes(item, "guide-item-card__notes")}
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
// Overview content ("Trip Overview" / "{Base} Overview" accordion)
// ---------------------------------------------------------------------------

function compareByOverviewSortOrder(a, b) {
  return (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
}

// Guide view only ever shows published content — same convention as hiding
// idea-status items. RLS also restricts anon reads to published blocks; this
// filters defensively for members/owner too, who'd otherwise see drafts.
export function filterOverviewBlocksForViewer(overviewBlocks) {
  return overviewBlocks.filter((block) => block.is_published);
}

// Day numbers where a new base's overview content should surface — the first
// day belonging to each base, in day-number order. Computed once per render
// pass and shared across all three places guide day content gets built
// (initial render, tab-switch rebuild, lazy-scroll load) so the "shows up
// when you arrive at a base" behavior is consistent no matter which path
// produced the day section.
export function getBaseTransitionDayNumbers(days) {
  const sorted = [...days].sort((a, b) => a.day_number - b.day_number);
  const transitions = new Set();
  let previousBaseId = null;

  sorted.forEach((day) => {
    const baseId = day.base_id || null;
    if (baseId && baseId !== previousBaseId) {
      transitions.add(day.day_number);
    }
    previousBaseId = baseId;
  });

  return transitions;
}

function renderOverviewBlock(block) {
  return `
    <article class="guide-overview__block">
      ${block.subtitle ? `<h3 class="guide-overview__block-subtitle">${escapeHtml(block.subtitle)}</h3>` : ""}
      <p class="guide-overview__block-body">${escapeHtml(block.body || "")}</p>
    </article>
  `;
}

// scopeBaseId = null renders trip-wide content; a base id renders that base's
// content. Returns "" when there's nothing published in scope — no empty
// selector row, per spec (zero published blocks = show nothing).
export function renderOverviewSection(scopeBaseId, overviewBlocks, title, sectionId) {
  const visibleBlocks = filterOverviewBlocksForViewer(overviewBlocks).filter(
    (block) => (block.base_id || null) === scopeBaseId
  );

  if (visibleBlocks.length === 0) return "";

  const groups = OVERVIEW_CATEGORIES.map((category) => ({
    category,
    blocks: visibleBlocks.filter((block) => block.category === category).sort(compareByOverviewSortOrder),
  })).filter((group) => group.blocks.length > 0);

  const tabs = groups
    .map(({ category }, index) => {
      const label = OVERVIEW_CATEGORY_LABELS[category] || category;
      const icon = OVERVIEW_CATEGORY_ICONS[category] || "circle-dot";
      return `
        <button
          class="guide-overview__tab${index === 0 ? " is-active" : ""}"
          role="tab"
          aria-selected="${index === 0 ? "true" : "false"}"
          data-overview-category="${escapeHtml(category)}"
          type="button"
        >
          <i data-lucide="${icon}" aria-hidden="true"></i>
          <span class="guide-overview__tab-label">${escapeHtml(label)}</span>
        </button>
      `;
    })
    .join("");

  const panels = groups
    .map(
      ({ category, blocks }, index) => `
        <div
          class="guide-overview__panel${index === 0 ? " is-active" : ""}"
          role="tabpanel"
          data-overview-panel="${escapeHtml(category)}"
          ${index === 0 ? "" : "hidden"}
        >
          ${blocks.map((block) => renderOverviewBlock(block)).join("")}
        </div>
      `
    )
    .join("");

  return `
    <section class="guide-overview-section guide-nav-anchor" id="${escapeHtml(sectionId)}" aria-label="${escapeHtml(title)}">
      <h2 class="guide-overview-section__title">${escapeHtml(title)}</h2>
      <div class="panel guide-overview">
        <div class="guide-overview__tabs" role="tablist" aria-label="${escapeHtml(title)} categories">${tabs}</div>
        <div class="guide-overview__panels">${panels}</div>
      </div>
    </section>
  `;
}

// Nav entries for the overview sections ("Trip Overview" / "{Base} Overview"),
// each keyed to where it inserts relative to the day list: beforeDayNumber
// null sorts first (before Day 1); a day number inserts right before that
// day's own nav item (the day it's a base transition for).
export function getOverviewNavEntries(days, bases, overviewBlocks) {
  const entries = [];
  const visibleBlocks = filterOverviewBlocksForViewer(overviewBlocks);

  if (visibleBlocks.some((block) => !block.base_id)) {
    entries.push({ beforeDayNumber: null, id: "guide-trip-overview", label: "Trip Overview" });
  }

  const transitionDayNumbers = getBaseTransitionDayNumbers(days);
  [...days]
    .sort((a, b) => a.day_number - b.day_number)
    .forEach((day) => {
      if (!day.base_id || !transitionDayNumbers.has(day.day_number)) return;
      if (!visibleBlocks.some((block) => block.base_id === day.base_id)) return;

      const base = bases.find((b) => b.id === day.base_id);
      const baseName = base?.name || base?.location_name || "This base";
      entries.push({
        beforeDayNumber: day.day_number,
        id: `guide-base-overview-${day.base_id}`,
        label: `${baseName} Overview`,
      });
    });

  return entries;
}

export function renderOverviewNavItem(entry) {
  return `
    <button
      class="guide-nav-item guide-nav-item--overview"
      data-nav-id="${escapeHtml(entry.id)}"
      type="button"
      aria-label="Go to ${escapeHtml(entry.label)}"
    >
      <span class="guide-nav-item__label">${escapeHtml(entry.label)}</span>
    </button>
  `;
}

// ---------------------------------------------------------------------------
// Day header
// ---------------------------------------------------------------------------

function renderDayHeader(day, base, startDate) {
  const dateLabel = startDate ? formatNavDayDate(startDate, day.day_number) : "";
  const baseName = base?.name || base?.location_name || "";

  let dowLabel = "";
  if (startDate) {
    const date = getTripDateByDayNumber(startDate, day.day_number);
    if (date) {
      dowLabel = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
    }
  }

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
      ${checkOutBands.map((b) => renderLodgingBand(b.lodging, "check-out")).join("")}
      ${checkInBands.map((b) => renderLodgingBand(b.lodging, "check-in")).join("")}
      ${sortedItems.map((item) => renderGuideItemCard(item, viewerRole)).join("")}
      ${!hasContent ? `<p class="guide-day-empty muted">Nothing planned for this day yet.</p>` : ""}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Day section (lazy placeholder or full)
// ---------------------------------------------------------------------------

function renderDaySection(day, sortedItems, viewerRole, dayLodgingBands, bases, startDate, isLazy) {
  if (isLazy) {
    return `
      <section class="guide-day-section guide-nav-anchor" id="guide-day-${day.day_number}" data-day-number="${day.day_number}" aria-label="Day ${day.day_number}">
        <div class="guide-day-placeholder" data-lazy-day="${day.day_number}"></div>
      </section>
    `;
  }

  return `
    <section class="guide-day-section guide-nav-anchor" id="guide-day-${day.day_number}" data-day-number="${day.day_number}" aria-label="Day ${day.day_number}">
      ${renderFullDayContent(day, sortedItems, viewerRole, dayLodgingBands, bases, startDate)}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Day nav (sidebar on desktop, pills on mobile)
// ---------------------------------------------------------------------------

export function renderGuideDayNav(days, trip, todayDayNumber, overviewNavEntries = []) {
  const tripEntry = overviewNavEntries.find((entry) => entry.beforeDayNumber === null);

  const dayItems = days
    .map((day) => {
      const baseEntry = overviewNavEntries.find((entry) => entry.beforeDayNumber === day.day_number);
      const dateLabel = trip.start_date ? formatNavDayDate(trip.start_date, day.day_number) : "";
      const isToday = todayDayNumber === day.day_number;

      return `
        ${baseEntry ? renderOverviewNavItem(baseEntry) : ""}
        <button
          class="guide-nav-item${isToday ? " is-today" : ""}"
          data-nav-id="guide-day-${day.day_number}"
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

  const items = `${tripEntry ? renderOverviewNavItem(tripEntry) : ""}${dayItems}`;

  return `<nav class="guide-day-nav" aria-label="Day navigation">${items}</nav>`;
}

// ---------------------------------------------------------------------------
// Hero section (spec §4)
// ---------------------------------------------------------------------------

function renderJournalTabButton(trip, viewerRole) {
  const derivedStatus = deriveTripStatus(trip);
  const isJournalEnabled = derivedStatus === "traveling" || derivedStatus === "past";
  const disabledJournalTab = `<button class="guide-hero__tab" role="tab" aria-selected="false" disabled title="Available when your trip is Active or complete" type="button">Journal</button>`;

  if (viewerRole === "public") {
    if (!trip.is_journal_public) return "";
    return isJournalEnabled
      ? `<button class="guide-hero__tab" role="tab" aria-selected="false" data-guide-tab="journal" type="button">Journal</button>`
      : disabledJournalTab;
  }

  if (isJournalEnabled) {
    return `<button class="guide-hero__tab" role="tab" aria-selected="false" data-guide-tab="journal" type="button">Journal</button>`;
  }

  return disabledJournalTab;
}

function renderGuideHero(trip, bases, members, isMember, heroPhotoUrl, derivedStatus, viewerRole) {
  const baseNames = bases.length > 1
    ? bases.map((b) => b.name || b.location_name || "").filter(Boolean).join(" → ")
    : "";

  const journalTab = renderJournalTabButton(trip, viewerRole);

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
          <span class="guide-hero__status-pill" data-derived-status="${escapeHtml(derivedStatus)}">${escapeHtml(formatStatusLabel(derivedStatus))}</span>
        </div>
        ${isMember ? renderMemberAvatars(members) : ""}
        <div class="guide-hero__tabs" role="tablist" aria-label="View mode">
          <button class="guide-hero__tab is-active" role="tab" aria-selected="true" data-guide-tab="itinerary" type="button">Itinerary</button>
          ${journalTab}
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
  const { trip, bases, days, items, overviewBlocks = [], members, viewerRole } = state;
  const derivedStatus = deriveTripStatus(trip);
  const isMember = viewerRole !== "public";
  const heroPhotoUrl = getTripHeroPhotoUrl(trip);
  const todayDayNumber = getTodayDayNumber(trip);

  const visibleItems = filterItemsForViewer(items, viewerRole);
  const statItems = isMember ? items : visibleItems;
  const statTiles = getTripStatTiles(trip, bases, statItems);
  const lodgingBands = getLodgingBands(visibleItems, bases, days, trip.start_date);
  const lodgingBandItemIds = new Set(lodgingBands.map((b) => b.lodging.id));
  const baseTransitionDayNumbers = getBaseTransitionDayNumbers(days);
  const overviewNavEntries = getOverviewNavEntries(days, bases, overviewBlocks);

  const tripOverviewHtml = renderOverviewSection(null, overviewBlocks, "Trip Overview", "guide-trip-overview");

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
      const dayBase = bases.find((b) => b.id === day.base_id);
      const baseName = dayBase?.name || dayBase?.location_name || "This base";
      const baseOverviewHtml = baseTransitionDayNumbers.has(day.day_number)
        ? renderOverviewSection(day.base_id, overviewBlocks, `${baseName} Overview`, `guide-base-overview-${day.base_id}`)
        : "";

      return baseOverviewHtml + renderDaySection(day, sorted, viewerRole, dayBands, bases, trip.start_date, isLazy);
    })
    .join("");

  return `
    ${renderGuideHero(trip, bases, members, isMember, heroPhotoUrl, derivedStatus, viewerRole)}
    <div class="guide-body">
      <div class="guide-day-nav-shell">
        ${renderGuideDayNav(days, trip, todayDayNumber, overviewNavEntries)}
      </div>
      <div class="guide-content">
        <section class="trip-stat-tiles guide-trip-stat-tiles" aria-label="Trip stats">
          ${statTiles.map((tile) => `
            <article class="panel trip-stat-tile">
              <h3>${tile.count}</h3>
              <p>${tile.label}</p>
            </article>
          `).join("")}
        </section>
        ${tripOverviewHtml}
        ${daySections}
      </div>
    </div>
  `;
}
