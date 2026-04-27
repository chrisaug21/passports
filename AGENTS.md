# AGENTS.md — Passports

Project-specific instructions. Global coding standards and git discipline are in `~/.codex/AGENTS.md`.

## What This Project Is
Personal travel planner and diary PWA. Used on phone while traveling, desktop for planning, and tablet for browsing. Multi-user: Planners have full CRUD, Travelers can add items and react. Public share links expose curated read-only trip views with no login required.

## File Structure
```text
index.html                        — single HTML entry point
netlify.toml                      — build config, env var injection
src/
  app/
    app.js                        — entry point, boot, route init
    router.js                     — client-side URL router
    bootstrap.js                  — env checks, auth session boot, initial data load
  config/
    env.js                        — reads Netlify-injected env vars
    constants.js                  — statuses, item types, roles, enums, defaults
  lib/
    supabase.js                   — Supabase client init only
    format.js                     — dates, times, currency, label helpers
    sort.js                       — item/day/base sort helpers
    derive.js                     — computed values: end dates, cost totals, visible items
  services/
    auth-service.js               — sign in, sign out, session management
    trips-service.js              — trip CRUD
    bases-service.js              — base CRUD
    days-service.js               — day CRUD, day generation
    items-service.js              — item CRUD, assignment
    todos-service.js              — trip todo CRUD
    packing-service.js            — packing list CRUD
    members-service.js            — member invite, role management
    reactions-service.js          — item reactions (Phase 2)
    photos-service.js             — Unsplash fetch, photo CRUD (Phase 2)
  state/
    session-store.js              — signed-in user + auth state
    app-store.js                  — current route, filters, loading flags
    trip-store.js                 — active trip, bases, days, items, totals
  features/
    auth/                         — login-page.js, signup-page.js
    dashboard/                    — dashboard-page.js, trip-card.js, create-trip-modal.js
    trip/                         — trip-layout.js, trip-header.js, trip-nav.js, trip-settings-panel.js
    master-list/                  — master-list-page.js, item-list.js, item-row.js, item-editor-modal.js
    days/                         — days-page.js, base-tabs.js, day-card.js, day-item.js, unassigned-pool.js
    bases/                        — base-manager.js, base-form-modal.js
    todos/                        — todos-panel.js, todo-list.js, todo-form.js
    packing/                      — packing-panel.js, packing-list.js, packing-form.js
    members/                      — members-panel.js, invite-member-form.js
    public-trip/                  — public-trip-page.js, public-day-list.js
    shared/                       — modal.js, toast.js, loading-state.js, confirm-dialog.js, tabs.js
  styles/
    tokens.css                    — design tokens: colors, spacing, type, radius, z-index
    base.css                      — reset, body, typography defaults
    utilities.css                 — reusable utility classes
    layout.css                    — app shell, page grids, responsive breakpoints
    components.css                — shared UI: buttons, badges, pills, cards, modals, toasts
    features/                     — per-feature CSS files
```

## Vendored Libraries
Files in `src/lib/vendor/` are third-party libraries and must never be edited.
Do not read them for context. Do not modify them.

## Architecture
- Supabase-first. No offline writes — show error toast if Supabase unreachable on write.
- localStorage is read-only cache only. Never write trip data to localStorage.
- No frameworks, no bundlers. Plain vanilla JS with ES modules.
- Single-page app with client-side routing via router.js.
- Services talk to Supabase. Features render UI. State holds what's in memory. Never skip layers.

## Supabase Tables
| Table | Key notes |
|---|---|
| `trips` | `owner_id` FK → auth.users. `status`: planning/upcoming/active/done. `is_public` enables public share link. Soft delete via `deleted_at`. |
| `trip_bases` | Belongs to trip. `local_timezone` is IANA string (e.g. `Europe/Madrid`). Used to determine "today" when trip is Active. Soft delete via `deleted_at`. |
| `trip_days` | Belongs to trip AND base. `day_number` is 1-indexed across the entire trip. Real date derived: `start_date + (day_number - 1)`. Never stored. Soft delete via `deleted_at`. |
| `trip_items` | Core object. `base_id` and `day_id` are independently nullable — an item with `base_id = null` is trip-level (not assigned to any base). `is_anchor` boolean: anchor items require `time_start`. `time_start`/`time_end` are local time strings — no timezone attached, always assumed to be base's local timezone. Soft delete via `deleted_at`. |
| `trip_members` | `role`: planner or traveler. Trip creator is auto-added as planner via DB trigger. UNIQUE on `(trip_id, user_id)`. |
| `trip_todos` | Optional `item_id` links a todo to a specific item. `due_phase`: before_trip/during_trip/after_trip. Soft delete via `deleted_at`. |
| `trip_packing_items` | `category`: clothing/toiletries/documents/gear/other. Soft delete via `deleted_at`. |
| `trip_reactions` | One reaction per user per item. UNIQUE on `(item_id, user_id)`. `reaction`: must_do/skip/no_preference. |
| `trip_photos` | `source`: unsplash or upload. Unsplash requires `credit_name` and `credit_url` for attribution display. |

