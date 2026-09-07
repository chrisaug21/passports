# Destinations — Spec (Board + Map)

**Status:** Board core is implemented in `chrisaug21/passports` PR #63 on branch `ca/destinations-board-core`. Phase 0 and the navigation reshuffle are already merged. PR #63 is mergeable after conflict resolution and is now the current destination-board baseline. The next phase should start from this branch/PR if it is still open, or from `main` after PR #63 merges.

**Progress:** Phase 0 shipped and merged in PR #61. Navigation shipped and merged in PR #62. Board core is implemented in PR #63, including the database migration, `/app/destinations` board UI, lightweight Wishlist destination creation, optional destination photo upload, compact responsive cards, and the agreed 3-column board model. Map, Wishlist detail depth, drag-and-drop moves, and destination-specific edit/detail views are intentionally still next-phase work.

**Audience:** A fresh Claude Code session with no memory of the design conversation. Read this whole document before writing any code.

## Current Handoff — After Board Core

PR #63 implements the first real Destinations surface:

- `/app/destinations` now renders a horizontal board with **Wishlist**, **Planning**, and **Archive** columns.
- `active` trips are intentionally collapsed into **Planning**. They are rare and short-lived, so they do not get a dedicated board column.
- Mobile keeps the columns side by side in a horizontal scroll container instead of stacking them. This preserves the mental model of a board and avoids tap-based drag/drop being required in this PR.
- Destination cards are compact horizontal cards with a small cropped image, full wrapping title, plain date text, and a `Starting soon` pill when applicable.
- Cards no longer show status pills, trip descriptions, explicit promote/open/wishlist buttons, or a `Someday` label for undated Wishlist entries.
- The create-destination modal supports title, optional description, optional target year/month, and optional uploaded photo. Photo upload reuses the existing cropper and trip-level primary photo path.
- Wishlist target dates now display month + year when month exists, and no longer fall back to the old browser `Dec 1899` artifact.
- Clicking any card still opens the existing trip route. For Wishlist cards, this currently opens the full Plan view, which is a known gap for the next PR.

Important implementation notes:

- Schema migration is checked in at `sql/add_destination_board_fields.sql` and has already been run against the remote Supabase database.
- New `trips` fields used by the board: `target_year`, `target_month`, and `sort_order`.
- `createDestination()` lives in `src/services/trips-service.js` and inserts a lightweight `trips` row with `status = "destinations"` and `trip_length = 1`.
- Deferred service helpers for moving/promoting/reordering were removed from PR #63 after Codacy review because they were unused in this PR. Re-add them in the drag/drop PR when the UI actually calls them.
- Remaining Codacy noise observed on PR #63 was a stylelint configuration warning on `src/styles/features/destinations.css` (`scss_function-disallowed-list` vs `function-disallowed-list`), not an actionable app-code issue.

Recommended next PR:

1. Build the lightweight Wishlist destination detail/edit view so a Wishlist card does not open the full trip Plan view.
2. Add safe edit controls for Wishlist fields: title, description, target year/month, photo, and any early notes/backlog UI that fits the phase.
3. Add drag/drop or otherwise intuitive status movement/order controls after the detail/edit shape is clear.
4. When implementing Planning -> Wishlist demotion, show a confirmation modal because `start_date` will be cleared; keep `trip_length`, bases, days, items, notes, and photos intact.
5. After that, start the Map PR: base coordinates, geocoded location typeahead, Leaflet board/map toggle, and clustered status-filtered pins.

## Why this exists

A planning/dreaming layer that sits above individual trips: a kanban-style board of places the user has been, is planning, or wants to go someday — plus, as an immediate follow-up phase, a world map that plots the same places as toggleable pins (been / going / want to go).

## Decisions

Settled in discussion, not open for re-litigation unless something below changes the calculus:

