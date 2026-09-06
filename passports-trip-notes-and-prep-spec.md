# Trip Notes & Prep Checklist — Spec

**Status:** Design complete, not started. Build as two PRs:

- **PR1** — Phase 1 (header reshuffle + Guide pull-tab) bundled with Phase 2 (Notes & References). The reshuffle alone doesn't justify its own PR — it only makes sense paired with the feature (Notes) that fills the header slot it opens up.
- **PR2** — Phase 3 (Prep Checklist), on its own, once PR1 is merged. Cut PR2's branch from `main` *after* PR1 lands, not from PR1's own branch.

Each PR starts from a fresh branch cut from `main`. Do not build on top of any other in-progress branch.

**Audience:** A fresh Claude Code session with no memory of the design conversation. Read this whole document before writing any code.

## Why this exists

Three related additions to the Plan view header and to trip planning content:

1. **Header cleanup** — remove the Refresh icon button (redundant now that the app refreshes automatically on focus), and move the Guide entry point out of the icon row entirely, onto the hero photo itself as a pull-tab.
2. **Notes & References** — a place to save planning research per trip: pasted article text, recommendation lists, or a saved link, captured early in planning for later reference. Plan-only, never shown in Guide view.
3. **Prep Checklist** — a general trip-readiness todo list (book flights, get local currency, buy an outfit for a specific dinner, secure reservations, pack items, etc.), useful throughout planning, not just right before departure. Replaces the earlier, narrower idea of a "packing list."

## Views & IA

Today's Plan view header (`trip-header__actions` in [trip-detail-view.js](src/features/trip/detail/trip-detail-view.js)) has: Refresh, Edit Trip, Members, Guide, and (conditionally) Move to Next Trip.

**After this work:** Refresh is gone. Guide is gone from this row (moved to the hero pull-tab). Two new icon buttons take roughly the space that freed up: **Notes** and **Prep**. Each opens its own dedicated page — not a tab, not a modal — via a new route, the same way Guide already works as a separate page from Plan view:

- `/app/trip/:id/notes`
- `/app/trip/:id/prep`

**Why pages, not tabs or modals:** Both are lists you browse and build over a session (potentially dozens of items, growing over months of planning), not a single bounded edit — the same category Guide already occupies in this app. Modals here are reserved for quick, single-purpose actions (edit one item, confirm one delete, rename the trip). Tabbing Notes and Prep together into one page was considered and rejected — they're used at different points in the trip lifecycle (Notes early, Prep throughout but especially late) and are rarely open in the same sitting, so a shared tab strip would force an arbitrary default tab that serves neither case well.

Editing a single note, or adding/renaming one prep item, stays a **modal** — same granularity the app already uses for Overview Content blocks.

## Phase 1 — Header reshuffle + Guide pull-tab

**Remove the Refresh button:**
- Delete the `#refresh-trip-detail` button in [trip-detail-view.js](src/features/trip/detail/trip-detail-view.js) and its one binding in [trip-detail-wire.js:79](src/features/trip/detail/trip-detail-wire.js).
- Do not touch `trip-detail-focus-refresh.js` or the automatic background refresh — they share only an unrelated "is the UI busy" guard function, not the refresh action itself. This is a contained removal.

**Move Guide to a hero pull-tab:**
- Remove the `data-open-guide` icon button from `trip-header__actions`.
- Add an overlay link on Plan view's hero photo (`trip-header__media.photo-hero`), bottom-right, reading "Itinerary & Journal →" — the mirror image of Guide view's existing "← Back to planning" link, which sits top-left over Guide's hero photo ([guide-view.js:562-569](src/features/trip/guide/guide-view.js)). Reuse that same technique: a real `<a>`/`<button>` with a visible label and matching `aria-label`, legible via a gradient scrim behind it.
- Plan view's hero currently has no gradient scrim (only small corner icon-buttons for photo upload/replace) — add one scoped to the bottom-right corner where the new tab sits, not a full-image wash, so the rest of the photo is untouched.
- Must render in the no-photo empty state too (currently shows an "Add photo" placeholder) — the pull-tab is the only way to reach Guide now, so it can't be conditional on a photo existing.

## Phase 2 — Notes & References

### Schema

New table, RLS copied directly from `trip_overview_blocks`' pattern (same two roles — planner/member — used everywhere else in this app):

```sql
create table public.trip_notes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  title text not null,
  body text not null default '',
  url text,
  is_pinned boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.trip_notes enable row level security;

create policy "Members can view notes" on public.trip_notes
  for select using (is_trip_member(trip_id));

create policy "Members can insert notes" on public.trip_notes
  for insert with check (is_trip_member(trip_id) and auth.uid() = created_by);

create policy "Planners can update any note; members can update their own" on public.trip_notes
  for update using (is_trip_planner(trip_id) or (is_trip_member(trip_id) and created_by = auth.uid()))
  with check (true);

create policy "Planners can delete notes" on public.trip_notes
  for delete using (is_trip_planner(trip_id));
```

