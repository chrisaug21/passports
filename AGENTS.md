# AGENTS.md — Passports

Project-specific instructions. Global coding standards and git discipline are in `~/.codex/AGENTS.md`.

## What This Project Is
Personal travel planner and diary PWA. Used on phone while traveling, desktop for planning, and tablet for browsing. Multi-user: Planners have full CRUD, Travelers can add items and react. Public share links expose curated read-only trip views with no login required.

## Stack
- App shell: vanilla HTML/CSS/JS with ES modules, one `index.html` entry point, no build step, and no npm dependencies in `src/`. Backend-only dependencies are allowed in scoped exceptions: root Netlify Function dependencies and the isolated `mcp-server/` package.
- Data backend: Supabase project `tqxvtsdghobustiatiqm` (`Passports`), separate from Homeboard/Habits
- Deployment: Netlify injects environment variables through `netlify.toml`
- Photo source: Unsplash location images require visible attribution wherever they render
- Typography: Fraunces for display text and Instrument Sans for body copy
- Installability: the app ships with a manifest and versioned service worker

## Views
- **Plan view** — private; full edit access; idea/shortlisted items visible; trip/base overview content is authored here
- **Guide view** (`src/features/trip/guide/`) — the itinerary/diary experience, rendered once and filtered by `viewerRole` (owner/member/public) rather than as separate pages. Two tabs, matching the in-app labels:
  - **Itinerary tab** — day-by-day plan; phone-first; on an Active trip shows today's plan based on trip dates
  - **Journal tab** — trip memories; enabled once trip status is Active or done; shown to public viewers only when `trip.is_journal_public`
  - Public read-only access via `/trip/:id` (no login) is Guide view with `viewerRole = "public"` — idea/shortlisted items, costs, reactions, and internal notes are always hidden

## Data Hierarchy
```text
Trip
└── Bases (1–4, ordered)
      ├── local_timezone (IANA string — determines "today" when Active)
      └── Days (belong to a base)
            └── Items (meal / activity / transport / lodging)
```

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
- No frameworks, no bundlers. Plain vanilla JS with ES modules. Scoped backend exceptions: root `package.json` is for Netlify Function-only dependencies, and `mcp-server/` has its own `package.json` for the Passports MCP connector backend. Nothing in `src/` imports from either dependency surface.
- Single-page app with client-side routing via router.js.
- Services talk to Supabase. Features render UI. State holds what's in memory. Never skip layers.

## Supabase Tables
| Table | Key notes |
|---|---|
| `trips` | `owner_id` FK → auth.users. `status`: destinations/planning/active/done. `target_year`/`target_month` are optional Wishlist timing fields. `sort_order` manually orders undated Wishlist entries. `is_public` enables public share link. Soft delete via `deleted_at`. |
| `trip_bases` | Belongs to trip. `local_timezone` is IANA string (e.g. `Europe/Madrid`). `date_start`/`date_end` are nullable. Used to determine "today" when trip is Active. Soft delete via `deleted_at`. |
| `trip_days` | Belongs to trip AND base. `day_number` is 1-indexed across the entire trip. Real date derived: `start_date + (day_number - 1)`. Never stored. Soft delete via `deleted_at`. |
| `trip_items` | Core object. `base_id` and `day_id` are independently nullable — an item with `base_id = null` is trip-level (not assigned to any base). `is_anchor` boolean: anchor items require `time_start`. `time_start`/`time_end` are local time strings with no timezone attached; treat them as the base's local time unless transition-day context requires simple `sort_order` sequencing. `cost_low`/`cost_high` are USD numeric estimates. `address` is nullable free text and renders as a map-pin link. `is_done` boolean (default false) tracks completion separately from `status`, with `done_by`/`done_at`. Soft delete via `deleted_at`. |
| `trip_members` | `role`: planner or traveler. Trip creator is auto-added as planner via DB trigger. UNIQUE on `(trip_id, user_id)`. |
| `trip_todos` | Optional `item_id` links a todo to a specific item. `due_phase`: before_trip/during_trip/after_trip. Soft delete via `deleted_at`. |
| `trip_packing_items` | `category`: clothing/toiletries/documents/gear/other. Soft delete via `deleted_at`. |
| `trip_reactions` | One reaction per user per item. UNIQUE on `(item_id, user_id)`. `reaction`: must_do/skip/no_preference. |
| `trip_photos` | `source`: unsplash or upload. Unsplash requires `credit_name` and `credit_url` for attribution display. |
| `user_profiles` | Account-level user preferences. `preferred_maps_app` controls whether map links open in Apple Maps or Google Maps; this is synced via Supabase and is not a device/browser-only setting. |
| `app_admins` | **Server-only** (RLS on, no policies). `user_id` PK → auth.users; `is_owner` = the permanent owner admin, never removable or demotable (DB trigger `protect_owner_admin` plus the `admin-users` function). Removing an admin is a soft delete (`deleted_at` + `removed_by`; granting again reactivates the row). Not a `user_profiles` column because that table is public and user-writable. Browser asks `/api/admin-whoami`; every `admin-*` function re-checks on each request and 404s non-admins. |
| `app_settings` | **Server-only** key/value jsonb. `signup_requires_invite` (ships `false`) is toggled on the admin page. |
| `invite_codes` / `invite_redemptions` / `signup_attempts` / `welcome_email_sends` | **Server-only.** Codes have `max_uses` seats (null = unlimited), `redeemed_count`, `expires_at`, `active`, soft delete. Redemptions list who used which code. `signup_attempts` rate-limits `/api/invite-check`. `welcome_email_sends` makes the welcome email once-only. |
| `user_email_sends` | **Server-only.** Per-person log of memory emails/nudges (`kind`, `trip_id`, `day_id` = featured day, `for_year`, `sent_at`); UNIQUE `(user_id, kind, trip_id, for_year)`. Released if a send fails. |

