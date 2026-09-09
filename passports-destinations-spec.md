# Destinations — Spec (Board + Map)

**Status:** Board core, the Wishlist detail/edit experience, and board movement/interactions are all shipped (`chrisaug21/passports` PR #63, then PR #65, then PR #68). The Map phase is next and not yet started.

**Progress:** Phase 0 shipped and merged in PR #61. Navigation shipped and merged in PR #62. Board core shipped in PR #63. Wishlist destination detail modal — editing, notes preview, promote-to-Planning — shipped in PR #65. Board movement/interactions — Wishlist drag-to-reorder, cross-column drag (Wishlist ↔ Planning), and Planning → Wishlist demotion from the trip settings modal — shipped in PR #68. Map and destination-specific edit views beyond the Wishlist detail modal are still ahead.

**Audience:** A fresh Claude Code session with no memory of the design conversation. Read this whole document before writing any code.

## Current Handoff — After Board Movement/Interactions (PR #68)

The board (`/app/destinations`, `src/features/destinations/destinations-page.js`) now supports the full Wishlist lifecycle, including movement between columns:

- Three columns — **Wishlist**, **Planning** (includes `active`), **Archive** — with compact cards (cropped cover image, wrapping title, plain date text, `Starting soon` pill on Planning cards within 14 days of `start_date`).
- Mobile keeps columns side by side in a horizontal scroll container rather than stacking them.
- Lightweight creation (title required; description, target year/month, and cover photo optional) via `createDestination()` in `src/services/trips-service.js`.
- Clicking a Wishlist card opens a detail modal (not the full Plan view) that supports editing title/description/target year-month/photo (`updateDestination()`), a notes preview linking into the full Notes page, and **Promote to Planning** (`promoteDestinationToTrip()`) — prompts for trip length and start date, then scaffolds bases/days like normal trip creation.
- Clicking a Planning card opens the full Plan view (Guide/Itinerary if `active`); clicking an Archive card opens Guide/Journal.
- Undated Wishlist cards can be dragged to reorder within the Wishlist column; dragging a Wishlist card into Planning or a Planning card into Wishlist opens the existing promote/demote confirmation flow rather than moving the card directly. See "Board movement/interactions — shipped in PR #68" below for the full mechanics.
- Schema migration is checked in at `sql/add_destination_board_fields.sql`, already run against the remote Supabase database. `trips` fields used by the board: `target_year`, `target_month`, `sort_order`.

Recommended next PR — the **Map** phase: base coordinates, explicit geocoded location search, a fourth persistent nav item at `/app/map`, and clustered status-filtered pins (see "Map view" below).

## Board movement/interactions — shipped in PR #68

**Wishlist reordering (undated cards only), via a unified pointer-based drag.** Cards with a target date sort chronologically among themselves; only cards with no target date are manually reorderable, per the existing sort rule below. Rather than the browser's native HTML5 drag-and-drop API, both mouse and touch share one Pointer Events–based drag implementation (`beginBoardDrag` in `destinations-page.js`): a mouse drag starts immediately on pointerdown, while touch adds a ~350ms hold before arming the drag, so an ordinary horizontal swipe across the board isn't mistaken for picking up a card. On drop, `reorderWishlistDestinations()` (new bulk-write function in `trips-service.js`) persists `sort_order` for the affected undated cards.

**Cross-column drag was added, and reconciles with the promotion/demotion flows rather than bypassing them.** This was explicitly out of scope in the original plan for this phase, on the assumption a drag gesture couldn't replace the promote modal's trip-length/start-date prompt. It shipped anyway, but as a drag-to-*open the existing modal* gesture, not a drag-to-directly-change-status gesture: dragging a Wishlist card onto Planning opens the same trip-length/start-date promote modal described below; dragging a Planning card onto Wishlist opens the same demote confirmation described below. If the drop is cancelled, the card visually snaps back to its origin column. This also absorbed the "second, equivalent entry point on the board" called for below — there's no separate quick-action button on Planning cards, since the drag gesture itself now serves that purpose.

**A drag handle (grip icon) appears on every card that supports some form of drag** — undated Wishlist (reorder + cross-column), dated Wishlist (cross-column only, since chronological sort makes in-column reorder a no-op), and Planning (cross-column only) — not only on undated cards as originally planned. Its accessible label distinguishes the two purposes ("Reorder {title}" vs. "Drag {title} to a different column"). Dragging a dated Wishlist card within its own column shows a toast ("This trip has a date assigned. Change its date to re-order it.") instead of silently doing nothing.

**Planning → Wishlist demotion, as a settings-modal action next to Delete Trip — shipped as planned.** Both live as icon-only destructive-style actions in the trip settings modal's sticky action row (`src/features/trip/detail/trip-settings-controller.js`):
- Delete Trip is now an icon-only button (trash icon), replacing the old text link.
- "Move to Wishlist" (bookmark icon) sits next to it, shown only when `trip.status === "planning"`.
- Both confirm via a modal matching the existing Delete Trip / Move to Next Trip pattern; the Move to Wishlist confirm warns only that the trip's dates will be cleared (bases, days, items, notes, and photos all stay intact).
- `demoteTripToWishlist()` (new function in `trips-service.js`) sets `status = 'destinations'`, clears `start_date`, and places the trip at the **top** of the undated-Wishlist group (lower `sort_order` than the current minimum) — a demoted trip reads as a recent return to the list, not buried under long-standing someday ideas. The board's drag-triggered demote confirm calls the same function; it's a separate, near-duplicate modal implementation in `destinations-page.js` rather than a shared component, since the two live in very different rendering contexts (full trip settings form vs. the board).

**Manual Archive movement is still out of scope**, unchanged from the original plan — still purely date-driven per Phase 0 (a `done` trip already reopens automatically if its dates move back into the future).

## Why this exists

A planning/dreaming layer that sits above individual trips: a kanban-style board of places the user has been, is planning, or wants to go someday — plus, as an immediate follow-up phase, a world map that plots the same places as toggleable pins.

## Decisions

Settled in discussion, not open for re-litigation unless something below changes the calculus:

- **Naming:** the pre-planning column/status is labeled **"Wishlist"** in the UI. The internal `status` column value stays `destinations` regardless.
- **Navigation:** a full, persistent top nav on desktop, a bottom tab bar on mobile (try it first; side nav is the documented fallback) — new IA territory for this app (before PR #62 there was no persistent multi-item nav, just a topbar with brand/account-menu). PR #62 shipped three items: **Trips** (today's Dashboard — planning/active trips; see "Navigation" below on the label), **Destinations** (this feature), and **Archive** (past/done trips, promoted off the Dashboard into its own page). The Map phase should add **Map** as a fourth top-nav / bottom-tab item at `/app/map`, not as a Board | Map toggle inside Destinations. The map is spatial browsing/exploration rather than board lifecycle management, and four nav items still fit the product IA.
- **Map timing:** not "someday" — a near-term follow-up after the board/detail work, not bundled into PR #63. Significant enough scope on its own to warrant its own PR, but close enough behind that it should stay warm in this spec rather than be revisited cold later.
- **Status authority:** shipped in Phase 0. The stored `trips.status` column is now the single source of truth for trip lifecycle state, auto-advanced by date, replacing the Dashboard's separate `deriveTripStatus`-only display logic.
- **Map pin coordinates:** explicit geocoded location search — not manual pin-dragging, not blind auto-geocoding of free text, and not live autocomplete. The user types a place and intentionally searches with a **Search Location** button; pressing Enter can trigger the same search as a convenience. Results are shown as a selectable list so the user confirms the exact place before coordinates are saved. Start with **Nominatim** (OpenStreetMap's free geocoding service) because it needs no API key or new env var, but design the geocoder integration behind a small config/helper so a different provider can replace it later. See "Map view" below.
- **Map pins are per-base, not per-trip:** coordinates live on `trip_bases`, not `trips`. A multi-base trip shows one pin per base.
- **Wishlist destinations should get a candidate base at creation time:** now that the map is real, lightweight Wishlist creation should ask for a required mapped location. Creating a Wishlist destination creates the `trips` row plus one `trip_bases` candidate row with `location_name`, `lat`, and `lng`, but still no days and no full planning scaffold. If a Planning trip is later demoted back to Wishlist, preserve all existing bases exactly as-is.
- **Map filter labels should use the app's lifecycle language:** use **Wishlist**, **Planning**, **Active**, and **Archive** instead of broader labels like Want to Go / Going / Been. This is more consistent with the board and avoids "Going" awkwardly covering both future and current trips. On mobile, tuck these filters behind a filter button to start.
- **Missing coordinates:** the map should include a non-scary maintenance state for trips/bases without coordinates, e.g. "3 places need locations," with rows that open the relevant edit/create flow. Hide coordinate-less bases from the map pins themselves, but make them discoverable so the user can fix them.
- **Editing location names:** do not automatically clear existing `lat`/`lng` when a base's free-text `location_name` changes. The text field has historically been a label, not a strict geospatial source of truth, and the user may simply be renaming or clarifying it. Coordinates should change only when the user selects a new geocoded result.
- **Provider swappability:** start with OpenStreetMap/Nominatim, but keep map tile URL/attribution and geocoder search/normalization in small dedicated helpers/config rather than scattering provider-specific URLs through UI code.
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

On `trip_bases` (Map phase): **`lat`**/**`lng`** (numeric, nullable) — one pin per base, populated by explicit geocoded search described in "Map view" below, not typed in manually. Consider adding optional provider metadata later only if it becomes useful; the first pass does not need it.

## Kanban board — shipped baseline in PR #63

Columns, left to right: **Wishlist** (`status = 'destinations'`) → **Planning** (`status = 'planning'` or `active`) → **Archive** (`status = 'done'`).

**Manual movement — drag-to-reorder and cross-column drag — shipped in PR #68.** See "Board movement/interactions — shipped in PR #68" below for the full mechanics.

**Wishlist → Planning is the key manual transition.** Dragging a card out of Wishlist onto Planning opens the same "new trip" prompt (trip length, start date) that trip creation uses today, runs the same base/day auto-scaffolding, and flips `status` to `planning`.

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

## Lightweight destination creation — shipped baseline in PR #63, revised by Map phase

The board shipped with a genuinely lighter create path. A Wishlist entry can currently be created with **title only**, plus optional description, target year/month, and uploaded cover photo. There is no length/date prompt and no base/day scaffolding. It inserts directly with `status = 'destinations'`; `trip_length` is set to `1` because the column is `NOT NULL`, but it is meaningless until promoted and is not shown in the Wishlist UI.

Promote to Planning shipped in PR #65. It triggers the full creation/planning flow — prompting for the details it still needs, then scaffolding bases/days exactly like a new trip does today.

For the Map phase, revise this flow: a new Wishlist destination should require a mapped location in addition to the destination title. The UI should keep this lightweight — type a place, click **Search Location** (or press Enter), choose one result, then save. Behind the scenes the app should create one candidate base for the Wishlist destination with the selected `location_name`, `lat`, and `lng`, but still skip days and planning scaffolding. Description, target date, and uploaded cover photo remain optional.

Promotion should reuse any existing Wishlist/candidate bases. If a Wishlist destination already has one or more bases, do not create a duplicate default base named after the trip; scaffold days against the existing bases and preserve their coordinates. If a Wishlist entry somehow has no bases, fall back to the current default-base behavior.

## Wishlist entry scope — what a destination can hold before it's a real trip

The guiding line: **Wishlist is about deciding and dreaming; Planning is about executing.** Because a destination is a trip row, none of the following needs new schema — the only real decisions are which of these the lightweight Wishlist detail view actually surfaces:

- **Title, description, target date** — creation shipped; editing these fields after creation still needs the lightweight Wishlist detail/edit view.
- **Notes** — already free. `trip_notes` is `trip_id`-scoped with no dependency on bases, days, or `status` — a Wishlist entry can hold notes today with zero schema work. Surface the existing Notes page/UI for a Wishlist entry same as for a real trip.
- **Cover photo** — already free the same way (a trip-level primary photo doesn't require a base to exist).
- **Lightweight "candidate" bases** — a smaller version of adding a base: name + a user-confirmed geocoded location from explicit search, but no `date_start`/`date_end` and no days generated. This matters beyond just organization — **it's what lets a Wishlist entry have a pin on the map at all**, since coordinates live on `trip_bases`, not `trips`. Without this, a Wishlist destination would have nowhere to attach a pin. The first Map phase does not need to surface base lists in the Wishlist board cards or detail modal unless it becomes necessary; avoid cluttering the existing modal just to expose data the map can already use.
- **A loose backlog of items** — `trip_items.base_id` and `.day_id` are *both* already independently nullable at the database level (an existing, deliberate rule, documented in `CLAUDE.md`, originally for inbound/outbound transport items). That means idea-stage items ("try this restaurant," "see this museum") can already sit on a trip with no bases or days at all. A Wishlist entry can hold this kind of unorganized backlog with no schema change; promoting to Planning doesn't require transforming this data, it's already sitting there ready to be dragged onto a real day.

**Surfacing the backlog on the card itself is deferred.** A future Wishlist card with attached items should show a count (e.g. "12 ideas saved"). Tapping/clicking it can peek at item titles — a simple inline expand, bottom sheet, popover, or lightweight destination detail affordance, but not hover-only. This should be revisited in a later Wishlist/backlog pass; it is not required for the first Map phase.

**Status can move backward (Planning → Wishlist)** — see "Board movement/interactions — shipped in PR #68" above for the entry points and confirmation flow. `day_number` has no dependency on real dates already, so nothing breaks by moving back and forth.

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

The Map phase should add:

- **Map** — a fourth persistent nav item (`/app/map`) for spatial browsing across the same trips/bases. This should be a separate route, not a view-mode toggle on `/app/destinations`.

**Why "Trips," not "Planning":** this app already uses "Plan view" as the established term for a single trip's detail/editing screen (see `CLAUDE.md`'s "Views" section). "Trips" avoids colliding with that and is grammatically parallel to "Destinations"/"Archive."

**Archive (nav) and the board's Archive column coexist at different depths:** the board's last column is **Archive** (not "Done," for label consistency with the nav item) — a compact card per done trip. The **Archive nav item** stays the deeper, dedicated browsing page. Same underlying `status = 'done'` trips, two views at different depths.

**Visual treatment, as shipped:**
- **Desktop:** the nav sits inline inside the topbar itself (not a separate bar/row) — in `topbar__left`, right after the brand logo, separated by a vertical divider. Items are **plain text links**: no border, no background, no icons, and deliberately **no active/current-page indicator** (with only three flat, self-evident sections, the nav's job is just letting people move between them, not showing "you are here"). Hover only changes the text color to the app's structural blue (`--color-structure`) — the same blue used for stat-tile numbers on the trip detail page.
- **Mobile (<840px):** the same nav markup detaches into a fixed bottom tab bar (icon over label per item) via CSS alone — no separate mobile component. Icons only render here; they're hidden on desktop.
- Component lives in `src/features/shared/app-nav.js` (markup + click wiring), rendered inside `renderAppShell` in `bootstrap.js`.
- The old contextual "Dashboard" breadcrumb link (previously shown only inside a trip) was removed entirely — the persistent nav covers that job everywhere a session exists now.
- Trips and Archive each got a page header using the same display-font style Notes/Prep pages already use (`.dashboard-header h1` in `dashboard.css`): Trips reads "Upcoming Trips," Archive reads "Archive of Past Trips."

## Map view (next major phase after Wishlist detail/movement)

- **Route/nav:** add Map as a fourth persistent nav item at `/app/map`. Do not put it behind a Board | Map toggle on `/app/destinations`; the map is a different browsing mode, not a sub-state of the board. Desktop top nav and mobile bottom tab nav should both include it.
- **Library:** [Leaflet](https://leafletjs.com/), loaded via a CDN `<script>` tag — same loading pattern this app already uses for Lucide, no npm dependency needed in `src/`. Start with free OpenStreetMap tiles because they need no API key and are plenty for validating the product shape. OSM tile attribution must remain visible.
- **Provider configuration:** isolate tile URL/attribution and geocoder endpoint/result normalization in dedicated map/geocoder helpers. Do not hardcode provider URLs and attribution strings directly throughout UI modules. This lets the app swap to MapTiler, Stadia, Thunderforest, Mapbox, or another provider later without rewriting the map screen.
- **Pin coordinates:** explicit geocoded search when adding/editing a base and when creating a Wishlist destination. The user types a place, clicks **Search Location** (or presses Enter), then chooses from disambiguated results. This is intentionally not live autocomplete. Start with **Nominatim** (OpenStreetMap, free, no API key) and keep requests user-initiated so the app stays within the service's usage policy. Populate `trip_bases.lat`/`lng` alongside the existing free-text `location_name`; coordinates are not typed manually.
- **Wishlist creation:** new Wishlist destinations should require a mapped location. Creating the destination also creates one candidate base with the chosen place's `location_name`, `lat`, and `lng`, but does not create days. Optional description, target year/month, and cover photo stay as-is.
- **Promotion/demotion:** promotion should reuse existing Wishlist bases and their coordinates when scaffolding the trip. Demotion from Planning to Wishlist should preserve all bases and coordinates exactly as they are today; no board-card base list is needed in the first pass.
- **Editing location names:** changing the free-text `location_name` should not clear existing coordinates automatically. Coordinates should update only when the user selects a new geocoded result.
- **One pin per base, not per trip** — a multi-base trip shows one pin per base once coordinates exist.
- **Legibility at different zoom levels:** once multiple pins sit close together at a world/continent zoom (several Japan destinations, say), they need to cluster into a single "N places" marker that expands on zoom-in. This is a mature, drop-in plugin (Leaflet.markercluster) — not something to build from scratch.
- **Filters:** use the app's lifecycle labels directly: **Wishlist** (`destinations`), **Planning** (`planning`), **Active** (`active`), and **Archive** (`done`). Desktop can keep these visible as filter chips. Mobile should tuck them behind a filter button to start.
- **Missing coordinates:** bases without `lat`/`lng` should not create pins, but the map page should show a helpful maintenance state such as "3 places need locations." Rows should point the user toward the relevant edit flow so missing pins are fixable, not mysterious.
- **Data loading:** the current Destinations board data only loads trip rows and primary trip photos. The Map route needs trip rows plus active bases (`id`, `trip_id`, `name`, `location_name`, `lat`, `lng`, `sort_order`) and enough trip metadata to group/filter/open cards.
- **Related idea, noted for later (not in scope here):** once bases have coordinates, the same map component could show up on a trip's own Overview content — a "where you're going on this trip" map alongside the itinerary, not just the world-level Destinations map. Worth remembering once Phase B's map component exists, since most of the plumbing (coordinates, Leaflet setup) would already be there.

### Map provider upgrade options for later

Start with OpenStreetMap tiles and Nominatim geocoding for the first Map phase. Keep the code swappable, then revisit these if OSM feels too plain or if the search UX needs a more polished provider:

- **MapTiler Cloud:** prettier map styles with a free personal/non-commercial tier. Requires an API key and shows MapTiler attribution/branding on the free plan.
- **Stadia Maps:** polished OpenMapTiles-based styles with a free non-commercial tier. Requires an API key/account.
- **Thunderforest:** distinctive styled maps with a hobby/free tier. Requires an API key.
- **Mapbox:** most polished all-in-one option for tiles and geocoding, with a generous free tier for small apps but usage-based billing beyond that. Requires account/token setup and introduces a new env var.

## Explicitly out of scope for now

- Auto-importing travel history from another source
- Itinerary suggestions derived from map/pin data
- The public account-level board/map (see "Noted for a future pass" above — real idea, deliberately not designed in this pass)
