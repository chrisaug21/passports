# Destinations — Spec (Board + Map)

**Status:** Design settled — see "Decisions" below for what's locked in. Plan is five PRs: **Phase 0** (make `trips.status` authoritative — a prerequisite, not really a "Destinations" feature) → **Navigation reshuffle** → **Board core** → **Wishlist entry depth** → **Map** (an immediate follow-up once the board ships, not deferred indefinitely). "Default co-traveler" and the public account-level board/map are noted as later, separate ideas — see the bottom of this doc.

**Audience:** A fresh Claude Code session with no memory of the design conversation. Read this whole document before writing any code.

## Why this exists

A planning/dreaming layer that sits above individual trips: a kanban-style board of places the user has been, is planning, or wants to go someday — plus, as an immediate follow-up phase, a world map that plots the same places as toggleable pins (been / going / want to go).

## Decisions

Settled in discussion, not open for re-litigation unless something below changes the calculus:

- **Naming:** the pre-planning column/status is labeled **"Wishlist"** in the UI. The internal `status` column value stays `destinations` regardless.
- **Navigation:** a full, persistent top nav on desktop, a bottom tab bar on mobile (try it first; side nav is the documented fallback) — new IA territory for this app (today there's no persistent multi-item nav, just a topbar with brand/account-menu). Three items: **Trips** (today's Dashboard — planning/active trips; see "Navigation" below on the label), **Destinations** (this feature), and **Archive** (past/done trips, promoted off the Dashboard into its own page).
- **Map timing:** not "someday" — an immediate follow-up PR once the board (Phase A) ships, not bundled into the same PR. Significant enough scope on its own to warrant its own PR, but close enough behind that it should be designed now, not revisited cold later.
- **Status authority:** yes, fix now. The stored `trips.status` column becomes the single source of truth for trip lifecycle state, auto-advanced by date, replacing the Dashboard's separate `deriveTripStatus`-only logic. This is real, board-agnostic prerequisite work (Phase 0) — the board can't have meaningful Upcoming/Active/Done columns without it, and today's mismatch (stored status vs. displayed status can already disagree) needs fixing regardless of Destinations.
- **Map pin coordinates:** a geocoding-backed typeahead (type a place, pick the disambiguated match, get lat/lng for free) — not manual pin-dragging, not blind auto-geocoding of free text. Provider: **Nominatim** (OpenStreetMap's free geocoding service) — no API key, no new env var, debounced so it stays well within its light rate limit. See "Map view" below.
- **Map pins are per-base, not per-trip:** coordinates live on `trip_bases`, not `trips`. A multi-base trip shows one pin per base.
- **Collaborators:** no new permissions model needed. A destination is a trip row, so sharing one already works exactly like sharing any trip today (add them as a `trip_member`). "The board" is just "trips I'm a member of," so two people who are members of the same trips already see the same board for free. A **default co-traveler** convenience (auto-add a chosen person as a `trip_member` on every new trip/destination) removes the remaining friction — see "Later, smaller features" below. A fully public, account-level board/map ("show off your travels to friends") is a different, bigger idea — see "Noted for a future pass," not this spec.
- **Nav label:** "Trips" (not "Planning" or "Home") for the renamed Dashboard — final.
- **Status model has 4 values, not 5:** `destinations` (Wishlist, manual) → `planning` → `active` → `done`. There is no stored `upcoming` status — nothing in the app ever read or wrote it, it only ever existed as an unused entry in `TRIP_STATUSES`. "Starting soon" is a computed badge (start date within 14 days) shown on a `planning` card, not a status or a board column. The board is **4 columns**: Wishlist → Planning → Active → Archive.

## Key existing-schema finding

The live `trips.status` column has this check constraint (confirmed directly against the database):

```sql
CHECK (status = ANY (ARRAY['destinations', 'planning', 'upcoming', 'active', 'done']))
```

`'destinations'` is a valid value today, but nothing in `src/` reads, writes, or displays it, and the main `CLAUDE.md` docs don't mention it in their documented enum. The schema was set up ahead of the app for exactly this feature, then the docs went stale.

`'upcoming'` is also in the constraint but is dead: nothing in `src/` ever reads or writes it either — it appears in exactly one place in code, an unused entry in `TRIP_STATUSES`. Phase 0 narrows the constraint to drop it (see below) rather than building it out as a real status.

**This drives the core architectural decision below:** a "destination" and a "trip" should be the same database row, not a separate table. `status = 'destinations'` is the pre-planning/wishlist stage; promoting a destination into real planning is just flipping its `status` (and running the same base/day setup a normal new trip gets today) — not copying data between two systems.

## Data model

Extend `trips` directly rather than introduce a parallel table:

- **`target_year`** (int, nullable) and **`target_month`** (int 1–12, nullable, requires `target_year` if set) — a loose, optional "roughly when" date for a wishlist entry ("Nov 2027", or just "sometime in 2028"). Once a real `start_date` exists (post-promotion), display/sort prefers `start_date` and the target fields become vestigial — no need to keep them in sync.
- **`sort_order`** (int, default 0) — `trips` has no manual ordering concept today. Only meaningful for Wishlist items with no target date (see "Ordering" below) — every other column sorts by a real date instead.

On `trip_bases` (Phase B): **`lat`**/**`lng`** (numeric, nullable) — one pin per base, populated by the geocoding typeahead described in "Map view" below, not typed in manually.

## Kanban board

Columns, left to right: **Wishlist** (`status = 'destinations'`) → **Planning** → **Active** → **Archive** (`status = 'done'`).

**Only Wishlist → Planning is a manual drag.** That's the moment of commitment — dragging a card out of Wishlist should trigger the same "new trip" prompt (trip length, start date) that trip creation uses today, run the same base/day auto-scaffolding, and flip `status` to `planning`.

**Planning → Active → Archive are not manually draggable.** These reflect real date-based progress, not a manual toggle a user could contradict — enforced by Phase 0 (below), not by the board's own UI.

**"Starting soon" badge:** a Planning card whose `start_date` is within 14 days shows a small badge. This is computed at render time from the date, not a stored status and not a separate column — it's purely a visual reminder within the Planning column.

### Phase 0 — make `trips.status` authoritative (prerequisite)

[derive.js](src/lib/derive.js)'s `deriveTripStatus()` — what the Dashboard and several trip screens actually use today — only computes three states (`planning`/`traveling`/`past`) from dates, and never reads the stored `status` column at all. The stored column and the derived display value can already disagree with each other today; the board makes that mismatch impossible to ignore, since it needs to read real `status` to place a card in a column.

Call sites of the old derive-from-dates logic today: [dashboard-page.js](src/features/dashboard/dashboard-page.js), [trip-card.js](src/features/dashboard/trip-card.js), [journal-view.js](src/features/trip/guide/journal-view.js), [guide-view.js](src/features/trip/guide/guide-view.js), [trip-detail-view.js](src/features/trip/detail/trip-detail-view.js) — Phase 0 moves all of them onto the stored `status`.

Recommended approach: no new infrastructure (no Postgres cron job) — this is a personal-scale app, not a high-frequency service, so a lazy client-side correction is enough. On any trip load (trip detail, Dashboard, the board), compute what `status` *should* be from `start_date`/`trip_length`/today's date (`planning` → `active` → `done`, matching the old `planning`/`traveling`/`past` derivation one-for-one, just renamed), and if it differs from the stored value **and the current stored status isn't `destinations`**, write the corrected value back before rendering. `destinations` is the one genuinely manual, dateless state — nothing else is protected: `done` is *not* a manual/terminal state today (nothing in the app sets it except this same date-derived correction), so editing a done trip's dates back into the future must bring it back out of `done` too, not leave it stuck. Screens then read the stored `status` column directly instead of recomputing their own approximation.

**Schema change:** the live CHECK constraint on `trips.status` still allows `'upcoming'`, a dead value nothing ever writes (see "Key existing-schema finding" above). Phase 0 narrows it to `ARRAY['destinations', 'planning', 'active', 'done']` — after confirming no live row actually has `status = 'upcoming'` first, since narrowing a constraint under an existing row with that value would break.

**Ordering — persisted, not per-session, and different per column (not one global toggle):**

- **Wishlist:** items *with* a target date (`target_year`/`target_month`) sort chronologically among themselves, earliest first. Items *without* one sit below all dated items and are manually ordered via drag (`sort_order`) — there's no principled way to interleave a firm date with "sometime, no idea when," so undated items form their own manually-prioritized group beneath the dated ones.
- **Planning / Active:** chronological by `start_date`, ascending — this is already the Dashboard's existing sort for active trips today (`sortTripsByStartDate(activeTrips, "asc")`), not new logic.
- **Archive:** chronological by `start_date`, descending (most recent first) — also already the Dashboard's existing sort for past trips today, not new logic.

**Past/done trips stay visible on the board** (confirmed in earlier discussion) — this isn't just a wishlist-and-active-trips tool, it's meant to double as a travel history view too.

**Card content:** title, tagline (`description`), cover photo, and either the target date (Wishlist) or real dates (once planned). A Wishlist card with a backlog also shows an idea count (e.g. "12 ideas saved") — see "Wishlist entry scope" below for the interaction.

## Lightweight destination creation

Today's only trip-creation path ([createTripWithDefaults](src/services/trips-service.js)) always asks for `trip_length` and auto-scaffolds bases + days. A Wishlist entry needs a genuinely lighter path: **title only** (plus optional target year/month, description, cover photo) — no length/date prompt, no base/day scaffolding. Insert directly with `status = 'destinations'`; `trip_length` still needs *some* value since the column is `NOT NULL` (default `1` is fine — it's meaningless until promoted and never shown in the UI at that stage).

"Promote to Planning" (via drag, or an explicit button) is what triggers the *existing* full creation flow — prompting for the details it still needs, then scaffolding bases/days exactly like a new trip does today.

## Wishlist entry scope — what a destination can hold before it's a real trip

The guiding line: **Wishlist is about deciding and dreaming; Planning is about executing.** Because a destination is a trip row, none of the following needs new schema — the only real decisions are which of these the lightweight Wishlist detail view actually surfaces:

- **Title, description, target date** — the core fields (see "Lightweight destination creation" above).
- **Notes** — already free. `trip_notes` is `trip_id`-scoped with no dependency on bases, days, or `status` — a Wishlist entry can hold notes today with zero schema work. Surface the existing Notes page/UI for a Wishlist entry same as for a real trip.
- **Cover photo** — already free the same way (a trip-level primary photo doesn't require a base to exist).
- **Lightweight "candidate" bases** — a smaller version of adding a base: name + a geocoded location (via the Phase B typeahead), but no `date_start`/`date_end` and no days generated. This matters beyond just organization — **it's what lets a Wishlist entry have a pin on the map at all**, since coordinates live on `trip_bases`, not `trips`. Without this, a "want to go" destination would have nowhere to attach a pin.
- **A loose backlog of items** — `trip_items.base_id` and `.day_id` are *both* already independently nullable at the database level (an existing, deliberate rule, documented in `CLAUDE.md`, originally for inbound/outbound transport items). That means idea-stage items ("try this restaurant," "see this museum") can already sit on a trip with no bases or days at all. A Wishlist entry can hold this kind of unorganized backlog with no schema change; promoting to Planning doesn't require transforming this data, it's already sitting there ready to be dragged onto a real day.

**Surfacing the backlog on the card itself:** a Wishlist card with attached items shows a count (e.g. "12 ideas saved"). Tapping/clicking it peeks at the item titles — a simple inline expand or popover, not a navigation away from the board — since a hover-only interaction wouldn't work on this app's primary surface (phone, no hover). That peek is also the natural place for a nudge toward "Promote to Planning" once there's enough of a backlog to actually want to organize into a real itinerary — reusing the existing promote action from "Kanban board" above, not a second promotion mechanism.

**Status can move backward (Planning → Wishlist), and nothing is lost.** This is purely a `status` flip back to `destinations` — no delete, matching the soft-delete-only rule already governing this whole app. Any existing bases/days/items stay exactly as they are, just not surfaced by the lightweight Wishlist view while demoted; promoting forward again brings all of it back untouched. Demoting should clear `start_date` (so it doesn't read as a stale commitment next to the target-date fields) but must not touch days/items/bases. `day_number` has no dependency on real dates already, so nothing breaks by moving back and forth.

**"Move to Next Trip" should be able to target Wishlist, not just a full trip.** Checked the actual implementation ([trips-service.js:571](src/services/trips-service.js#L571), `moveItemsToNextTrip`) — today it always creates a `status: "planning"` trip, recreates matching bases with full day-scaffolding, and remaps carried-over items onto those bases. A "send to Wishlist instead" option is a small variant of the same function, not a new mechanism: create the new trip with `status: "destinations"`, create the same candidate bases *without* day-scaffolding, and attach the carried-over items to those bases with `day_id` left null — the exact backlog shape described above. ("Someday we'll go back to England and do the stuff we missed" becomes a real Wishlist card with its own leftover idea-backlog attached.) `insertTripRow` needs a `status` parameter (defaulting to `"planning"` for the existing call site) to support this.

## Later, smaller features (not blocking Phase 0/A/B)

- **Default co-traveler:** a per-user setting (e.g. a chosen partner/family member) who gets auto-added as a `trip_member` on every new trip/destination, removing the friction of manually inviting the same person every time. No new permissions model — pure automation on top of the existing per-trip membership.

## Noted for a future pass (real idea, not speccing out now)

- **A public, account-level "show off your travels" board/map.** Reusing the existing per-trip `is_public` toggle is the wrong fit — it would force marking every trip public individually, and it unlocks the wrong *depth* of data (the full Guide itinerary/journal for one trip, when a public board wants something much shallower — title, rough dates, cover photo, pin — across *many* trips at once). The right shape is probably a separate, decoupled opt-in (e.g. `show_on_public_board`, independent of `is_public`) plus a new public route rendering one user's board/map in aggregate, architecturally similar to today's trip share link but at account scope instead of trip scope. Worth designing properly once the board itself has real use behind it, not before.

## Integration points that need updating

- **Dashboard must exclude `destinations`-status trips.** [dashboard-page.js](src/features/dashboard/dashboard-page.js) currently splits trips into "active" vs "past" using `deriveTripStatus`, which treats *any* trip with no `start_date` as `"planning"` — meaning a bare-title Wishlist entry would land in the normal trip grid today, indistinguishable from a real in-progress trip. `listTripsForCurrentUser` and/or the Dashboard's own filtering need to explicitly carve out `destinations`-status rows; the board becomes their only home.
- **Guide / public share routes** should degrade gracefully for a destination with zero bases/days/items — needs a quick check, likely just an empty-state.
- **MCP tools** (`list_trips`/`get_trip`) — should these surface destinations at all, or filter them out by default? An AI agent proposing itinerary items against a dateless wishlist entry doesn't make much sense yet.
- **Unsplash hero photo auto-pull** is presumably keyed off a base's `location_name` today; a destination with no base yet would need to key off `trip.title` instead.

## Navigation

No persistent multi-item nav exists in this app today — the topbar ([bootstrap.js](src/app/bootstrap.js)) is just brand/home, a contextual "Dashboard" link (shown only inside a trip), a New Trip button, and the account menu. This is new IA territory, not an extension of an existing pattern.

**Decided:** a full, persistent top nav with three items:

- **Trips** — today's Dashboard: trips with status `planning`/`active` (Wishlist and Archive trips excluded). Clicking a trip goes to that trip's Plan view — except an Active/traveling trip, which defaults straight into Guide/Itinerary view instead, since that's what actually matters once a trip is underway.
- **Destinations** — this feature (the Wishlist → Planning → Upcoming → Active → Archive board).
- **Archive** — a dedicated home for past/done trips, moved off the Dashboard. This isn't scope creep: `CLAUDE.md`'s "Planned Future Work" already lists **"Memento/diary mode: beautiful archive view for past trips; designed share experience"** as an independent, already-intended feature. Archive is that feature's natural home in the nav, not a new concept invented for this doc.

**Why "Trips," not "Planning":** this app already uses "Plan view" as the established term for a single trip's detail/editing screen (see `CLAUDE.md`'s "Views" section). Calling the nav item "Planning" would create two different screens both conceptually called "planning" — the nav item (a list of many trips) and "Plan view" (one specific trip's screen). "Trips" avoids that collision entirely and is grammatically parallel to "Destinations"/"Archive" (three content-nouns, not a mix).

**Decided — Archive and the board's Done column coexist, at different depths:** the board's last column is renamed **Archive** (from "Done," for label consistency with the nav item) — a compact kanban card per done trip, clickable straight into that trip's Plan view, same as any other board card. Separately, the **Archive nav item** leads to its own dedicated page: a more focused, visual gallery of past trips — same photo-card treatment as today's Dashboard trip grid, just promoted to its own full page instead of a section beneath the active trips. Same underlying `status = 'done'` trips, two views at different depths (a lightweight column vs. a proper browsing page).

**Decided — mobile nav:** try the bottom tab bar as designed. Flagged concern going in: this app already has a lot of on-screen controls, and top-level nav isn't something used minute-to-minute during active planning/travel, so a bottom bar could feel like clutter for low-frequency navigation. Worth trying as specified; a side nav (slide-in drawer) is the documented fallback if the bottom bar feels like too much once it's actually in front of a phone.

## Map view (Phase B — immediate follow-up PR once the board ships)

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