## Invite-only sign-up and the admin page
- **Gate:** a `BEFORE INSERT` trigger on `auth.users` (`enforce_signup_invite`, security definer) rejects new accounts without a valid invite code when `app_settings.signup_requires_invite` is true, and counts the seat atomically (a conditional UPDATE, so the last seat is safe under concurrent sign-ups). An `AFTER INSERT` trigger (`record_invite_redemption`) writes the redemption. Both run in the sign-up's own transaction, so a rejected sign-up never burns a seat. A supplied code is counted even when the gate is off. The sign-up form sends the code as `invite_code` in user metadata. The invite-code field exists on the form only while the gate is on — when sign-up is open there is no field and no "have a code?" prompt (campaign links `/login?invite=CODE` do nothing then). The browser pre-check (`/api/invite-check`, rate limited to 10 per IP per 10 minutes) and `/api/signup-policy` are courtesies; the trigger is the enforcement. Rollback: flip the switch off, or drop the two triggers.
- **Admin page** (`/app/admin`, `src/features/admin/`): "Passports admin" in the account menu, shown only to admins. Two tabs — **Sign-ups** (policy switch, create code, codes table with copy link / turn off / remove / who joined) and **Users** (read-only list with email search, plus Make admin / Remove admin; the owner row shows an "Owner" badge and has no button). The Users list is a single database call (`admin_list_users`, `sql/add_admin_list_users.sql`, callable only by the server's secret key). Functions: `admin-whoami`, `admin-settings`, `admin-codes`, `admin-users` (shared helpers in `netlify/lib/admin-auth.js`). Campaign links: `/login?invite=CODE` prefills the sign-up form.
- **Service worker and `/api/*`:** `sw.js` serves previously-seen requests from cache, which is right for app files but wrong for live data — it once replayed stale admin lists even after sign-out/in. It now never touches `/api/*` (only `/api/public-config` is still cached). Don't reintroduce caching for API calls.
- **Sign-in page photos:** the hero photo rotates per page load through the owner's own trip photos self-hosted in `assets/hero/` (list in `src/config/hero-photos.js`; the welcome email uses the same set via `netlify/lib/hero-photos.js` — keep the two lists in sync). The sign-up form validates inline (email, password length, invite code) before submitting.

## Item Types and Fields
- `meal` — adds `meal_slot` (breakfast/brunch/lunch/dinner)
- `activity` — adds `activity_type` (arts/outdoors/sports/entertainment/sightseeing/nightlife/other)
- `transport` — adds `transport_mode` (flight/train/car/ferry/bus/other), `transport_origin`, `transport_destination`
- `lodging` — no extra type fields; check-in/check-out surface from `time_start`/`time_end`

## Item Statuses
idea → option → shortlisted → confirmed → reserved — this is the `status` column's full value set (DB CHECK constraint enforces exactly these; matches `ITEM_STATUSES` in `src/config/constants.js`)
- `confirmed` = we're doing this, no hard reservation
- `reserved` = booked with a confirmation; obligation exists
- Completion is tracked separately via the `is_done` boolean on `trip_items` (plus `done_by`/`done_at`), not as a `status` value — there is no `"done"` status

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

## Maps
- Item `address` is free text and optional.
- If an item has an address, render a map-pin affordance.
- Map links should search `"<item title>, <address>"` so they resolve to the actual business listing, not just a bare address pin.
- Use `user_profiles.preferred_maps_app` to choose Apple Maps vs Google Maps links.

## Roles and Permissions
- `planner`: full CRUD on trip, bases, days, items; invite/manage members; toggle is_public; change status
- `traveler`: add items; react to items; view all trip content including idea/shortlisted items
- Public viewer (no login): read-only via is_public link; sees confirmed/reserved/done items only — idea/shortlisted always hidden
- Wishlist destination (`trips.status = "destinations"`): lightweight pre-planning trip row; no dates or day scaffolding required until promoted to Planning

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
- Design tokens include a cool off-white background, secondary cool surface, deep navy-charcoal text, green for action/interaction, blue for information/structure, and warm parchment for done/memento states.
- Green and blue should not be used for the same UI role.
- Display font is Fraunces; body font is Instrument Sans.

## Unsplash
- Auto-pull hero images by `location_name` at trip and base level (Phase 1)
- Day-level photos are Phase 2
- Attribution required: display "Photo by [Name] on Unsplash" on all photos
- Free tier: 50 requests/hour — do not batch or pre-fetch aggressively

## Env Vars (never hardcode)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `UNSPLASH_ACCESS_KEY`
- `RESEND_API_KEY` — server-only (Netlify functions); sending-access key for the `mail.chrisaug.com` domain
- `EMAIL_LINK_SECRET` — server-only; signs unsubscribe links (generate with `openssl rand -hex 32`)
- `SUPABASE_SECRET_KEY` — server-only; bypasses all access rules, so never expose it to the browser and permission-check before every use (`netlify/lib/supabase-admin.js`)

## Emails
Sent from `passports@mail.chrisaug.com` via Resend, only from Netlify functions (`netlify/functions/`, shared code in `netlify/lib/`). Email is always best-effort — a failed email must never make the user's action look like it failed.

**Every new email type needs all of these:**
1. A per-person on/off column on `user_profiles` (`email_*`, boolean) via a `sql/` migration. Default `true` for everyone — except people whose existing `email_*` columns are all `false`: they get `false`, so a new email type can't override someone who turned everything off.
2. An entry in `EMAIL_KINDS` (`netlify/lib/email-prefs.js`) **and** `EMAIL_PREFERENCE_OPTIONS` (`src/config/constants.js`) — it shows up as a switch in Settings automatically.
3. A signed unsubscribe link in the footer (`buildUnsubscribeUrl`) **and** a signed "Email settings" link (`buildSettingsUrl`, passed to the builder as `settingsUrl`) — both open the no-login settings page, so nobody has to sign in to change their emails plus the List-Unsubscribe headers (both handled by `sendEmail`/`renderEmailLayout`).
4. The function checks the recipient's column before sending. No profile row means never changed → on.

**Exception — the welcome email.** It is one-time and transactional (the recipient has no account settings yet), so it deliberately has no `email_*` column, no `EMAIL_KINDS` entry and no unsubscribe link; it carries only the signed "Email settings" link. Don't add a preference switch for it.

**Claim rows are released, not soft-deleted.** The `*_sends` claim tables (`trip_email_sends`, `welcome_email_sends`, `user_email_sends`) record "this send is taken"; if the send fails the claim is deleted so a later run can retry. That is operational bookkeeping, not user data, and is the one place besides photo replacement where rows are hard-deleted (as is pruning the `signup_attempts` rate-limit log).

There is deliberately **no** "unsubscribe all" column. "Unsubscribe from all" (Settings, and the unsubscribe page) just sets every `email_*` column to `false`.

**Emails sent today:**
- *Added to a trip* — `send-member-added-email`, called by the app right after a member is added. Wording and link depend on whether the trip is upcoming, happening now, over, or undated.
- *Welcome* — `send-welcome-email`, called by the app once a session exists for an account under 7 days old. One-time and transactional, so it has **no preference switch and no unsubscribe link** (its footer shows only "Email settings", which is a signed link to the no-login settings page — `buildSettingsUrl`, kind `settings`, opens `email-unsubscribe` with nothing switched off; `renderEmailLayout` omits the unsubscribe when none is passed). Each person gets one of the rotating hero photos (`netlify/lib/hero-photos.js`, picked from their user id). Claimed once per person in `welcome_email_sends`, released if the send fails. Builder: `netlify/lib/welcome-email.js`.
- *Journal reminder* — `journal-reminder`, a daily scheduled sweep (`netlify.toml`, 14:00 UTC ≈ 10am Eastern; production only, scheduled functions never run on deploy previews). Emails members 7–10 days after a trip's last day. The end date is derived fresh each run (start + length − 1), and `trip_email_sends` (one row per trip per end date) prevents repeats — so date edits are handled automatically: an extended trip gets one fresh reminder, and dates edited long after the fact fall outside the window and send nothing. A planner can switch off all of a trip's reminder emails (`trips.journal_reminders_enabled`); people who already wrote in the journal are skipped. To run it by hand (testing on a preview, or re-running after an outage): Netlify blocks web requests to a scheduled function, so use `journal-reminder-run`, which always needs `Authorization: Bearer $EMAIL_LINK_SECRET` — `curl -H "Authorization: Bearer $EMAIL_LINK_SECRET" "<site>/api/journal-reminder-run?dry_run=1&today=YYYY-MM-DD&trip=<trip id>"` (drop `dry_run=1` to really send). Both functions share `netlify/lib/journal-reminder-sweep.js`.
- *Trip check-in (day 2)* and *Trip countdown (3 days out)* — `trip-timeline`, an **hourly** scheduled sweep (`netlify.toml`; production only). Hourly because both fire on the traveler's local clock and Netlify schedules are UTC. Local time comes from `trip_bases.local_timezone`: day 2's base, else the trip's first base, else America/New_York. Check-in: 7–11pm local on day 2 (start + 1), trips of 3+ days only, skips anyone who already journaled. Countdown: 9am–noon local, 3 days before the start date, lists open "before trip" to-dos plus open to-dos in the "Packing" section (there's no real packing list UI — `trip_packing_items` is unused), or an "all set" version when nothing is open. Both are logged in `trip_email_sends` (kind `trip_day_two` / `trip_starts_soon`; its `for_end_date` column holds the day-2 date / the start date for these kinds). `trips.journal_reminders_enabled` is now the single per-trip switch for ALL of a trip's reminder emails (journal reminder, check-in, countdown) — the column name predates that. Manual run: `trip-timeline-run` (same bearer secret) with `now=<ISO time>`, `dry_run=1`, `trip=<id>`, `kind=trip_day_two|trip_starts_soon`. Both functions share `netlify/lib/trip-timeline-sweep.js`.
- *Trip memories* ("X years ago today") and the *Add your memories* nudge — `trip-memories`, a **daily** scheduled sweep (`netlify.toml`, 15:00 UTC ≈ 11am Eastern; production only). The unit is a trip **day**: on the calendar date of a day from a `done`, dated trip (same month/day, an earlier year; Feb 29 is marked Feb 28 in non-leap years; "today" is US Eastern) every member gets an email linking to that day (`/app/trip/:id/guide?from=email&day=N#journal`; the Guide reads `day`, scrolls to it and flashes its header). With memories on the day (any member's journal entry, or a photo on one of its items) it is the *memory email* (kind `trip_memories`: the day's photo, a ~200-character excerpt — the recipient's own note first); if the whole trip's journal is empty it is the *nudge* (kind `trip_journal_nudge`, "Add a memory"). **Rotation:** at most one email per person per trip per year; the featured day is the qualifying day least recently shown to that person, ties broken by a stable hash of (user, trip, year, day), so different days appear in different years; when several trips are due, the one least recently shown wins. **Limits (per person, constants at the top of the sweep):** `MIN_DAYS_BETWEEN` = 14 days between ANY two memory emails/nudges, and `NUDGE_MIN_DAYS_BETWEEN` = 30 days between nudges; there is deliberately no lifetime cap on nudges. **Lowest priority:** a person is skipped while they're on, about to go on, or just back from a trip of their own (from 3 days before it starts until 3 days after it ends — covers the countdown and check-in emails; the later journal reminder is deliberately not covered; `BUSY_DAYS_BEFORE_START` / `BUSY_DAYS_AFTER_END`). There is no cross-email cap beyond this. The memory email wins over a nudge due the same day. One switch for both: `email_trip_memories` (the per-trip reminder switch doesn't apply). Logged per person in the server-only `user_email_sends` (unique `(user_id, kind, trip_id, for_year)`; `day_id` records the featured day; `sent_at` feeds the limits; released if the send fails). Manual run: `trip-memories-run` (same bearer secret) with `today=YYYY-MM-DD`, `dry_run=1`, `trip=<id>`, `user=<id>`. Shared logic `netlify/lib/trip-memories-sweep.js`; builders `trip-memories-email.js` and `trip-journal-nudge-email.js`.

