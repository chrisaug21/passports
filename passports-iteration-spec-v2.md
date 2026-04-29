# Passports — Iteration Spec v1.0
**Project:** passports.chrisaug.com
**Status:** Active backlog — burn down over upcoming sessions
**Last updated:** April 2026

---

## Context

Guide View (Itinerary Mode + Journal Mode Phase 1) is shipped. This spec covers all remaining planned features, ordered by recommended priority. DB migrations are applied by Claude (web) via Supabase MCP before Claude Code touches any code. All features follow the existing stack: vanilla JS, Supabase, Netlify.

---

## DB Changes Already Applied This Session

- `trips.status` check constraint now includes `destinations` (before `planning`)
- `journal_item_photos.deleted_at` column added (soft-delete support)
- `journal_entries` content → notes rename, nullable, unique constraints added
- `user_profiles` table created
- `journal_entries` table created
- `journal_item_photos` table created
- `trip_items.check_out_date` date column added
- `trips.is_journal_public` boolean added
- `trip_days.journal_notes` dropped (replaced by `journal_entries`)
- Anon RLS policies added for public Guide View access
- `trip_items.status` check constraint includes `option`

---

## Feature Backlog — Recommended Sequence

---

### 1. UX Bug — Single-Base Name Sync
**Status:** Not built  
**LOE:** XS  
**DB changes:** None

When a trip has exactly one base, the base is automatically named after the trip on creation. If the trip title is later edited, the single base name should update to match automatically.

**Behavior:** In the trip settings save flow, if `trip.base_count === 1`, update the base name to match the new trip title in the same operation.

---

### 2. Upcoming Status — Client-Derived Display
**Status:** Not built  
**LOE:** XS  
**DB changes:** None

`upcoming` is not a DB status value — it is a derived display state. When `status = 'planning'` and `start_date` is within 7 days of today, display the status badge as "Upcoming" instead of "Planning" everywhere in the UI. No DB writes, no migration. Pure client-side derivation on load.

**Purpose:** Builds anticipation for users as a trip approaches.

---

### 3. Logo + Favicon
**Status:** Pending asset from Chris  
**LOE:** XS (once SVG is provided)  
**DB changes:** None

Chris will provide a final SVG logo for the top nav wordmark. Favicon derives from the logo mark.

- Replace the current text "Passports" wordmark in the top nav with the SVG logo
- Add `favicon.ico` and PNG sizes to `<head>` in `index.html`
- Ensure logo renders correctly on both light background (dashboard) and dark background (Guide View hero)

---

### 4. Invite Codes for Signup Gating
**Status:** Not built  
**LOE:** S  
**DB changes:** New `invite_codes` table

Gates who can create an account. Required before broader sharing of the app.