No `category`, no `base_id` (trip-level only, not per-base), no `sort_order` — see Ordering below. No `is_published` — notes are always plan-only, never surfaced in Guide view or the public share link.

### Fields

- `title` — required (a link-only save still needs something to display). ~150 character limit.
- `body` — optional. Plain multi-line text, 5,000 character limit. Paragraph breaks preserved on display (`white-space: pre-wrap`).
- `url` — optional.

All three can be present or absent independently except `title`, which is always required. A title-only placeholder note is valid. A title + url with no body is valid (the "saved a great article" case). A title + body with no url is valid (the "pasted a list of recommendations" case).

### Bullet/numbered list support (bodies only)

The edit view stays a plain `<textarea>` — no rich-text toolbar, no live formatting, no new dependency. The user types `- `, `* `, or `1. ` at the start of a line, same as typing into any plain-text app.

On **display only**, a small hand-rolled line scanner detects consecutive lines starting with one of those markers and wraps that run in a real `<ul>` (for `-`/`*`) or `<ol>` (for `1.`/`2.`/...) with `<li>` per line; everything else renders as plain paragraph text with line breaks preserved. Each line's text is HTML-escaped before being placed inside `<li>`, same as every other user-generated string in this app. Do not parse bold, italic, headers, or markdown-style links — `url` already covers links, and nothing else was asked for. No nested/indented sub-bullets in this pass.

### Card display & interaction

One consistent model regardless of whether `url` is set:

- **Title** — if `url` is present, the title is the clickable link (opens in a new tab), styled as a link rather than showing the raw URL. If no `url`, the title is plain bold text.
- **Pencil icon** — always present, opens the edit modal (title/body/url form, same shape as the Overview Content editor modal).
- **Trash icon** — always present, opens a delete-confirm modal (reuse the existing "Remove overview content?" confirm modal, reworded for notes).
- **Rest of the card body** — no click behavior. No ambiguous double-duty zones.

### Ordering

No manual reordering (no up/down arrows, no drag-and-drop, no `sort_order` column). Instead: a single `is_pinned` toggle. Pinned notes float above unpinned ones; unpinned notes sort newest-first. This covers the "I added something late that matters a lot" case without the complexity of manual sort persistence.

## Phase 3 — Prep Checklist

### Schema

Extend the existing `trip_todos` table rather than building on `trip_packing_items` (which stays in the database, unused, until/unless a future decision reuses or drops it — out of scope here). `trip_todos` is already the right shape (free-text `title`, optional `item_id` link, `is_complete`, `notes`, soft delete, and correct RLS already in place — members can view/insert/update, planners can delete):

```sql
alter table public.trip_todos add column section text;
```

`section` is free text, nullable — todos with no section render ungrouped, above/before any named sections. Groups render in the order their earliest item was added; no separate sections table, no drag-to-reorder-whole-sections in this pass. `due_phase` (already `before_trip`/`during_trip`/`after_trip`, defaulting to `before_trip`) stays hidden from the UI and defaulted — a prep checklist is inherently pre-trip by definition.

### Starter suggestion chips

Shown when the list is empty (or behind a persistent small "Suggestions" affordance once it isn't). Each chip is a one-tap "add this as a real todo" action — never pre-populated rows the user has to delete. Grouped visually for scannability, though the resulting todos are just flat/optionally-sectioned like anything else the user adds:

- **Documents & Money** — Check passport expiration · Check visa requirements · Notify bank/credit cards of travel · Get local currency or a no-foreign-fee card
- **Logistics** — Book flights · Book hotel · Book restaurant reservations · Arrange airport transport · Check baggage allowance
- **Health & Comfort** — Pack prescriptions + extra supply · Get travel insurance
- **Home & Tech** — Arrange pet/plant/mail care · Confirm cell/data plan works abroad · Download offline maps or entertainment · Confirm outlet/plug converters needed

None of these apply to every trip (especially domestic-only ones) — they're thought-starters, not defaults.

## Explicitly deferred (not this pass)

- Rich text formatting beyond bullets/numbered lists in Notes bodies
- Link preview/unfurling (fetching a title/favicon for a saved URL)
- Manual drag-and-drop reordering, for Notes or for Prep sections
- Base-level scoping for Notes (trip-level only was confirmed)
- Any decision to reuse, migrate, or drop `trip_packing_items`

## Version & branch discipline

Bump `APP_VERSION` in [src/config/constants.js](src/config/constants.js) and the matching version in `sw.js` on every push that ships code from this work, per standing repo rules. `git pull origin main` before cutting the branch; branch name `ca/<short-description>` (no issue number exists for this yet). Do not add commits to any other currently-open branch.