- **Naming:** the pre-planning column/status is labeled **"Wishlist"** in the UI. The internal `status` column value stays `destinations` regardless.
- **Navigation:** a full, persistent top nav on desktop, a bottom tab bar on mobile (try it first; side nav is the documented fallback) — new IA territory for this app (today there's no persistent multi-item nav, just a topbar with brand/account-menu). Three items: **Trips** (today's Dashboard — planning/active trips; see "Navigation" below on the label), **Destinations** (this feature), and **Archive** (past/done trips, promoted off the Dashboard into its own page).
- **Map timing:** not "someday" — a near-term follow-up after the board/detail work, not bundled into PR #63. Significant enough scope on its own to warrant its own PR, but close enough behind that it should stay warm in this spec rather than be revisited cold later.
- **Status authority:** shipped in Phase 0. The stored `trips.status` column is now the single source of truth for trip lifecycle state, auto-advanced by date, replacing the Dashboard's separate `deriveTripStatus`-only display logic.
- **Map pin coordinates:** a geocoding-backed typeahead (type a place, pick the disambiguated match, get lat/lng for free) — not manual pin-dragging, not blind auto-geocoding of free text. Provider: **Nominatim** (OpenStreetMap's free geocoding service) — no API key, no new env var, debounced so it stays well within its light rate limit. See "Map view" below.
- **Map pins are per-base, not per-trip:** coordinates live on `trip_bases`, not `trips`. A multi-base trip shows one pin per base.
- **Collaborators:** no new permissions model needed. A destination is a trip row, so sharing one already works exactly like sharing any trip today (add them as a `trip_member`). "The board" is just "trips I'm a member of," so two people who are members of the same trips already see the same board for free. A **default co-traveler** convenience (auto-add a chosen person as a `trip_member` on every new trip/destination) removes the remaining friction — see "Later, smaller features" below. A fully public, account-level board/map ("show off your travels to friends") is a different, bigger idea — see "Noted for a future pass," not this spec.
- **Nav label:** "Trips" (not "Planning" or "Home") for the renamed Dashboard — final.
- **Status model has 4 stored values, but the board has 3 columns:** `destinations` (Wishlist, manual) → `planning` → `active` → `done`. There is no stored `upcoming` status — it was removed in Phase 0. "Starting soon" is a computed badge (start date within 14 days) shown on a Planning card, not a status or a board column. The board is **3 columns**: Wishlist → Planning (includes `planning` and `active`) → Archive.

## Key schema finding — historical context

Before Phase 0, the live `trips.status` column had this check constraint:

```sql
CHECK (status = ANY (ARRAY['destinations', 'planning', 'upcoming', 'active', 'done']))
```

`'destinations'` was already a valid value, but nothing in `src/` read, wrote, or displayed it. The schema had been set up ahead of the app for this feature, then the docs went stale.

`'upcoming'` was also in the constraint but was dead: nothing in `src/` ever read or wrote it. Phase 0 narrowed the constraint to `ARRAY['destinations', 'planning', 'active', 'done']` rather than building `upcoming` out as a real status.

**This drives the core architectural decision below:** a "destination" and a "trip" should be the same database row, not a separate table. `status = 'destinations'` is the pre-planning/wishlist stage; promoting a destination into real planning is just flipping its `status` (and running the same base/day setup a normal new trip gets today) — not copying data between two systems.

## Data model

Extend `trips` directly rather than introduce a parallel table:

- **`target_year`** (int, nullable) and **`target_month`** (int 1–12, nullable, requires `target_year` if set) — shipped in PR #63. These hold a loose, optional "roughly when" date for a Wishlist entry ("Nov 2027", or just "sometime in 2028"). Once a real `start_date` exists, display/sort prefers `start_date` and the target fields become vestigial — no need to keep them in sync.
- **`sort_order`** (int, default 0) — shipped in PR #63. Only meaningful for Wishlist items with no target date (see "Ordering" below) — every other column sorts by a real date instead.

On `trip_bases` (Phase B): **`lat`**/**`lng`** (numeric, nullable) — one pin per base, populated by the geocoding typeahead described in "Map view" below, not typed in manually.

## Kanban board — shipped baseline in PR #63

Columns, left to right: **Wishlist** (`status = 'destinations'`) → **Planning** (`status = 'planning'` or `active`) → **Archive** (`status = 'done'`).

**Manual movement is deferred.** The board currently opens cards but does not include drag/drop, promote/demote buttons, or manual reordering controls. That was an intentional review decision: the compact visual model should not be bent around temporary controls that will be replaced by better drag/drop or column-management UX in the next PR.

**Wishlist → Planning is still the key manual transition for a future PR.** That's the moment of commitment — dragging a card out of Wishlist should trigger the same "new trip" prompt (trip length, start date) that trip creation uses today, run the same base/day auto-scaffolding, and flip `status` to `planning`.

**Planning → Active → Archive are still date-driven.** These reflect real date-based progress, not a manual toggle a user could contradict — enforced by Phase 0, not by the board's own UI. `active` is displayed inside Planning instead of its own column.

**"Starting soon" badge:** a Planning card whose `start_date` is within 14 days shows a small badge. This is computed at render time from the date, not a stored status and not a separate column — it's purely a visual reminder within the Planning column.

### Phase 0 — make `trips.status` authoritative (shipped)

Before Phase 0, [derive.js](src/lib/derive.js)'s `deriveTripStatus()` computed three states (`planning`/`traveling`/`past`) from dates, and several screens used that derived display value instead of the stored `trips.status` column. The stored column and derived display value could already disagree; the board made that mismatch impossible to ignore, since it needs real `status` values to place cards in columns.

Phase 0 moved the old derive-from-dates call sites onto stored `status` and added lazy client-side correction. On trip load, the app computes what `status` should be from `start_date`/`trip_length`/today's date (`planning` → `active` → `done`) and writes corrections back when needed.

`destinations` is protected as the one genuinely manual, dateless state. `done` is not protected: it is just as date-derived as `planning`/`active`, so editing a done trip's dates back into the future should bring it back out of `done` too.

**Schema change:** shipped. The `trips.status` CHECK constraint now allows only `destinations`, `planning`, `active`, and `done`.

**Ordering — persisted, not per-session, and different per column (not one global toggle):**

- **Wishlist:** items *with* a target date (`target_year`/`target_month`) sort chronologically among themselves, earliest first. Items *without* one sit below all dated items and are manually ordered via drag (`sort_order`) — there's no principled way to interleave a firm date with "sometime, no idea when," so undated items form their own manually-prioritized group beneath the dated ones.
- **Planning:** `planning` and `active` trips together, chronological by `start_date`, ascending — this reuses the Dashboard's existing `sortTripsByStartDate(..., "asc")` helper.
- **Archive:** chronological by `start_date`, descending (most recent first) — also already the Dashboard's existing sort for past trips today, not new logic.

**Past/done trips stay visible on the board** (confirmed in earlier discussion) — this isn't just a wishlist-and-active-trips tool, it's meant to double as a travel history view too.

**Card content, as shipped:** full wrapping title, compact cropped cover photo, plain date text, and a `Starting soon` pill for planning trips whose `start_date` is within 14 days. Cards intentionally do not show status pills, descriptions, open/promote/wishlist buttons, or `Someday` text for undated Wishlist entries. Wishlist cards show target month + year when both exist, year-only when only a year exists, and no date line when neither exists. A Wishlist card with a backlog/count is deferred until the lightweight Wishlist detail/backlog phase.

## Lightweight destination creation — shipped baseline in PR #63

The board now has a genuinely lighter create path. A Wishlist entry can be created with **title only**, plus optional description, target year/month, and uploaded cover photo. There is no length/date prompt and no base/day scaffolding. It inserts directly with `status = 'destinations'`; `trip_length` is set to `1` because the column is `NOT NULL`, but it is meaningless until promoted and is not shown in the Wishlist UI.

"Promote to Planning" is not implemented in PR #63. When added, it should trigger the full creation/planning flow — prompting for the details it still needs, then scaffolding bases/days exactly like a new trip does today.

## Wishlist entry scope — what a destination can hold before it's a real trip

The guiding line: **Wishlist is about deciding and dreaming; Planning is about executing.** Because a destination is a trip row, none of the following needs new schema — the only real decisions are which of these the lightweight Wishlist detail view actually surfaces:

- **Title, description, target date** — creation shipped; editing these fields after creation still needs the lightweight Wishlist detail/edit view.
- **Notes** — already free. `trip_notes` is `trip_id`-scoped with no dependency on bases, days, or `status` — a Wishlist entry can hold notes today with zero schema work. Surface the existing Notes page/UI for a Wishlist entry same as for a real trip.
- **Cover photo** — already free the same way (a trip-level primary photo doesn't require a base to exist).
- **Lightweight "candidate" bases** — a smaller version of adding a base: name + a geocoded location (via the Phase B typeahead), but no `date_start`/`date_end` and no days generated. This matters beyond just organization — **it's what lets a Wishlist entry have a pin on the map at all**, since coordinates live on `trip_bases`, not `trips`. Without this, a "want to go" destination would have nowhere to attach a pin.
- **A loose backlog of items** — `trip_items.base_id` and `.day_id` are *both* already independently nullable at the database level (an existing, deliberate rule, documented in `CLAUDE.md`, originally for inbound/outbound transport items). That means idea-stage items ("try this restaurant," "see this museum") can already sit on a trip with no bases or days at all. A Wishlist entry can hold this kind of unorganized backlog with no schema change; promoting to Planning doesn't require transforming this data, it's already sitting there ready to be dragged onto a real day.

**Surfacing the backlog on the card itself is deferred.** A future Wishlist card with attached items should show a count (e.g. "12 ideas saved"). Tapping/clicking it can peek at item titles — a simple inline expand, bottom sheet, popover, or lightweight destination detail affordance, but not hover-only. This should be revisited with the next PR's destination-specific detail/edit view.

**Status can move backward (Planning → Wishlist), but it needs a confirmation modal.** Demoting should flip `status` to `destinations` and clear `start_date` so it does not read as a stale commitment next to the target-date fields. Clearing `start_date` is data loss from the user's point of view, so warn and confirm before doing it. Keep `trip_length`, bases, days, items, notes, and photos intact. `day_number` has no dependency on real dates already, so nothing breaks by moving back and forth.

**"Move to Next Trip" should be able to target Wishlist, not just a full trip.** Checked the actual implementation ([trips-service.js:571](src/services/trips-service.js#L571), `moveItemsToNextTrip`) — today it always creates a `status: "planning"` trip, recreates matching bases with full day-scaffolding, and remaps carried-over items onto those bases. A "send to Wishlist instead" option is a small variant of the same function, not a new mechanism: create the new trip with `status: "destinations"`, create the same candidate bases *without* day-scaffolding, and attach the carried-over items to those bases with `day_id` left null — the exact backlog shape described above. ("Someday we'll go back to England and do the stuff we missed" becomes a real Wishlist card with its own leftover idea-backlog attached.) `insertTripRow` already accepts a `status` parameter after PR #63.

## Later, smaller features (not blocking the next board/detail/map work)

- **Default co-traveler:** a per-user setting (e.g. a chosen partner/family member) who gets auto-added as a `trip_member` on every new trip/destination, removing the friction of manually inviting the same person every time. No new permissions model — pure automation on top of the existing per-trip membership.

## Noted for a future pass (real idea, not speccing out now)

- **A public, account-level "show off your travels" board/map.** Reusing the existing per-trip `is_public` toggle is the wrong fit — it would force marking every trip public individually, and it unlocks the wrong *depth* of data (the full Guide itinerary/journal for one trip, when a public board wants something much shallower — title, rough dates, cover photo, pin — across *many* trips at once). The right shape is probably a separate, decoupled opt-in (e.g. `show_on_public_board`, independent of `is_public`) plus a new public route rendering one user's board/map in aggregate, architecturally similar to today's trip share link but at account scope instead of trip scope. Worth designing properly once the board itself has real use behind it, not before.

## Integration points — current state

- **Dashboard excludes `destinations`-status trips.** This was already handled by the Phase 0/nav work and is relied on by PR #63.
- **Guide / public share routes** should degrade gracefully for a destination with zero bases/days/items — needs a quick check, likely just an empty-state.
- **MCP tools** (`list_trips`/`get_trip`) — should these surface destinations at all, or filter them out by default? An AI agent proposing itinerary items against a dateless wishlist entry doesn't make much sense yet.
- **Unsplash hero photo auto-pull** is not part of PR #63. Destination creation supports manual photo upload instead. A destination with no base would need any future auto-pull to key off `trip.title`.

## Navigation — shipped in PR #62, consumed by PR #63

A full, persistent nav now exists with three items, replacing the old topbar (which was just brand/home, a contextual "Dashboard" link shown only inside a trip, a New Trip button, and the account menu):

- **Trips** — the renamed Dashboard: trips with status `planning`/`active` only (`dashboard-page.js`; the old collapsible "Past Trips" section is gone). Clicking a trip goes to that trip's Plan view — except an Active/traveling trip, which defaults straight into Guide/Itinerary view instead.
- **Destinations** — now renders the board implemented in PR #63 (`src/features/destinations/destinations-page.js`). The route is `/app/destinations`.
- **Archive** — a dedicated page for past/done trips (`src/features/archive/archive-page.js`, route `/app/archive`), same photo-card treatment the old Dashboard grid used, promoted to its own full page instead of a collapsible section.

**Why "Trips," not "Planning":** this app already uses "Plan view" as the established term for a single trip's detail/editing screen (see `CLAUDE.md`'s "Views" section). "Trips" avoids colliding with that and is grammatically parallel to "Destinations"/"Archive."

**Archive (nav) and the board's Archive column coexist at different depths:** the board's last column is **Archive** (not "Done," for label consistency with the nav item) — a compact card per done trip. The **Archive nav item** stays the deeper, dedicated browsing page. Same underlying `status = 'done'` trips, two views at different depths.

**Visual treatment, as shipped:**
- **Desktop:** the nav sits inline inside the topbar itself (not a separate bar/row) — in `topbar__left`, right after the brand logo, separated by a vertical divider. Items are **plain text links**: no border, no background, no icons, and deliberately **no active/current-page indicator** (with only three flat, self-evident sections, the nav's job is just letting people move between them, not showing "you are here"). Hover only changes the text color to the app's structural blue (`--color-structure`) — the same blue used for stat-tile numbers on the trip detail page.
- **Mobile (<840px):** the same nav markup detaches into a fixed bottom tab bar (icon over label per item) via CSS alone — no separate mobile component. Icons only render here; they're hidden on desktop.
- Component lives in `src/features/shared/app-nav.js` (markup + click wiring), rendered inside `renderAppShell` in `bootstrap.js`.
- The old contextual "Dashboard" breadcrumb link (previously shown only inside a trip) was removed entirely — the persistent nav covers that job everywhere a session exists now.
- Trips and Archive each got a page header using the same display-font style Notes/Prep pages already use (`.dashboard-header h1` in `dashboard.css`): Trips reads "Upcoming Trips," Archive reads "Archive of Past Trips."

## Map view (next major phase after Wishlist detail/movement)

- **Library:** [Leaflet](https://leafletjs.com/), loaded via a CDN `<script>` tag — same loading pattern this app already uses for Lucide, no npm dependency needed in `src/`. Free OpenStreetMap tiles need no API key and are plenty for a personal-scale app. A paid tile provider (Mapbox, etc.) is prettier but adds an API key, a new env var, and usage-based billing — not worth it unless the free tiles feel wrong once seen.
- **Pin coordinates:** a geocoding-backed typeahead when adding/editing a base — type a place name, pick the correct disambiguated match from a dropdown (e.g. distinguishing two towns with the same name in different states/countries), and its lat/lng comes attached to the selection. Backed by **Nominatim** (OpenStreetMap, free, no API key) — debounce the query (~400ms after the user stops typing, minimum 3 characters) to stay well within its light rate limit. This is better than either plain manual pin-dragging (fiddly) or blind auto-geocoding of free text with no confirmation step (silent bad matches on ambiguous names) — the user always confirms the exact real place, coordinates just come along for free. Populates `trip_bases.lat`/`lng` alongside the existing free-text `location_name`, not a replacement for it.
- **One pin per base, not per trip** — a multi-base trip shows a pin for each base once promoted and planned out.
- **Legibility at different zoom levels:** once multiple pins sit close together at a world/continent zoom (several Japan destinations, say), they need to cluster into a single "N places" marker that expands on zoom-in. This is a mature, drop-in plugin (Leaflet.markercluster) — not something to build from scratch.
- **Toggleable layers:** three simple filters (Been / Going / Want to Go) mapped to groups of trip statuses, showing/hiding matching pins. Straightforward once pin data and the board both exist.
- **Where it lives:** most likely a second view mode on the same Destinations page (Board | Map, reusing the same loaded data) rather than a separate route.
- **Related idea, noted for later (not in scope here):** once bases have coordinates, the same map component could show up on a trip's own Overview content — a "where you're going on this trip" map alongside the itinerary, not just the world-level Destinations map. Worth remembering once Phase B's map component exists, since most of the plumbing (coordinates, Leaflet setup) would already be there.

## Explicitly out of scope for now

- Auto-importing travel history from another source
- Itinerary suggestions derived from map/pin data
- The public account-level board/map (see "Noted for a future pass" above — real idea, deliberately not designed in this pass)
