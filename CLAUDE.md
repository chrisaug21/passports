# Passports

Personal travel planner and diary PWA. Used on phone while traveling, desktop for planning, and tablet for browsing past trips and sharing itineraries.

## Stack
- Vanilla HTML/CSS/JS — modular ES modules, single `index.html` entry point
- Supabase (project: `tqxvtsdghobustiatiqm`) — second Supabase account, separate from Homeboard/Habits
- Netlify — env vars injected at build via `netlify.toml`
- Unsplash API — auto-pull hero images by location name; attribution required
- Fraunces (Google Fonts) — display/heading font; body font TBD (currently Nunito)

## File Structure
```text
index.html
netlify.toml
src/
  app/          — app.js (entry), router.js, bootstrap.js
  config/       — env.js, constants.js
  lib/          — supabase.js, format.js, sort.js, derive.js
  services/     — one file per domain (trips, bases, days, items, todos, packing, members, reactions, photos)
  state/        — session-store.js, app-store.js, trip-store.js
  features/     — auth/, dashboard/, trip/, master-list/, days/, bases/, todos/, packing/, members/, public-trip/, shared/
  styles/       — tokens.css, base.css, utilities.css, layout.css, components.css, features/
```

## Three Modes
- **Planning mode** — private; full edit access; idea/shortlisted items visible
- **Active mode** — phone-first; shows today's plan based on base timezone
- **Diary/share mode** — public read-only via `/trip/:id`; confirmed/reserved/done items only

## Data Hierarchy
```
Trip
└── Bases (1–4, ordered)
      ├── local_timezone (IANA string — determines "today" when Active)
      └── Days (belong to a base)
            └── Items (meal / activity / transport / lodging)
```

## Supabase Tables
- `trips` — `owner_id` → auth.users; `status`: planning/upcoming/active/done; `is_public`; soft delete via `deleted_at`
- `trip_bases` — `trip_id`; `local_timezone` IANA string; `date_start`/`date_end` nullable; soft delete via `deleted_at`
- `trip_days` — `trip_id` + `base_id`; `day_number` 1-indexed across entire trip; real date derived never stored; soft delete via `deleted_at`
- `trip_items` — `base_id` and `day_id` independently nullable; `is_anchor` boolean; `time_start`/`time_end` local HH:MM strings; `cost_low`/`cost_high` USD numeric; soft delete via `deleted_at`
- `trip_members` — `role`: planner/traveler; UNIQUE `(trip_id, user_id)`; creator auto-added as planner via trigger
- `trip_todos` — optional `item_id` link; `due_phase`: before_trip/during_trip/after_trip; soft delete via `deleted_at`
- `trip_packing_items` — `category`: clothing/toiletries/documents/gear/other; soft delete via `deleted_at`
- `trip_reactions` — UNIQUE `(item_id, user_id)`; `reaction`: must_do/skip/no_preference
- `trip_photos` — `source`: unsplash/upload; Unsplash requires credit display

## Item Types
- `meal` — `meal_slot`: breakfast/brunch/lunch/dinner
- `activity` — `activity_type`: arts/outdoors/sports/entertainment/sightseeing/nightlife/other
- `transport` — `transport_mode`: flight/train/car/ferry/bus/other; `transport_origin`; `transport_destination`
- `lodging` — check-in/check-out via `time_start`/`time_end`

## Item Statuses
`idea` → `shortlisted` → `confirmed` → `reserved` → `done`

## Anchor vs Flex
- `is_anchor = true`: fixed time; `time_start` required; renders at fixed position in day view
- `is_anchor = false`: optional time or sequence-only via `sort_order`

## Key Rules
- `base_id` and `day_id` are independently nullable — never enforce a dependency between them
- Trip-level items (`base_id = null`) can have `day_id` set — used for inbound/outbound transport
- It is valid for an item's base and day to point to different bases (travel day scenario)
- Public share hides idea/shortlisted items and costs automatically — no secondary toggle
- Soft delete only — never hard delete; `deleted_at` exists on all main tables
- Never reference Supabase in user-facing errors
- Never hardcode colors — CSS custom properties only
- VERSION bump is mandatory on every PR and every push that changes shipped code. Never forget it, never skip it, and never push without doing it first. In this repo the version lives in `src/config/constants.js` as `APP_VERSION`.

## RLS Notes
- All policies scoped to `authenticated` role
- `trips` SELECT includes `owner_id = auth.uid()` — required because Supabase evaluates SELECT after INSERT before the auto-planner trigger fires
- `trip_members` INSERT is `with check (true)` for authenticated users — prevents recursion in the trigger that bootstraps planner role

## Timezone Handling
- `local_timezone` on `trip_bases` — IANA string only (e.g. `Europe/Madrid`)
- Purpose: determine correct "today" when trip is Active — not for time conversion
- All times stored as `HH:MM` local strings — no UTC, no timezone math
- Transition days between bases: sort_order determines sequence

## Design Tokens
- Background: `#F4F7FA` (cool off-white)
- Secondary surface: `#EEF2F7`
- Text: `#1A2332` (deep navy-charcoal)
- Accent action (green): `~#0EA87A`
- Accent structural (blue): `~#2B5BE0`
- Warm note (parchment): for done/memento states
- Display font: Fraunces (Google Fonts)
- Body font: Nunito (default; to be swapped during design phase)
- Green = action/interaction; blue = information/structure; never use them for the same role

## Env Vars (never hardcode)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `UNSPLASH_ACCESS_KEY`

## Local Dev
`netlify dev` injects env vars correctly. `file://` and `npx serve .` do not work.

## Pull Request Drafts
Always open new PRs as drafts (`--draft` flag with `gh pr create`). Only mark ready for review when explicitly instructed.

## Planned Future Work
- **Wistia video embeds**: store Wistia media ID on day/trip; render Wistia player embed in diary mode
- **User-uploaded photos**: Supabase Storage for post-trip memento photos (Phase 2)
- **Smart timezone prompt**: on active travel days, detect device timezone mismatch with base timezone; one-tap banner to update
- **Traveler reactions**: Must Do / Skip / No Preference per item (Phase 2)
- **Memento/diary mode**: beautiful archive view when status = Done; designed share experience
- **Homeboard integration**: trip countdowns and todos surfaced on Homeboard
- **Public share slug**: replace UUID-based public URLs with revocable slugs
- **Full email invite flow**: currently MVP is manual add only (user must already have account)