## Local Dev
`netlify dev` is the only correct local workflow (injects env vars). `file://` and `npx serve .` do not work. If Mac permissions error: `netlify dev --no-watch`.

## Pull Request Drafts
Always open new PRs as drafts (`--draft` flag with `gh pr create`). This prevents CodeRabbit from auto-triggering a review before the work is ready. Only mark a PR ready for review when explicitly instructed.

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

## Local CodeRabbit Reviews
The CodeRabbit CLI (`coderabbit` / `cr`) is installed and logged in. The free plan includes 3 local reviews per rolling hour, separate from the 1 PR review per hour. Code is sent to CodeRabbit's servers for each review.

- **Always ask the project owner before running a CodeRabbit review**, unless they've explicitly asked for one in that message. Never run one on your own.
- **Suggest one** when a branch is nearing the end of its work and the change is large or risky (database/SQL changes, auth, emails, anything touching access rules or public sharing). Don't suggest it for small text/style fixes.
- Default command: `coderabbit review --agent --base main -c CLAUDE.md` (whole branch; `-c` feeds in the project rules). For only uncommitted work: `coderabbit review --agent --uncommitted -c CLAUDE.md`. Add `--include-untracked` to cover brand-new files. Check remaining quota first with `coderabbit usage`.
- It's read-only — it never edits code. Treat findings as suggestions: check each one against the rules in this file, tell the owner which matter and which are noise, and only fix the real ones.