**Schema:**
```sql
CREATE TABLE invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id),
  used_by uuid REFERENCES auth.users(id),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Behavior:**
- Signup flow requires a valid unused invite code
- On successful signup, mark the code as used (`used_by`, `used_at`)
- Chris can generate codes via a simple admin UI (or direct DB insert for now)
- Invalid/used code shows a clear error: "This invite code isn't valid"

---

### 5. Location Field on Items (Free Text)
**Status:** Not built  
**LOE:** S  
**DB changes:** `trip_items.location_name` text nullable, `trip_items.location_url` text nullable

Adds a dedicated location field to any trip item. Phase 1 is free text. Google Maps integration is Phase 2 (see item 14).

**Schema additions:**
```sql
ALTER TABLE trip_items ADD COLUMN location_name text;
ALTER TABLE trip_items ADD COLUMN location_url text;
```

**Behavior:**
- Location field appears in the item edit form for all item types
- `location_url` is optional — a manually pasted Google Maps or website URL
- In Guide View item cards: show location name with a `MapPin` icon. If `location_url` is set, make it tappable — opens in Google Maps app on mobile, Maps website on desktop
- In planning views: show location name on item cards where space allows

---

### 6. Public Dashboard Per User
**Status:** Not built  
**LOE:** S  
**DB changes:** `user_profiles.username` text unique nullable

A shareable public-facing page showing a user's public trips, organized into Plans and Stamps sections.

**Schema addition:**
```sql
ALTER TABLE user_profiles ADD COLUMN username text UNIQUE;
```

**URL:** `/u/:username`

**Behavior:**
- Shows trips where `is_public = true`, organized by status:
  - **Plans** — planning/active trips
  - **Stamps** — done trips
  - **Destinations** — always private, never shown publicly
- Each trip card links to its public Guide View
- Username can be set in the Profile modal (new field below email)
- If no username set, the public dashboard is not accessible
- Unauthenticated visitors can view it freely

---

### 7. Destinations / Plans / Stamps — Top Nav + Ideation Feature
**Status:** Not built  
**LOE:** L  
**DB changes:** `destinations` status already applied to trips constraint

This is the biggest feature in this spec. It redesigns the dashboard into a three-section app with a persistent top nav.

#### Navigation Structure

**Desktop:** Persistent top nav bar with three text links: Destinations · Plans · Stamps  
**Mobile:** Bottom tab bar with three icon tabs (icons TBD — suggest Globe, Map, Stamp/Badge)  
**Active state:** Underline on desktop, filled icon on mobile  
**Persistence:** Nav appears on all views including trip detail. Does not disappear in context.

#### Destinations Section
Trips with `status = 'destinations'`. The vision board / bucket list.

- **Card design:** Lighter than Plans cards — destination photo (Unsplash by location name), place name, one-liner description, idea count badge. No dates.
- **New trip flow:** "Add a destination" — just needs a title/place name to start. No dates required.
- **Drill-down:** Opens a stripped-down trip view — Master List only (no Days view, no base structure required). Just a flat list of ideas dropped in.
- **Graduate to Plans:** A "Start planning this" action promotes `status` from `destinations` to `planning`.

#### Plans Section
Trips with `status IN ('planning', 'active')`. Current dashboard, essentially as-is.

#### Stamps Section
Trips with `status = 'done'`. Memento-first presentation.

- Cards emphasize the hero photo over metadata
- Each card links directly to Guide View (Journal tab if journal exists, Itinerary tab otherwise)
- Visually distinct from Plans — warmer, more editorial

#### "Save Undone Items for Next Time" (Destinations feature)
Appears in Journal View when a trip is Done.

- Button: "Save undone items for next time"
- Selects all items where `status != 'done'` and `deleted_at IS NULL`
- Creates a new trip in `destinations` status with the same title (e.g. "Newport — Next Time"), no dates
- Copies selected items into the new trip's unassigned pool (new `trip_items` rows, same content, `day_id = null`, `base_id = null`, `status = 'idea'`)
- Optional: user can deselect individual items before confirming
- After creation: navigates to the new Destination entry

---

### 8. Meal Slot Auto-Sorting in Day View
**Status:** Not built  
**LOE:** S  
**DB changes:** None

When a meal item is assigned or moved to a day, auto-position it based on meal slot to reduce manual reordering.

**Sort order within a day for meals:**
`breakfast → brunch → lunch → dinner → (no slot)`

**Behavior:**
- When a meal item with a `meal_slot` is dropped onto a day, insert it after the last item of the previous meal slot group and before the first item of the next slot group
- Non-meal items are not affected
- Anchor items are never auto-moved — their `sort_order` is always respected
- If no items of the surrounding slots exist, place at the most logical position (e.g., breakfast at top of day if no other items)
- Manual reordering after auto-sort is always allowed

---

### 9. Todo List
**Status:** Not built  
**LOE:** M  
**DB changes:** `trip_todos` table (already in original spec)

**Schema:**
```sql
CREATE TABLE trip_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_id uuid REFERENCES trip_items(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_phase text NOT NULL CHECK (due_phase = ANY (ARRAY['before_trip','during_trip','after_trip'])),
  is_complete boolean NOT NULL DEFAULT false,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**UI:** Tab or section on trip detail. Before / During / After phase tabs. Check off, add, reorder, optionally link to an item.

---

### 10. Packing List
**Status:** Not built  
**LOE:** M  
**DB changes:** `trip_packing_items` table (already in original spec)

**Schema:**
```sql
CREATE TABLE trip_packing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL CHECK (category = ANY (ARRAY['clothing','toiletries','documents','gear','other'])),
  is_packed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**UI:** Tab or section on trip detail. Grouped by category. Check off as you pack.

---

### 11. Email Flows (Member Added + Invite New User)
**Status:** Not built  
**LOE:** M  
**DB changes:** None  
**Dependencies:** Resend configured at `mail.chrisaug.com` ✅

Two email flows triggered by membership actions:

**Flow 1 — Member added to trip (existing user):**
- Triggered when a planner adds a user to a trip
- Email to the added user: "You've been added to [Trip Name]" — link to the trip

**Flow 2 — Invite new user:**
- Triggered when a planner tries to add a member whose email has no account
- Generates an invite code, sends email: "[Your name] has invited you to join Passports and collaborate on [Trip Name]" — link to signup with invite code pre-filled
- On signup completion, automatically adds them to the trip

**From address:** `passports@mail.chrisaug.com`

---

### 12. Tidbits
**Status:** Not built  
**LOE:** M  
**DB changes:** New `trip_tidbits` table

Contextual info snippets attached to a trip, base, day, or item. Planners only. Displayed passively in Guide/Itinerary views as ambient flavor.

**Examples:** Local language phrases, tipping culture, neighborhood history, practical tips ("The metro closes at midnight"), restaurant context ("cash only").

**Schema:**
```sql
CREATE TABLE trip_tidbits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  base_id uuid REFERENCES trip_bases(id) ON DELETE CASCADE,
  day_id uuid REFERENCES trip_days(id) ON DELETE CASCADE,
  item_id uuid REFERENCES trip_items(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL,
  category text CHECK (category = ANY (ARRAY['language','culture','practical','history','food','transport','other'])),
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tidbits_one_parent CHECK (
    (CASE WHEN base_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN day_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN item_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);
```

**UI:** Inline in plan view (add/edit/delete for planners). Displayed passively in Itinerary and Journal Guide Views — small info cards or expandable chips near the relevant base/day/item.

---

### 13. WYSIWYG Journal Notes (Tiptap)
**Status:** Not built (plain textarea currently)  
**LOE:** M  
**DB changes:** None — `journal_entries.notes` already stores text; will store HTML after this

Replace the plain textarea in Journal Mode with Tiptap editor.

**Supported formatting:** Bold, italic, bullet list, numbered list. Nothing more complex.  
**Behavior:** Same auto-save on blur. Same Save/Cancel pattern. Just richer input.  
**Dependency:** `npm install @tiptap/core @tiptap/starter-kit` — this is the one permitted new dependency for this feature.  
**Rendering:** Existing read-only display of journal notes must render HTML safely (use `innerHTML` with sanitization or a simple allowlist).

---

### 14. Day Photo Galleries — Journal Phase 2
**Status:** Not built  
**LOE:** L  
**DB changes:** New `day_photos` table + storage bucket `day-photos`

Up to 10 photos per traveler per day. Gallery display with lightbox/swipe in Journal Mode.

**Schema:**
```sql
CREATE TABLE day_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_id uuid NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text NOT NULL,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT day_photos_max_per_user_day UNIQUE (user_id, day_id, sort_order)
);
```

**Storage bucket:** `day-photos` (max 10MB per photo, jpg/png/webp)  
**UI:** Gallery strip below day journal notes. Upload, reorder, caption, delete. Lightbox on tap. Swipe between photos.

---

### 15. Wistia Video Embeds
**Status:** Not built (deferred from original spec)  
**LOE:** M  
**DB changes:** `wistia_media_id` on `journal_entries`, `trip_days`

Wistia video clips attached to journal entries (per item, per user) and per day. In addition to — not replacing — text notes and photos.

**Schema additions:**
```sql
ALTER TABLE journal_entries ADD COLUMN wistia_media_id text;
ALTER TABLE trip_days ADD COLUMN wistia_media_id text;
```

**Behavior:**
- In Journal Mode write state: "Add video" button on item entries and day entries
- Input: paste a Wistia media ID or share URL — extract and store the media ID
- Playback: render the Wistia embed player inline in Journal Mode
- One video per user per item (on `journal_entries`), one video per day (on `trip_days` — planner only for day-level)
- Public visibility follows `is_journal_public` same as other journal content

---

### 16. Google Maps Integration for Location Field
**Status:** Not built (free text in item 5 comes first)  
**LOE:** M  
**DB changes:** None (columns added in item 5)  
**Dependencies:** Google Places API key (free tier ~$200/month credit, effectively free at current scale)

Upgrades the free-text location field to a Places autocomplete search.

**Behavior:**
- Location field in item edit form becomes a search input
- Google Places autocomplete dropdown as user types (debounced, 300ms)
- On selection: populate `location_name` with place name, `location_url` with Google Maps deep link
- Deep link format for mobile: `https://maps.google.com/?q=place_id:XXX` — opens in Maps app on iOS/Android
- Attribution: "Powered by Google" required per API terms — small text below the field

---

### 17. Reactions
**Status:** Not built (in original spec)  
**LOE:** M  
**DB changes:** `trip_reactions` table (already in original spec)

Travelers and co-planners can react to any item: ⭐ Must Do / ✗ Skip / — No Preference. One reaction per user per item. Planners see reaction badges on items.

Lower priority — mainly relevant when you have active Traveler-role users.

---

### 18. Traveler Role Enforcement
**Status:** Partially built (role exists in DB, not enforced in UI)  
**LOE:** M  
**DB changes:** None

The `traveler` role exists in `trip_members` but Travelers currently have the same UI capabilities as Planners. Enforce the distinction:

- Travelers can add items to the master list
- Travelers cannot edit or delete other members' items
- Travelers cannot reorder items or manage bases/days
- Travelers cannot edit trip settings or manage membership
- Travelers can add journal entries and photos (already works)

Low priority until you have active Traveler-role users who aren't Bailey.

---

## Features Explicitly Deferred / Out of Scope

- AI itinerary generation
- Map integration (beyond Google Maps links on items)
- Native iOS app
- Payment / booking integration
- Multi-currency / actual spend tracking
- Social features (comments, follows, likes)
- Offline PWA support
- Photo editing / filters

---

## Standing DB Conventions

- Always use `apply_migration` for schema changes (not `execute_sql`)
- Verify column existence with `execute_sql` after any migration — do not trust success response alone
- Soft delete everywhere: `deleted_at timestamptz` — never hard delete (exception: storage files get hard-deleted from bucket, DB row gets soft-deleted)
- `update_updated_at()` is the correct trigger function name (not `update_updated_at_column`, not `moddatetime`)
- Storage policies live on `storage.objects` and must be created separately from table RLS

### RLS Policy Rules — Authenticated by Default

All new tables get RLS enabled with policies scoped to the `authenticated` role by default. Anon policies are only added when a table or endpoint is explicitly intended to be public.

**Authenticated policies — known patterns:**
- `trips` SELECT must include an owner check: `owner_id = auth.uid()` OR membership via `is_trip_member(id)`
- `trip_members` INSERT must use `WITH CHECK (true)` to avoid planner recursion (the USING clause already gates who can insert)
- All UPDATE policies must have explicit `WITH CHECK (true)` unless post-update row restriction is intentional — omitting it causes soft-delete and field-update operations to silently fail with 42501

**Anon policies — only for these tables (public Guide View):**
- `trips` — `is_public = true AND deleted_at IS NULL`
- `trip_bases`, `trip_days` — parent trip must be public
- `trip_items` — parent trip must be public AND `status IN ('confirmed','reserved','done')` only
- `trip_photos` — parent trip must be public
- `journal_entries`, `journal_item_photos` — parent trip must be public AND `is_journal_public = true`
- `user_profiles` — fully public (needed for attribution display)
- `storage.objects` for `trip-photos`, `journal-photos` buckets — public read

**Never add anon policies to:** `trip_members`, `trip_reactions`, `trip_todos`, `trip_packing_items`, `trip_tidbits`, `invite_codes`, or any other table not listed above.

---

## Two-Tool Workflow Reminder

- **Claude (web):** Planning, architecture decisions, prompt writing, ALL DB changes via Supabase MCP
- **Claude Code / Codex:** All code changes only — never runs migrations
- Claude Code should never authenticate with Supabase MCP or run migrations directly
- CLAUDE.md and AGENTS.md must always be updated together
