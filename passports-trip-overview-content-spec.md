# Trip & Base Overview Content — Spec

**Status:** Phase 1 (schema + Plan view authoring) is built on `claude/passports-overview-content-801f4t`, not yet merged. Guide view display (Phase 2) and MCP tools (Phase 3) are scoped below but not started.

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
| `category` | text | fixed set, see below. Enforced at the app layer (constants.js), not a Postgres enum type — adding a category later is a code change, not a migration. |
| `subtitle` | text | freeform per-block heading, e.g. "Currency & Payments", "Common Phrases", "Drinking Culture". Required — this is what renders as the block's title; `category` groups blocks, `subtitle` distinguishes them within a category. |
| `body` | text | plain text, paragraph breaks preserved (rendered like journal entries — no markdown, no rich text editor; see Non-Goals). |
| `sort_order` | integer | controls order within the same `(trip_id, base_id, category)` group — multiple blocks per category per scope are expected and intentional (e.g. two `logistics` blocks: one for currency/payments, one for weather). |
| `is_published` | boolean, default `false` | gates visibility in Guide view (see Publish Flow below). Independent of authorship — a human-authored draft and an MCP-authored draft behave identically. |
| `source` | text: `human` \| `mcp` | provenance only, not a permission gate. Useful for UI treatment (e.g. a small "drafted via MCP" indicator on unpublished blocks in Plan view) and for future filtering/audit. |
| `created_by` | uuid, FK → `auth.users` | |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | standard — soft delete only, per repo-wide rule. Never a real `DELETE`. |

### Category taxonomy

Fixed set, six categories, **alphabetical in all UI pickers** (add/edit dropdowns, Plan view grouping):

```
culture, food_drink, history, language, logistics, misc
```

Display labels (Title Case + `&` where natural): Culture, Food & Drink, History, Language, Logistics, Misc.

`sort_order` (per block) is independent of this alphabetical category ordering and gives control over block sequence *within* a category group — the two are not in tension.

### RLS

Implemented (Phase 1) mirroring `trip_items`'s actual policy shape exactly, confirmed against `pg_policies` on the live project rather than guessed:
- `authenticated` SELECT: `is_trip_member(trip_id)` or the trip is `is_public` — members always see every block, published or draft.
- `authenticated` INSERT: `is_trip_member(trip_id) AND auth.uid() = created_by`.
- `authenticated` UPDATE: `is_trip_planner(trip_id)` OR (`is_trip_member(trip_id)` AND `created_by = auth.uid()`) — same nuance as items: planners can edit any block, travelers only their own.
- `authenticated` DELETE: `is_trip_planner(trip_id)` only.
- `anon` SELECT — **two policies, a judgment call made during implementation, not discussed beforehand:**
  - `anon_select_planning_trip_overview_blocks`: when `trips.is_planning_public = true`, every non-deleted block is visible regardless of `is_published` — this mirrors how the "LLM planning link" already exposes idea/shortlisted items (full internal state, not a curated view), so it's treated as the same kind of full-detail share.
  - `anon_select_public_trip_overview_blocks`: when `trips.is_public = true`, only `is_published = true` blocks are visible — this is the curated share the Publish flow below is actually protecting.
  - Worth a sanity check from the user: this means turning on the "LLM planning link" shows unpublished overview drafts to whoever holds that link, same as it already does for idea-stage items. If that's not the intended behavior for overview content specifically, this policy needs revisiting — it was not an explicit decision, just the most consistent extension of the existing convention.

## Publish flow

- New blocks (human or MCP-authored) default `is_published = false`. This is deliberate for both authors: it mirrors the existing idea/shortlisted-hidden-from-public convention, and specifically guards against an MCP-drafted block (e.g. an LLM writing a history blurb) landing on a shared trip before the user has read it.
- Publishing is a per-block toggle, not per-category or per-trip — you can publish "History" while "Logistics" is still a draft.
- Plan view must make draft state visually obvious (a "Draft" badge or similar) — unpublished blocks are otherwise fully visible/editable there regardless of publish state; only Guide view's public path filters on `is_published`.
- Trip owner/members viewing Guide view (not public) should see both published and unpublished blocks, likely with the same draft indicator — the point of the flag is protecting the *public* link, not hiding drafts from the trip's own people.

## Plan view (authoring) — as built in Phase 1