## Item Types and Fields
- `meal` — adds `meal_slot` (breakfast/brunch/lunch/dinner)
- `activity` — adds `activity_type` (arts/outdoors/sports/entertainment/sightseeing/nightlife/other)
- `transport` — adds `transport_mode` (flight/train/car/ferry/bus/other), `transport_origin`, `transport_destination`
- `lodging` — no extra type fields; check-in/check-out surface from `time_start`/`time_end`

## Item Statuses
idea → shortlisted → confirmed → reserved → done
- `confirmed` = we're doing this, no hard reservation
- `reserved` = booked with a confirmation; obligation exists

## Anchor vs Flex
- `is_anchor = true`: time is fixed; `time_start` is required; everything else plans around it
- `is_anchor = false`: time is optional; item sequences by `sort_order`
- Applies equally to all item types — meals, activities, transport, lodging

## Base/Day Assignment Rules
- `base_id` and `day_id` are independently nullable on `trip_items`
- An item with `base_id = null` is trip-level — valid and intentional (e.g. inbound/outbound flights)
- Trip-level items CAN have `day_id` set — this pins them to a day without assigning a base
- Never auto-clear `day_id` when `base_id` is set to null
- It is valid for an item to have `base_id` pointing to one base and `day_id` pointing to a day in a different base (e.g. breakfast in Sonoma on a travel day that ends in San Francisco)
- If a day is selected and it belongs to a different base than the item's current base, show a non-blocking hint — never auto-update or enforce

## Roles and Permissions
- `planner`: full CRUD on trip, bases, days, items; invite/manage members; toggle is_public; change status
- `traveler`: add items; react to items; view all trip content including idea/shortlisted items
- Public viewer (no login): read-only via is_public link; sees confirmed/reserved/done items only — idea/shortlisted always hidden

## Public Share Rules
- `is_public = true` enables read-only URL at `/trip/:id` — no login required
- Public viewers never see: idea or shortlisted items, costs, reactions, internal notes
- Content filtering is automatic — no secondary toggle

## RLS Notes
- All policies scoped to `authenticated` role
- `trips` SELECT policy includes `owner_id = auth.uid()` to handle post-insert SELECT before trigger fires
- `trip_members` INSERT uses `with check (true)` for authenticated users — needed for the auto-planner trigger to write without recursion
- Supabase evaluates SELECT policy after INSERT when using `.insert().select()` — SELECT policy must not depend on data written by post-insert triggers

## Timezone Handling
- `local_timezone` stored on `trip_bases` as IANA string (e.g. `Europe/Madrid`)
- Used only to determine correct "today" when trip status is Active
- All times stored as simple `HH:MM` strings — no timezone conversion, no UTC normalization
- Transition days between bases: display items in `sort_order` — no cross-timezone time reconciliation

## CSS Rules
- CSS custom properties for everything — never hardcode colors, spacing, or type sizes
- Mobile-first: start with mobile styles, use `min-width` media queries to scale up
- Breakpoints: mobile < 600px, tablet 600–899px, desktop 900px+
- No horizontal scrolling at any viewport width
- Touch targets minimum 44px height
- Layer order: tokens.css → base.css → utilities.css → layout.css → components.css → feature CSS

## Unsplash
- Auto-pull hero images by `location_name` at trip and base level (Phase 1)
- Day-level photos are Phase 2
- Attribution required: display "Photo by [Name] on Unsplash" on all photos
- Free tier: 50 requests/hour — do not batch or pre-fetch aggressively

## Env Vars (never hardcode)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `UNSPLASH_ACCESS_KEY`

## Local Dev
`netlify dev` is the only correct local workflow (injects env vars). `file://` and `npx serve .` do not work. If Mac permissions error: `netlify dev --no-watch`.

## Pull Request Drafts
Always open new PRs as drafts (`--draft` flag with `gh pr create`). This prevents CodeRabbit from auto-triggering a review before the work is ready. Only mark a PR ready for review when explicitly instructed.

## Verification
Unless otherwise specified, do not plan on `netlify dev` or a local server for final verification. Open a draft PR when instructed, then the project owner will test on the Netlify preview URL. Non-server checks, static analysis, and code review are still appropriate before handing off.

## General Rules
- Soft delete only — never hard delete. All main tables have `deleted_at`. Set it; never use DELETE.
- Never reference Supabase in user-facing error messages. Use plain language: "Something went wrong saving. Please try again."
- Never hardcode hex colors — CSS custom properties only.
- VERSION bump is mandatory on every PR and every push that changes shipped code. Never forget it, never skip it, and never push without doing it first. In this repo the version lives in `src/config/constants.js` as `APP_VERSION`.
- Keep README.md accurate — update it when new tables, env vars, or major features are added.