## Verification
Unless otherwise specified, do not plan on `netlify dev` or a local server for final verification. Open a draft PR when instructed, then the project owner will test on the Netlify preview URL. Non-server checks, static analysis, and code review are still appropriate before handing off.

## General Rules
- Soft delete only — never hard delete. All main tables have `deleted_at`. Set it; never use DELETE. The ONLY exception is hard deleting photos from storage upon replacement (which is allowed) so we avoid storing old photos we'll never use and wasting storage space. 
- Never reference Supabase in user-facing error messages. Use plain language: "Something went wrong saving. Please try again."
- Never hardcode hex colors — CSS custom properties only.
- VERSION bump is mandatory before every push that changes shipped code. Never forget it, never skip it, and never push first and fix it later.
  - Frontend/PWA changes (anything in `src/`, `sw.js`, or other files the app ships to users) → bump `APP_VERSION` in `src/config/constants.js`, and the matching `version` string in `sw.js`.
  - MCP server changes (anything in `mcp-server/` or the `netlify/functions/mcp*.js` wrappers) → bump `MCP_SERVER_VERSION` in `mcp-server/src/index.js` instead. This is the version an MCP client (e.g. MCP Inspector) reports on connect — it's the way to confirm you're talking to the build you just deployed, since nothing in the PWA UI reflects an MCP-only change.
  - A PR that only touches `mcp-server/`/MCP function files does not need an `APP_VERSION` bump — nothing shipped to the PWA changed. A PR touching both bumps both.
  - Bump on **every** push to an open PR that touches the relevant files, not just once right before merge. A deploy preview is meant to be tested against real code mid-review — if two different commits on the same PR both report the same version, there's no way to confirm via Inspector (or anything else) which one you're actually talking to, which defeats the entire reason this field exists. This applies even to a small follow-up fix pushed to an already-open PR.
- Keep README.md accurate — update it when new tables, env vars, or major features are added.
