# Trip & Base Overview Content — Spec

**Status:** Scoped, not started. No branch yet. This document is the output of a scoping conversation and is the starting point for implementation — likely split across multiple PRs/sessions (schema + Plan view first, Guide view display second, MCP tools third), possibly one.

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

Follows the existing trip-scoped pattern exactly (mirror `trip_items` policies):
- `authenticated` role, scoped via `trip_members` (planner or traveler can read/write; matches how items work — no separate "overview editor" role for v1).
- Public/anon read policy, modeled on the `is_public` policy already used for `trip-export.js` / the public share view: **only rows where `is_published = true`** are visible to an anon/public read, regardless of `is_public` on the trip. A trip being publicly shared does not implicitly publish its draft overview content.

## Publish flow

- New blocks (human or MCP-authored) default `is_published = false`. This is deliberate for both authors: it mirrors the existing idea/shortlisted-hidden-from-public convention, and specifically guards against an MCP-drafted block (e.g. an LLM writing a history blurb) landing on a shared trip before the user has read it.
- Publishing is a per-block toggle, not per-category or per-trip — you can publish "History" while "Logistics" is still a draft.
- Plan view must make draft state visually obvious (a "Draft" badge or similar) — unpublished blocks are otherwise fully visible/editable there regardless of publish state; only Guide view's public path filters on `is_published`.
- Trip owner/members viewing Guide view (not public) should see both published and unpublished blocks, likely with the same draft indicator — the point of the flag is protecting the *public* link, not hiding drafts from the trip's own people.

## Plan view (authoring)

- New section, sibling to the existing trip-detail sections (master list, days, bases, etc. — see `src/features/trip/detail/`).
- Grouped by scope then category: Trip-level content first, then each base in trip order, each showing its populated categories alphabetically.
- Per category: "+ Add block" affordance, inline edit of `subtitle`/`body`/`is_published`, drag-or-arrow reordering for `sort_order` when a category has multiple blocks (reuse whatever reordering pattern items already use, e.g. `item-ordering.js`, rather than inventing a new one).
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

New tools in `mcp-server/` (see `passports-mcp-server-spec.md` for the auth/tool-registration pattern already established):
- `list_overview_blocks` (read) — by trip, optionally filtered by base/category.
- `create_overview_block` (additive write) — defaults `is_published = false`, `source = "mcp"`, regardless of what the caller asks for unless the user's prompt explicitly says to publish immediately (still worth a confirm step, matching the caution already applied to `create_trip_item`).
- `update_overview_block` — edit `subtitle`/`body`/`sort_order`/`is_published`/`category` on an existing block the caller owns access to.
- `delete_overview_block` — soft delete only, same rule as every other table.

Mirrors the existing `overview-service.js` (new file, `src/services/`) that Plan view also calls — one service, both surfaces (matches how the rest of the app shares services between UI and, where applicable, MCP tools calling the same Supabase tables under RLS).

## File additions (proposed, following existing conventions)

```text
src/
  config/constants.js          — add OVERVIEW_CATEGORIES (alphabetical order) + display labels
  services/overview-service.js — CRUD for trip_overview_blocks
  features/trip/detail/
    overview-controller.js     — Plan view section wiring
    overview-view.js           — Plan view rendering
  features/trip/guide/
    overview-guide-view.js     — category-selector + inline-expand rendering for Guide view
  styles/features/overview.css — new component styles (selector row, expanded block card)

mcp-server/src/tools/
  overview-blocks.js           — list/create/update/delete tools
```

## Non-goals for v1

- No markdown or rich-text editor — plain text with paragraph breaks, consistent with how journal entries already render. No new editor infra, no npm dependency added to `src/` (the no-build-step/no-npm-dependency rule for the main app is unaffected — this stays inside the existing plain-text convention).
- No structured sub-fields per category (e.g. no dedicated `currency`/`voltage` columns for `logistics`) — the subtitle+body model covers that use case without a second content shape.
- No Journal tab placement — overview content shows in the Itinerary tab only for v1 (open question below).
- No per-block permissions beyond existing planner/traveler roles.

## Open questions (resolve before or during implementation, not blocking the schema/Plan-view work)

1. **Journal tab** — should overview content ever surface there, or is Itinerary tab-only correct long-term? Journal is more retrospective/memory-focused; overview content is more "about the place" — plausible it never belongs there, but worth a deliberate call rather than a default.
2. **Guide view selector component** — needs actual visual iteration (see above) before building; treat the "text-tab vs rounded-rect, icon fallback on mobile" question as a small design pass, not a coding task.
3. **Empty-state handling** — a trip/base with zero published overview content should render nothing extra in Guide view (no empty category row) — confirm this is obviously true given "only categories with ≥1 visible block render a selector," but worth a explicit test case.
