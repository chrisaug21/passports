# Passports

Personal travel planner and diary PWA. Used on phone while traveling, desktop for planning, and tablet for browsing past trips and sharing itineraries.

## Stack
- Vanilla HTML/CSS/JS — modular ES modules, single `index.html` entry point, no build step, no npm dependencies (one scoped exception — see below)
- Supabase (project: `tqxvtsdghobustiatiqm`) — second Supabase account, separate from Homeboard/Habits
- Netlify — env vars injected at build via `netlify.toml`
- Unsplash API — auto-pull hero images by location name; attribution required
- Fraunces + Instrument Sans (Google Fonts) — display + body type pairing
- PWA shell — manifest + versioned service worker for installability

**Exception: `mcp-server/`.** This one folder has its own `package.json` and `node_modules` — it's the backend for the Passports MCP connector (lets a signed-in user's own Claude.ai read/act on their trips), and needs the official `@modelcontextprotocol/sdk` package to stay protocol-correct. It's fully isolated: nothing in `src/` imports from it, and it doesn't change how the rest of the app is built or run. See `passports-mcp-server-spec.md` for the full design.

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

## Vendored Libraries
Files in `src/lib/vendor/` are third-party libraries and must never be edited.
Do not read them for context. Do not modify them.

## Three Modes
- **Planning mode** — private; full edit access; idea/shortlisted items visible
- **Traveling mode** — phone-first; shows today's plan based on trip dates
- **Diary/share mode** — public read-only via `/trip/:id`; confirmed/reserved/done items only

## Data Hierarchy
```
Trip
└── Bases (1–4, ordered)
      ├── local_timezone (IANA string — determines "today" when Traveling)
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
- Soft delete only — never hard delete; `deleted_at` exists on all main tables -- The ONLY exception is hard deleting photos from storage upon replacement (which is allowed) so we avoid storing old photos we'll never use and wasting storage space. 
- Never reference Supabase in user-facing errors
- Never hardcode colors — CSS custom properties only
- VERSION bump is mandatory before every push that changes shipped code. Never forget it, never skip it, and never push first and fix it later.
  - Frontend/PWA changes (anything in `src/`, `sw.js`, or other files the app ships to users) → bump `APP_VERSION` in `src/config/constants.js`, and the matching `version` string in `sw.js`.
  - MCP server changes (anything in `mcp-server/` or the `netlify/functions/mcp*.js` wrappers) → bump `MCP_SERVER_VERSION` in `mcp-server/src/index.js` instead. This is the version an MCP client (e.g. MCP Inspector) reports on connect — it's the way to confirm you're talking to the build you just deployed, since nothing in the PWA UI reflects an MCP-only change.
  - A PR that only touches `mcp-server/`/MCP function files does not need an `APP_VERSION` bump — nothing shipped to the PWA changed. A PR touching both bumps both.
  - Bump on **every** push to an open PR that touches the relevant files, not just once right before merge. A deploy preview is meant to be tested against real code mid-review — if two different commits on the same PR both report the same version, there's no way to confirm via Inspector (or anything else) which one you're actually talking to, which defeats the entire reason this field exists. This applies even to a small follow-up fix pushed to an already-open PR.

## RLS Notes
- All policies scoped to `authenticated` role
- `trips` SELECT includes `owner_id = auth.uid()` — required because Supabase evaluates SELECT after INSERT before the auto-planner trigger fires
- `trip_members` INSERT is `with check (true)` for authenticated users — prevents recursion in the trigger that bootstraps planner role

## Timezone Handling
- `local_timezone` on `trip_bases` — IANA string only (e.g. `Europe/Madrid`)
- Purpose: determine correct "today" when trip is Traveling — not for time conversion
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
- Body font: Instrument Sans
- Green = action/interaction; blue = information/structure; never use them for the same role

## Env Vars (never hardcode)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `UNSPLASH_ACCESS_KEY`

## Local Dev
`netlify dev` injects env vars correctly. `file://` and `npx serve .` do not work.

## Pull Request Drafts
Always open new PRs as drafts (`--draft` flag with `gh pr create`). Only mark ready for review when explicitly instructed.

## Checking CI Bot Findings (Codacy, Sourcery)
This repo has both Codacy and Sourcery installed on PRs. Each publishes its real per-issue findings through a **different API surface than PR/issue comments** — checking only `gh pr view`/`gh api .../issues/<pr>/comments` will show just a summary count and a link, not the actual list. Use these instead:

- **Codacy** posts its findings as **check-run annotations**, not comments:
  ```bash
  gh api repos/<owner>/<repo>/commits/<sha>/check-runs --jq '.check_runs[] | select(.app.name | test("Codacy"; "i")) | .id'
  gh api repos/<owner>/<repo>/check-runs/<check-run-id>/annotations
  ```
  The issue comment Codacy leaves on the PR is only a summary ("15 medium issues... View in Codacy") — the annotations endpoint above has the real file/line/message list.
- **Sourcery** posts real line-by-line findings as a formal GitHub PR review with inline comments:
  ```bash
  gh api repos/<owner>/<repo>/pulls/<pr>/reviews
  gh api repos/<owner>/<repo>/pulls/<pr>/comments
  ```
  but **it skips draft PRs by default** — on a draft it only posts a high-level "Reviewer's Guide" summary as an issue comment, with no line-by-line findings. Comment `@sourcery-ai review` on the PR (or mark it ready for review) to trigger a real review with inline comments.
- If Codacy's dashboard/API needs its own auth (the annotations trick above doesn't need it, but Codacy's own web UI does), ask the project owner for a token rather than assuming access doesn't exist.

## Verification
Unless otherwise specified, do not plan on `netlify dev` or a local server for final verification. Open a draft PR when instructed, then the project owner will test on the Netlify preview URL. Non-server checks, static analysis, and code review are still appropriate before handing off.

## Planned Future Work
- **Wistia video embeds**: store Wistia media ID on day/trip; render Wistia player embed in diary mode
- **User-uploaded photos**: Supabase Storage for post-trip memento photos (Phase 2)
- **Smart timezone prompt**: on active travel days, detect device timezone mismatch with base timezone; one-tap banner to update
- **Traveler reactions**: Must Do / Skip / No Preference per item (Phase 2)
- **Memento/diary mode**: beautiful archive view for past trips; designed share experience
- **Homeboard integration**: trip countdowns and todos surfaced on Homeboard
- **Public share slug**: replace UUID-based public URLs with revocable slugs
- **Full email invite flow**: currently MVP is manual add only (user must already have account)