- New section (`renderOverviewSection`), sibling to the existing trip-detail sections (master list, days, bases — see `src/features/trip/detail/`), rendered near the bottom of the trip detail page.
- Grouped by scope then category: Trip-level content first, then each base in trip order. A scope's category subheadings only render for categories that actually have ≥1 block — an empty scope just shows one "+ Add Content" button and a "No overview content yet" line, rather than six empty category headers. Each row shows the block's `subtitle` plus a Draft/Published badge.
- **Modal edit workflow**, as requested — but built on the lighter form pattern `trip-settings-controller.js`/`renderTripSettingsForm` already uses (render straight from the block object, read values via `FormData` on submit), not the heavier item-editor machinery (`item-editor-draft.js`'s live draft object, dirty-checking, discard-confirm). Items need that weight because of type-dependent fields and time/base/day interdependencies; overview blocks are four independent fields with no such coupling, so the simpler existing pattern was the better fit and is fully sufficient.
- Scope (trip-level vs. which base) is set when a block is created and is **not** editable afterward — move a block to a different base by deleting and recreating it. Category, subtitle, body, and published state are all editable.
- Delete is a "Remove" link inside the edit modal, opening the same confirm-modal pattern as item/base/trip deletion, soft-deleting via `deleted_at`.
- **Known gap, not built in Phase 1: no manual reordering UI.** `sort_order` is set automatically (`max existing sort_order in that scope+category, + 1`) when a block is created, but there is no drag/arrow control to reorder existing blocks afterward — the spec's original mention of reusing `item-ordering.js` for this did not get built. Low-priority since the field exists and works for that ordering to be interacted with directly in the database if needed; add it later if multiple-blocks-per-category turns out to need frequent reordering in practice.
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

New tools in `mcp-server/` (see `passports-mcp-server-spec.md` for the auth/tool-registration pattern and phase numbering already established there — Phases 0–2 shipped, Phase 3 (editing existing items) about to be built, Phase 4 (soft delete) not started):

- `list_overview_blocks` (read) — by trip, optionally filtered by base/category. Ships whenever this feature's MCP tools are built; no dependency on Phase 3/4.
- `create_overview_block` (additive write) — defaults `is_published = false`, `source = "mcp"`, regardless of what the caller asks for unless the user's prompt explicitly says to publish immediately (still worth a confirm step, matching the caution already applied to `create_trip_item`). Direct write, no propose/confirm — mirrors `create_trip_item`'s Phase 2 shape, since a new block isn't overwriting anything.
- `update_overview_block` — edit `subtitle`/`body`/`sort_order`/`is_published`/`category` on an existing block. This overwrites existing data the same way item edits do, so it likely wants the same propose-then-confirm shape Phase 3 establishes for `propose_update_trip_item`/`confirm_update_trip_item`, for consistency — worth confirming against however Phase 3 actually lands before building this.
- `delete_overview_block` — **deferred, not part of the initial build.** The MCP server has not implemented soft delete for *anything* yet (Phase 4 of `passports-mcp-server-spec.md` is outlined but not started). This tool rides along whenever MCP Phase 4 ships, using whatever propose/confirm + audit-log shape gets established there for `propose_delete_trip_item`/`confirm_delete_trip_item` — not built ahead of it.

Mirrors the existing `overview-service.js` (new file, `src/services/`) that Plan view also calls — one service, both surfaces (matches how the rest of the app shares services between UI and, where applicable, MCP tools calling the same Supabase tables under RLS).

## File additions — Phase 1, as built

```text
src/
  config/constants.js                     — OVERVIEW_CATEGORIES + OVERVIEW_CATEGORY_LABELS
  services/overview-service.js            — fetchTripOverviewBlocks/createOverviewBlock/updateOverviewBlock/softDeleteOverviewBlock
  services/trips-service.js               — fetchTripDetailBundle extended to fetch+return overviewBlocks alongside bases/days/items
  state/trip-store.js                     — currentOverviewBlocks + append/update/remove helpers, wired into setCurrentTripBundle/resetCurrentTrip
  state/app-store.js                      — overview editor/delete-confirm fields added to tripDetail's initial state
  features/trip/detail/
    overview-controller.js                — single file: renderOverviewSection, renderOverviewEditorModal, renderDeleteOverviewBlockConfirmModal, createOverviewHandlers — mirrors members-controller.js's self-contained shape rather than item-editor's multi-file split, since the feature is closer in size/complexity to members than to items
    trip-detail-view.js / trip-detail-wire.js / trip-detail-loader.js — wired in (render calls, event bindings, state reset on trip load)
  ../trip-detail-page.js                  — createOverviewHandlers() spread into the page's handler set; overview modal states added to syncTripDetailModalState's hasOpenModal check
  styles/features/trip-overview.css       — new, imported from trip-detail.css's @import chain

Not yet built (Phase 2/3, still as scoped further down):
  features/trip/guide/overview-guide-view.js  — Guide view display
mcp-server/src/tools/overview-blocks.js       — MCP tools
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
