# Trip & Base Overview Content — Spec

**Status:** Phase 1 (schema + Plan view authoring) and Phase 3 (MCP tools) are built and merged. Guide view display (Phase 2) is scoped below but not started.

**Audience:** A fresh Claude Code session with no memory of how this was scoped. Read this whole document before writing any code.

## Why this exists

Passports itineraries are structural (bases, days, items) but say nothing about the *place* — history, language basics, cultural notes, logistics (currency, outlets, weather), food & drink culture. The user hand-curates this kind of content today on a separate personal site (see the Belgium/Netherlands example the feature was scoped against — a page with sections like history, language, culture, and practical logistics per location). The goal is to bring that into Passports as structured, per-trip and per-base content that:

- A human can author from Plan view, or an LLM can author via the MCP connector (see `passports-mcp-server-spec.md`) — same data, same rules either way.
- Renders nicely in Guide view, where it does real work: pre-trip hype (reading about where you're headed builds excitement), during-trip reference, and post-trip — Guide view is also what gets shared with friends via the public `/trip/:id` link, and they're often as interested in "tell me about the place" as in the day-by-day plan. Guide view is the important surface here, not an afterthought.
- Stays out of the way in Plan view, where the priority is efficient authoring, not presentation.

## Terminology (now current in `CLAUDE.md`/`AGENTS.md`)

The app has **two views**, not three "modes" as older docs described:

- **Plan view** — private, full edit access, idea/shortlisted items visible. Overview content is authored here.
- **Guide view** (`src/features/trip/guide/`) — one rendering, filtered by `viewerRole` (owner/member/public), with two tabs matching the actual in-app labels:
  - **Itinerary tab** — day-by-day plan, phone-first, shows today's plan when the trip is Active.
  - **Journal tab** — trip memories, enabled once the trip is Active or done.
  - Public share (`/trip/:id`, no login) is Guide view with `viewerRole = "public"` — same code path, not a third page.

Overview content is scoped to **Itinerary tab** for v1 (see Open Questions — Journal tab placement is deliberately punted).

## Data model

One new table, `trip_overview_blocks`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `trip_id` | uuid, FK → `trips` | required |
| `base_id` | uuid, FK → `trip_bases`, nullable | `null` = trip-level content; set = content specific to that base. Same nullable pattern as `trip_items.base_id` — never enforce a dependency. |
| `category` | text | fixed set, see below. No Postgres enum type, but there is a `CHECK` constraint listing the allowed values — adding a category is a code change (`constants.js`) **and** a migration to widen that constraint, not a code change alone. (An earlier version of this doc claimed no migration was needed; that was wrong — confirmed by a save failure when `summary` was added to `constants.js` without updating the `CHECK`.) |
| `subtitle` | text, nullable | freeform per-block heading, e.g. "Currency & Payments", "Common Phrases", "Drinking Culture". **Optional** — for a trip/base with only one block in a category, the category label alone (always shown on the card) is often enough and a subtitle would just be restating it (e.g. a single History block doesn't need a subtitle literally saying "History"). Add a subtitle once a category has more than one block, or whenever it's otherwise useful to be more specific than the category alone. When absent, the card simply shows no subtitle line — it does **not** fall back to repeating the category name. |
| `body` | text | plain text, paragraph breaks preserved (rendered like journal entries — no markdown, no rich text editor; see Non-Goals). |
| `sort_order` | integer | controls order within the same `(trip_id, base_id, category)` group — multiple blocks per category per scope are expected and intentional (e.g. two `logistics` blocks: one for currency/payments, one for weather). |
| `is_published` | boolean, default `false` | gates visibility in Guide view (see Publish Flow below). Independent of authorship — a human-authored draft and an MCP-authored draft behave identically. |
| `source` | text: `human` \| `mcp` | provenance only, not a permission gate. Useful for UI treatment (e.g. a small "drafted via MCP" indicator on unpublished blocks in Plan view) and for future filtering/audit. |
| `created_by` | uuid, FK → `auth.users` | |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | standard — soft delete only, per repo-wide rule. Never a real `DELETE`. |

### Category taxonomy

Fixed set, seven categories. `summary` always leads (a hype-up overview, meant to be seen first); the rest are **alphabetical** in all UI pickers (add/edit dropdowns, Plan view grouping, Guide view tab row):

```text
summary, culture, food_drink, history, language, logistics, misc
```

Display labels (Title Case + `&` where natural): Summary, Culture, Food & Drink, History, Language, Logistics, Misc.

`sort_order` (per block) is independent of this category ordering and gives control over block sequence *within* a category group — the two are not in tension.

### RLS

Implemented (Phase 1) mirroring `trip_items`'s actual policy shape exactly, confirmed against `pg_policies` on the live project rather than guessed:
- `authenticated` SELECT: `is_trip_member(trip_id)` or the trip is `is_public` — members always see every block, published or draft.
- `authenticated` INSERT: `is_trip_member(trip_id) AND auth.uid() = created_by`.
- `authenticated` UPDATE: `is_trip_planner(trip_id)` OR (`is_trip_member(trip_id)` AND `created_by = auth.uid()`) — same nuance as items: planners can edit any block, travelers only their own.
- `authenticated` DELETE: `is_trip_planner(trip_id)` only.
- `anon` SELECT — one policy: `anon_select_public_trip_overview_blocks`, when `trips.is_public = true` and `is_published = true` — the curated public-share view the Publish flow below protects.
  - The "LLM planning link" (`is_planning_public`) does **not** expose overview blocks at all, unlike idea/shortlisted items which it does expose in full. An earlier `anon_select_planning_trip_overview_blocks` policy mirrored the items convention, but was removed as a deliberate decision: that link is for agent trip-planning, and overview content (history/culture/language/etc.) isn't planning-relevant the way item data is. If a planning-context use for overview content ever comes up, this would need a new, intentionally-scoped policy — not a revival of the old one.

## Publish flow

- New blocks (human or MCP-authored) default `is_published = false`. This is deliberate for both authors: it mirrors the existing idea/shortlisted-hidden-from-public convention, and specifically guards against an MCP-drafted block (e.g. an LLM writing a history blurb) landing on a shared trip before the user has read it.
- Publishing is a per-block toggle, not per-category or per-trip — you can publish "History" while "Logistics" is still a draft.
- Plan view must make draft state visually obvious (a "Draft" badge or similar) — unpublished blocks are otherwise fully visible/editable there regardless of publish state; only Guide view's public path filters on `is_published`.
- Trip owner/members viewing Guide view (not public) should see both published and unpublished blocks, likely with the same draft indicator — the point of the flag is protecting the *public* link, not hiding drafts from the trip's own people.

## Plan view (authoring) — as built in Phase 1 (revised after first-pass review)

The first pass grouped every scope into one combined panel at the bottom of the page with nested category sub-groups. Real review of that layout (a screenshot against an actual trip) found it wasted space (full-width stacked rows) and buried trip-wide/base-level content away from where you're already looking when planning that scope. Revised to:

- **Placement, not one combined section**: `renderOverviewScopeSection(scopeBaseId, overviewBlocks)` is a reusable fragment called twice —
  - Trip-wide (`scopeBaseId = null`): wrapped in its own panel directly under the trip header, before the stat tiles — visible immediately, near trip settings.
  - Per-base: called from `days-view-controller.js`'s `renderBaseDaysSection`, injected between that base's photo/name header and its day-card grid — so it's colocated with the base you're already looking at, not a separate flat list you have to scroll to and match up mentally.
- **Flat card grid, not nested category groups**: no more category sub-headings/boxes. Every block in a scope renders as one card in a responsive grid (`overview-card-grid`, `repeat(3, minmax(0, var(--trip-detail-grid-card-width)))` — the same 3→2→1 column breakpoint pattern `day-card-grid`/`allocation-list` already use), each card carrying its own category icon + label so the grouping is legible per-card instead of via a wrapping box. Cards are ordered category-then-`sort_order` internally (so the per-category reorder groups stay contiguous) without a visible seam between categories.
- **Category icons** — reuses the lucide-icon-per-subtype convention `getItemIconName` already establishes for items: `summary` → `flame`, `culture` → `palette`, `food_drink` → `utensils`, `history` → `landmark`, `language` → `languages`, `logistics` → `compass`, `misc` → `sparkles`.
- **Subtitle is optional** (schema: `alter table trip_overview_blocks alter column subtitle drop not null`, migration `make_overview_block_subtitle_optional`). The category (with its icon) always renders on the card regardless, so a card with no subtitle just omits the subtitle line rather than repeating the category name a second time as a fake title — that repetition read as an obvious bug on first review (a single History block showing both "History" the category and "History" the subtitle) and was corrected before merge, not shipped and then fixed.
- **Modal edit workflow**, as requested — but built on the lighter form pattern `trip-settings-controller.js`/`renderTripSettingsForm` already uses (render straight from the block object, read values via `FormData` on submit), not the heavier item-editor machinery (`item-editor-draft.js`'s live draft object, dirty-checking, discard-confirm). Items need that weight because of type-dependent fields and time/base/day interdependencies; overview blocks have no such coupling, so the simpler existing pattern was the better fit and is fully sufficient.
- Scope (trip-level vs. which base) is set when a block is created and is **not** editable afterward — move a block to a different base by deleting and recreating it. Category, subtitle, body, and published state are all editable.
- Delete is a "Remove" link inside the edit modal, opening the same confirm-modal pattern as item/base/trip deletion, soft-deleting via `deleted_at`.
- Manual reordering: up/down buttons per card (disabled at the top/bottom of their category group), reusing `item-ordering.js`'s generic `moveCombinedItemByStep`/`assignDaySortOrdersFromCombinedItems` helpers exactly as originally scoped — both are pure array utilities with no item-specific coupling, so no new logic was needed, just a new persistence call (`reorderOverviewBlocks` in `overview-service.js`, mirroring `batchUpdateTripItems`'s per-row-update-in-parallel shape) and the button wiring in `overview-controller.js`/`trip-detail-wire.js`. One accepted tradeoff worth knowing about: reorder groups are per-category, but since cards from different categories can sit in the same grid row, moving a card "up" a step within its category can visually jump it to a different row/column rather than sliding it one card over — functionally correct, just not a smooth visual slide, an inherent consequence of grid-wrapping cards instead of a single-column stacked list.
- No presentation-oriented tab/pill UI here — Plan view prioritizes CRUD efficiency over hype, per the discussion that led to this doc.

## Guide view (display)

This is the part that needs visual iteration — captured here as direction, not a locked spec.

**Model:** a row of category selectors, single-select, that expand the selected category's block(s) inline (accordion-style) directly beneath the row — no route change, no modal. Only categories with at least one visible block (respecting `is_published`/`viewerRole`) render a selector at all.

**Placement:**
- Trip-level: below the trip hero, above the day list — the pre-trip-hype moment, seen first.
- Base-level: at each base transition in the day nav, where `renderDayHeader` (`guide-view.js`) already surfaces the incoming base's name — content shows up exactly when someone arrives there, whether that's the traveler mid-trip or a friend scrolling day-by-day afterward.

**Visual style — open, needs iteration:**
- Explicitly **not pills** — doesn't fit this app's existing button/badge conventions.
- Two candidates to prototype: a text-style tab (underline/weight change on active, similar to the existing `guide-hero__tab` Itinerary/Journal tabs) vs. a subtle rounded-rectangle button matching other buttons in `components.css`. The existing Itinerary/Journal tab styling (`guide-hero__tab`) is a reasonable starting reference point for the text-tab option, being the closest existing analog (a small set of mutually-exclusive labeled selectors in the same view).
- **Mobile concern, flagged not resolved:** six category labels ("Food & Drink" is the long one) across a narrow viewport may not fit as a horizontal text row. Have an icon-only fallback below some breakpoint ready to prototype (each category gets one icon — reuse the `lucide` icon set already used elsewhere in the app, e.g. via `renderItemTypeIcon`'s pattern) rather than assuming text-row-with-wrapping will look acceptable.
- Whatever the final component looks like, it should work identically for trip-level and base-level instances (same component, different data), and Plan view does **not** need to match this visual treatment (see above).

## MCP server changes

Built, in `mcp-server/src/tools/` (see `passports-mcp-server-spec.md` for the auth/tool-registration pattern and phase numbering — Phases 0–3 shipped, Phase 4 (soft delete) not started):

- `list_overview_blocks` (read) — by trip, optionally filtered by `baseId`/`category`.
- `create_overview_block` (additive write) — defaults `isPublished = false`, always sets `source = "mcp"`, regardless of what the caller asks for unless the user's prompt explicitly says to publish immediately. Direct write, no propose/confirm — mirrors `create_trip_item`'s shape, since a new block isn't overwriting anything.
- `propose_update_overview_block` / `confirm_update_overview_block` — edits `subtitle`/`body`/`sortOrder`/`isPublished`/`category` on one or more existing blocks. Mirrors `propose_update_trip_item`/`confirm_update_trip_item`'s propose-then-confirm shape exactly, since this overwrites existing data. Cannot change a block's trip/base scope — that's fixed at create time (see Plan view section above); moving a block means creating a new one and deleting the old one.
- `delete_overview_block` — **deferred, not part of the current build.** The MCP server has not implemented soft delete for *anything* yet (Phase 4 of `passports-mcp-server-spec.md` is outlined but not started). This tool rides along whenever MCP Phase 4 ships, using whatever propose/confirm + audit-log shape gets established there for `propose_delete_trip_item`/`confirm_delete_trip_item` — not built ahead of it.

Reads/writes go through the same `trip_overview_blocks` table Plan view's `overview-service.js` calls, each under the connected user's own Supabase session — RLS is the real gate, same as every other MCP write in this app. The MCP tools live in their own CommonJS files (`mcp-server/src/tools/`) rather than importing `overview-service.js` directly, matching how the existing trip-item tools duplicate rather than share code with the ES-module `src/services/` layer.

## File additions — Phase 1, as built

```text
src/
  config/constants.js                     — OVERVIEW_CATEGORIES + OVERVIEW_CATEGORY_LABELS
  services/overview-service.js            — fetchTripOverviewBlocks/createOverviewBlock/updateOverviewBlock/softDeleteOverviewBlock/reorderOverviewBlocks
  services/trips-service.js               — fetchTripDetailBundle extended to fetch+return overviewBlocks alongside bases/days/items
  state/trip-store.js                     — currentOverviewBlocks + append/update/remove helpers, wired into setCurrentTripBundle/resetCurrentTrip
  state/app-store.js                      — overview editor/delete-confirm fields added to tripDetail's initial state
  features/trip/detail/
    overview-controller.js                — single file: renderOverviewScopeSection (called once per scope — trip-wide and each base), renderOverviewEditorModal, renderDeleteOverviewBlockConfirmModal, createOverviewHandlers — mirrors members-controller.js's self-contained shape rather than item-editor's multi-file split, since the feature is closer in size/complexity to members than to items
    days-view-controller.js               — renderBaseDaysSection calls renderOverviewScopeSection(row.base.id, ...) between that base's header and its day-card grid
    trip-detail-view.js / trip-detail-wire.js / trip-detail-loader.js — wired in (render calls, event bindings, state reset on trip load)
  ../trip-detail-page.js                  — createOverviewHandlers() spread into the page's handler set; overview modal states added to syncTripDetailModalState's hasOpenModal check
  styles/features/trip-overview.css       — new, imported from trip-detail.css's @import chain

mcp-server/src/
  lib/overview-fields.js                      — OVERVIEW_CATEGORIES/OVERVIEW_CATEGORY_LABELS, mirrored from src/config/constants.js (this package is plain CommonJS and can't import the app's ES modules)
  tools/list-overview-blocks.js               — list_overview_blocks
  tools/create-overview-block.js              — create_overview_block
  tools/propose-update-overview-block.js      — propose_update_overview_block
  tools/confirm-update-overview-block.js      — confirm_update_overview_block

Not yet built (Phase 2, still as scoped further down):
  features/trip/guide/overview-guide-view.js  — Guide view display
```

Supabase: `trip_overview_blocks` table + RLS policies + `trip_overview_blocks_updated_at` trigger (reusing the existing shared `update_updated_at()` function) applied directly via migration, confirmed against the live project's actual `trip_items`/`trip_bases` policies and helper functions (`is_trip_member`, `is_trip_planner`) rather than assumed from this doc's earlier draft.

## Non-goals for v1

- No markdown or rich-text editor — plain text with paragraph breaks, consistent with how journal entries already render. No new editor infra, no npm dependency added to `src/` (the no-build-step/no-npm-dependency rule for the main app is unaffected — this stays inside the existing plain-text convention).
- No structured sub-fields per category (e.g. no dedicated `currency`/`voltage` columns for `logistics`) — the subtitle+body model covers that use case without a second content shape.
- No Journal tab placement — overview content shows in the Itinerary tab only for v1 (open question below).
- No per-block permissions beyond existing planner/traveler roles.

## Open questions

1. **Journal tab** — genuinely TBD, not just unresolved-pending-a-decision. Ship Itinerary-tab-only for v1, use it for a while, then decide from real usage whether Journal tab ever gets it too, or whether it stays Itinerary-only permanently. Not a question to force an answer on before shipping.
2. **Guide view selector component** — text-tab vs. rounded-rect is a build-time call, not a pre-decided spec detail. Pick one to prototype first (whichever reads faster to build against the existing `guide-hero__tab` / `components.css` conventions), with the explicit understanding it may get swapped for the other approach — or something else entirely — on review, even pre-merge. Don't over-invest in the first choice.
3. **Empty-state handling** — confirmed: a trip/base with zero published blocks shows nothing extra in Guide view's Itinerary tab. No empty category selector, no placeholder section. Worth an explicit test case when building, but not an open design question.
