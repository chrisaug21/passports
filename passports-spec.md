# Passports — Product Spec
**Project:** passports.chrisaug.com  
**Stack:** Vanilla JS, Supabase (new project), Netlify  
**GitHub:** chrisaug21/passports  
**Status:** Pre-development — spec v1.0 (clean rewrite; replaces all prior trip app specs)

> **Note:** `trips.chrisaug.com` is preserved as-is — a living reference prototype for content and UX patterns. Do not modify or redeploy it.

---

## Vision

Passports is a personal travel planner and diary. It serves two equally important purposes:

**Planning:** A private workspace for building trips — collecting ideas, organizing by base and day, tracking what's confirmed. Replaces scattered Google Docs, browser tabs, and texts.

**Diary/sharing:** A beautiful, permanent record of where you've been and what you did — for revisiting memories, sharing itineraries with friends traveling to the same places, and showing off trips to friends and family.

The same data powers three modes:

- **Planning mode** — private, messy, full of ideas and options; for you while building the trip
- **Active mode** — reference on your phone while traveling; surfaces today's plan
- **Diary/share mode** — curated, beautiful, public-ready; shows only what you did and where you went

One source of truth. From first idea to final memory.

---

## Users & Roles

| Role | Capabilities |
|------|-------------|
| **Planner** | Full CRUD on trip, bases, days, items; invite and manage members; toggle public visibility; change trip status |
| **Traveler** | Add items to master list; react to items; view all trip content including Idea/Shortlisted items |
| **Public viewer** | Read-only view via public share link; no login required; sees Confirmed/Reserved/Done items only |

**Role assignment mechanics:**
- Creating a trip automatically makes you its Planner
- Planners can invite other users by email and assign them Planner or Traveler role
- Planners can change another member's role or remove them from a trip
- Travelers cannot manage membership
- A trip must always have at least one Planner — you cannot remove yourself if you're the only one
- Multiple Planners allowed — useful for group trips where two people are co-organizing
- Roles are per-trip, not per-account — you can be a Planner on your own trips and a Traveler on a friend's trip simultaneously

> **Multi-user architecture from day one.** Roles stored in `trip_members` join table. No schema changes needed to add users, change roles, or support other users creating their own trips.

> **Bailey in MVP:** Invited as Traveler. Can log in, add items, react to items. Cannot reorder, delete, or edit others' items.

---

## Trip Lifecycle States

```
Planning → Upcoming → Active → Done
```

| State | Description |
|-------|-------------|
| **Planning** | Actively collecting ideas and building itinerary; dates may be approximate |
| **Upcoming** | Flights/hotels booked; trip is within ~60 days |
| **Active** | Trip is happening now; app shows today's plan |
| **Done** | Trip is over; read-only memento mode |

Status is set manually by any Planner on the trip.

---

## Core Hierarchy

```
Trip
├── Trip-level: meta, status, packing list, trip todos, transport to/from home
└── Bases (1–4, ordered)
      ├── Base-level: city/neighborhood, lodging, local_timezone, notes
      ├── Transport IN (arriving at this base)
      └── Days (1–N, belonging to this base)
            ├── Anchor items (fixed time — meals, activities, transport with reservations)
            ├── Flex items (loose time or just sequenced — meals, activities, transport)
            └── Lodging (surfaces check-in/check-out days from base lodging)
```

**Single-base trips** (e.g., "7 days in Paris") have one base and it's invisible as a concept — the UI treats it as a simple trip. Bases only become visible navigation when there are two or more.

---

## Date Model

**Two-layer system** — plan before flights are booked:

- **`trip_length`** (integer): total number of days, set first
- **`start_date`** (date, nullable): set when flights are confirmed; Day 1 = start_date, Day 2 = start_date + 1, etc.
- **`end_date`**: always derived, never stored

Days are always labeled Day 1, Day 2... until start_date is set, at which point real dates snap in automatically.

**Bases** also have `date_start` / `date_end` (nullable). Set when base dates are known. Derived from the trip's start_date + day assignments when possible.

---

## Anchor vs. Flex

Every schedulable item has an **`is_anchor`** boolean (default: false).

| Property | Anchor | Flex |
|----------|--------|------|
| Time | Required (`time_start` must be set) | Optional — can have estimated times OR just a sequence position |
| Movability | Fixed; everything else plans around it | Can shift to fit around anchors |
| Examples | Concert tickets, dinner reservation, 6am flight, hotel check-out | Wander the market, lunch somewhere around noon, afternoon museum |
| Time precision | Exact | Exact or estimated (`time_is_estimated: true`) |

**Anchor applies to any item type:** meals, activities, transport, lodging check-in/out.

**Day rendering:** Anchor items appear at fixed positions in the day view. Flex items sequence around them via `sort_order`. The day view is a loose timeline, not a calendar grid — you scroll through it, not clock-watch it.

---

## Item Types

All items share a common structure. Type determines which additional fields are available.

### Meal
A food or drink experience. Occupies a named slot in the day.

- `meal_slot`: breakfast / brunch / lunch / dinner
- Can be anchor (reservation at specific time) or flex ("find something for lunch")
- Can be assigned to a specific day slot or live in the unassigned pool tagged with meal type

### Activity
Anything you do — museum, hike, concert, walking tour, sports event, show, beach day.

- No distinction between "event" and "activity" — same object, same fields
- Can be anchor (timed entry ticket, curtain time) or flex (wander as long as we want)
- Optional `activity_type` tag for display icon: arts / outdoors / sports / entertainment / sightseeing / nightlife / other

### Transport
Getting somewhere. Applies at trip level (flights home), base level (inter-base travel), and day level (day trips, local transport worth noting).

- `transport_mode`: flight / train / car / ferry / bus / other
- Has `origin` and `destination` text fields
- Anchor if ticket is booked with fixed departure time; flex if driving and timing is loose
- `time_start` = departure, `time_end` = arrival (both local time of respective base)

### Lodging
Where you sleep. Attached to a base, surfaces on check-in and check-out days.

- One lodging item per base (or multiple options in planning phase before committing)
- `status` on lodging: idea / shortlisted / confirmed / reserved (see Item Statuses)
- Check-in and check-out times surface on relevant days as anchor or flex items

---

## Item Statuses

All items share a status lifecycle:

| Status | Meaning |
|--------|---------|
| **Idea** | In the pool; not yet committed |
| **Shortlisted** | Actively considering; narrowed down |
| **Confirmed** | We're doing this; no hard reservation |
| **Reserved** | Booked with confirmation; obligation exists |
| **Done** | Completed (used in memento mode) |

**Confirmation info** (optional on any item): confirmation number, booking reference, link — stored in `notes` or a dedicated `confirmation_ref` field.

---

## Master List / Unassigned Pool

Every item belongs to a trip. Before assignment, it lives in the **unassigned pool** — a flat list of ideas organized by type and status.

Assignment is progressive:
```
Unassigned pool → Base → Day → Slot (for meals)
```

You can add a restaurant idea to a trip on day one before knowing which day or base it belongs to. As planning progresses, you drag/assign it down the hierarchy.

The master list view is the default view when opening a trip. It shows everything — assigned and unassigned — filterable by type, status, base, or day.

---

## Timezone Handling

**`local_timezone`** is stored on each **base** (e.g., `Europe/Madrid`). Set manually when creating a base. For most trips, set once and never touched.

**Purpose:** Solely used to determine "what date is today locally" when the trip is Active — so the app surfaces the correct day's plan without showing yesterday's or tomorrow's schedule.

**All times** are stored as simple local time strings (`HH:MM`) with no timezone attached. They are always assumed to be in the base's local timezone. No UTC conversion, no normalization across bases.

**Transition days** (last day of Base 1 / first day of Base 2): items display in manual `sort_order`. No cross-timezone time reconciliation attempted. User sequences items to tell the correct story.

**Smart prompt (Phase 2):** On active travel days, app checks if device timezone matches base's `local_timezone`. If not, surfaces a one-tap banner: *"Looks like you're in [City] — update to local time?"*

---

## Cost Tracking

Optional on any item. All costs in USD (planning tool, not an accounting tool).

- `cost_low` (decimal, nullable) — single cost or low end of range
- `cost_high` (decimal, nullable) — high end of range; if null and cost_low is set, it's a point estimate
- Costs roll up: item → day → base → trip
- When multiple options (e.g., two hotel candidates), totals display as ranges
- No currency conversion; no actual spend tracking

---

## Trip To-Dos

A checklist of tasks that need to happen for the trip — not things you're doing on the trip, but things you need to do *for* the trip.

- Can link to a specific item (e.g., "Make reservation at X" → links to the restaurant item)
- Or standalone (e.g., "Get travel adapter," "Notify credit card company," "Print tickets")
- `due_phase`: before_trip / during_trip / after_trip
- `is_complete`: boolean

Displayed on trip home screen and filterable by phase.

---

## Packing List

A checklist of things to pack. Lives at the trip level.

- Items have `name`, `category` (clothing / toiletries / documents / gear / other), `is_packed` boolean
- Simple checklist; no quantity fields in MVP
- Can be pre-populated from a default template (Phase 2)

---

## Reactions (Traveler feature)

Any Traveler (or fellow Planner) can react to any item in the master list:

| Reaction | Meaning |
|----------|---------|
| ⭐ Must Do | High priority, strongly wants this |
| ✗ Skip | Not interested |
| — No Preference | Acknowledged, neutral |

- One reaction per user per item
- Optional short note attached to reaction
- Planners see reaction badges on items in master list and day views
- Filter master list by "Must Do" to see Traveler priorities

---

## Trip Notes / Journal

Per-day notes field for capturing what actually happened — useful in Active and Done modes.

- Freeform text field on each day: `journal_notes`
- Editable while Active; readable in Done/memento mode
- Photos per day (Unsplash for planning; user-uploaded photos for memento — Phase 2)

---

## Public Share

Each trip has a single `is_public` toggle (default: false). That's the only decision the Planner makes — everything else is automatic.

**When `is_public` is true:**
- Enables a read-only URL at `/trip/:id` — no login required; works at any trip status
- Public viewers see: trip hero, base overview, day-by-day itinerary
- Confirmed, Reserved, and Done items are visible
- Idea and Shortlisted items are automatically hidden — no secondary toggle needed
- Costs, reactions, and internal notes are hidden
- Unsplash credits displayed per API terms

**Content filtering is automatic, not configurable.** Public viewers always see the curated version — what you're actually doing, not your planning scratchpad.

---

## Data Model

### `trips`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `owner_id` | uuid FK → users | Trip creator; always a Planner |
| `title` | text | e.g. "Spain 2026" |
| `description` | text, nullable | Tagline or trip notes |
| `trip_length` | integer | Total days |
| `start_date` | date, nullable | Null until flights booked |
| `status` | enum | planning / upcoming / active / done |
| `is_public` | boolean, default false | |
| `cover_photo_url` | text, nullable | Override for Unsplash auto-pull |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### `trip_bases`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `trip_id` | uuid FK → trips | |
| `name` | text | e.g. "Barcelona" |
| `location_name` | text | For Unsplash + future map use |
| `local_timezone` | text | e.g. "Europe/Madrid" |
| `date_start` | date, nullable | |
| `date_end` | date, nullable | |
| `sort_order` | integer | Order within trip |
| `notes` | text, nullable | |

---

### `trip_days`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `trip_id` | uuid FK → trips | |
| `base_id` | uuid FK → trip_bases | Day belongs to a base |
| `day_number` | integer | 1-indexed across entire trip |
| `title` | text, nullable | e.g. "Isle of Skye arrival" |
| `location_name` | text, nullable | For Unsplash photo |
| `journal_notes` | text, nullable | Freeform day journal |
| `sort_order` | integer | |

Real date always derived: `start_date + (day_number - 1)`. Never stored.

---

### `trip_items`
Core object. Any meal, activity, transport, or lodging item.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `trip_id` | uuid FK → trips | Always scoped to trip |
| `base_id` | uuid FK → trip_bases, nullable | Null = unassigned to base |
| `day_id` | uuid FK → trip_days, nullable | Null = unassigned to day |
| `created_by` | uuid FK → users | |
| `title` | text | |
| `item_type` | enum | meal / activity / transport / lodging |
| `status` | enum | idea / shortlisted / confirmed / reserved / done |
| `is_anchor` | boolean, default false | Fixed time; everything plans around it |
| `meal_slot` | enum, nullable | breakfast / brunch / lunch / dinner (meals only) |
| `activity_type` | enum, nullable | arts / outdoors / sports / entertainment / sightseeing / nightlife / other (activities only) |
| `transport_mode` | enum, nullable | flight / train / car / ferry / bus / other (transport only) |
| `transport_origin` | text, nullable | |
| `transport_destination` | text, nullable | |
| `time_start` | time, nullable | Local time (base timezone assumed) |
| `time_end` | time, nullable | |
| `time_is_estimated` | boolean, default false | True = "around noon" not "12:00pm" |
| `cost_low` | decimal, nullable | USD |
| `cost_high` | decimal, nullable | USD; null if point estimate |
| `confirmation_ref` | text, nullable | Booking reference or confirmation number |
| `url` | text, nullable | Booking link, Google Maps, etc. |
| `notes` | text, nullable | Details, instructions, etc. |
| `sort_order` | integer | Within-day or within-unassigned ordering |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### `trip_todos`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `trip_id` | uuid FK → trips | |
| `item_id` | uuid FK → trip_items, nullable | Links to a specific item if task is about it |
| `title` | text | e.g. "Make reservation at X" |
| `due_phase` | enum | before_trip / during_trip / after_trip |
| `is_complete` | boolean, default false | |
| `sort_order` | integer | |
| `notes` | text, nullable | |

---

### `trip_packing_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `trip_id` | uuid FK → trips | |
| `title` | text | e.g. "Travel adapter" |
| `category` | enum | clothing / toiletries / documents / gear / other |
| `is_packed` | boolean, default false | |
| `sort_order` | integer | |

---

### `trip_reactions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `item_id` | uuid FK → trip_items | |
| `user_id` | uuid FK → users | |
| `reaction` | enum | must_do / skip / no_preference |
| `note` | text, nullable | |
| `created_at` | timestamptz | |

UNIQUE constraint on `(item_id, user_id)`.

---

### `trip_members`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `trip_id` | uuid FK → trips | |
| `user_id` | uuid FK → users | |
| `role` | enum | planner / traveler |
| `invited_at` | timestamptz | |
| `accepted_at` | timestamptz, nullable | |

> Trip creator is automatically added as `planner` on creation. A trip must always retain at least one planner.

---

### `trip_photos`
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `trip_id` | uuid FK → trips | |
| `base_id` | uuid FK → trip_bases, nullable | |
| `day_id` | uuid FK → trip_days, nullable | |
| `item_id` | uuid FK → trip_items, nullable | |
| `unsplash_id` | text, nullable | |
| `unsplash_url` | text | |
| `credit_name` | text | Required by Unsplash API terms |
| `credit_url` | text | |
| `is_primary` | boolean, default false | Hero photo at this level |
| `sort_order` | integer | |

> Unsplash attribution required: display "Photo by [Name] on Unsplash" on all photos.

---

## Features by Phase

### Phase 1 — MVP

**Trip Dashboard**
- Grid of trip cards: hero image, title, destination, status badge, date range or "X days · dates TBD"
- Sort by date (soonest first); Active trips visually distinguished
- New Trip button → create trip (title, destination, trip_length, optional start_date)

**Trip Detail — Master List View**
- Default view on trip open
- All items, assigned and unassigned, in a flat filterable list
- Filter by: type (meal / activity / transport / lodging), status, base, day
- Quick-add inline: title + type, expand for full detail
- Edit / delete (Admin only); Bailey can add, can't edit others

**Trip Detail — Days View**
- Toggle from Master List
- Left panel: unassigned pool
- Main area: base tabs (if multiple bases), then days as vertical cards
- Day card shows: day number, real date (if known), title, all assigned items in sort_order
- Anchor items visually distinguished (fixed badge or pin icon)
- Drag item from unassigned to a day to assign; drag between days to reassign

**Base Management**
- Create/edit bases: name, location, timezone, date range, notes
- Single base = invisible in UI (trip feels like a simple trip)
- Multiple bases = base tabs appear in day view

**Trip Settings**
- Edit title, destination, description
- Set/update start_date (days auto-update)
- Change trip_length (adds/removes days from end)
- Change trip status
- Toggle is_public
- Danger zone: archive trip (soft delete)

**Auth**
- Supabase Auth (email/password)
- Creating a trip automatically assigns you the Planner role for that trip
- Planners can invite users by email as Planner or Traveler
- RLS: users only see trips they're a member of (or public trips)
- Any authenticated user can create their own trips and become a Planner on them

**Trip To-Dos**
- Checklist on trip detail: before / during / after tabs
- Add, complete, delete todos
- Link todo to a specific item (optional)

**Packing List**
- Simple checklist on trip detail
- Add items with category
- Check off as you pack

**Cost tracking**
- Cost fields on item create/edit form
- Totals displayed on day cards and trip summary (ranges when multiple options exist)

---

### Phase 2 — V1.5

**Smart timezone prompt**
- On active travel days, detect device timezone mismatch with base timezone
- One-tap banner to confirm local timezone update

**Day photos**
- Auto-pull from Unsplash using day `location_name`
- Override manually

**Traveler reactions**
- Travelers and fellow Planners can react to items from Master List
- Planners see reaction badges; can filter by "Must Do"

**Journal mode**
- Edit `journal_notes` per day while Active
- Surfaces beautifully in Done/memento mode

**Compare options view**
- Side-by-side card view of multiple shortlisted options in same category (e.g., 3 hotel candidates)

**Packing list templates**
- Save and reuse packing lists across trips

---

### Phase 3 — Vision

**Memento mode**
- When status = Done, trip becomes a beautiful archive
- Items with status Done = record of what you actually did
- Day-by-day narrative view with journal notes and photos
- Share via public link — designed as a genuine read experience, not just data without edit controls

**User-uploaded photos**
- Add your own photos to days and items post-trip
- Stored in Supabase Storage
- Replaces Unsplash placeholders with real trip memories

**Wistia video**
- Embed trip videos hosted on Wistia
- Store Wistia media ID or embed URL on a day or trip record
- Renders Wistia player inline — no self-hosting, full Wistia player quality
- Covers "here's our trip video" use case for sharing with friends and family

**Homeboard integration**
- Surface upcoming trip countdowns on Homeboard
- Push trip-day todos to Homeboard todo list

**AI suggestions** (far future)
- "Free afternoon in Granada — what fits nearby?"
- Context from master list, reactions, and trip notes

**iOS PWA / Capacitor wrapper**
- Offline reading while traveling
- Same Supabase stack

---

## UX Principles

- **Chris is the power user.** Every add, reorder, and admin action is optimized for him. Bailey's experience is streamlined and read-friendly.
- **Fast to add.** Minimum friction to capture a new idea: title + type, done. All other fields are optional and expandable.
- **Progressive assignment.** Ideas live in the pool. Assign them to bases, days, and slots as planning solidifies. Never blocked by incomplete information.
- **Dates are optional until they're not.** Plan a full itinerary before flights are booked. Real dates snap in when start_date is set.
- **Anchor items are the skeleton.** The day view is built around fixed commitments. Everything else flows around them.
- **Visually motivating.** Photos and clean design make the app feel like a travel brand, not a task manager. You should want to open it.
- **One source of truth.** If it's not in here, it doesn't exist.

---

## Design Direction

**Aesthetic:** Light, airy, coastal-editorial — travel magazine meets personal diary. Crisp and cool, not warm or dark. Distinct from Homeboard (warm/sepia) and Habits (dark/purple).

**Palette:**

| Role | Color | Notes |
|------|-------|-------|
| Base background | `#F4F7FA` | Cool off-white; slightly blue-tinted; avoids harshness of pure white |
| Secondary surface | `#EEF2F7` | Cards, containers, inset areas |
| Text | `#1A2332` | Deep navy-charcoal; warmer than pure black; editorial feel |
| Accent — action | Saturated green (`~#0EA87A` range) | Buttons, CTAs, status pills, interactive elements |
| Accent — structural | Passport blue (`~#2B5BE0` range) | Active states, selected indicators, future map pins |
| Supporting warm note | Pale sand / parchment | Done/memento states; nods to old maps and travel journals |

> The two accents have distinct jobs and never compete: green = action/interaction, blue = information/structure. If they feel like too much in practice during build, green wins — it's more distinctive and less expected.

**Context within the app family:**

| App | Tone | Accent |
|-----|------|--------|
| Habits | Dark | Purple |
| Homeboard | Light-warm / sepia | Amber + dark brown |
| chrisaug.com | Light | TBD |
| **Passports** | **Light-cool / airy** | **Green + blue** |

**Typography:**

- **Display font:** [Fraunces](https://fonts.google.com/specimen/Fraunces) — optical serif with warmth and personality; makes trip titles and place names feel beautiful. Locked.
- **Body font:** To be workshopped live in the app. Options ranked by fit:
  1. **Nunito** — rounded, friendly, warm; pairs softly with Fraunces
  2. **Jost** — geometric with personality; slightly more modern
  3. **Epilogue** — quirky grotesque; more editorial character
  4. **Libre Baskerville** — serif body; interesting choice for a diary feel
  5. **Outfit** — clean geometric; reliable workhorse
  6. **DM Sans** — baseline fallback; a bit plain

**Photos:**
- Full-bleed hero images on trip and base cards
- Day photos as subtle card backgrounds or thumbnails
- Planning phase: Unsplash (auto-pulled by location_name; attribution required)
- Diary/memento phase: user-uploaded photos (Supabase Storage, Phase 2)
- Video: Wistia embed via stored media ID or embed URL (Phase 2)

**Status colors:** Idea = muted gray / Shortlisted = amber / Confirmed = green / Reserved = bright green / Done = faded parchment

**Anchor indicator:** Pin or lock icon; subtle fixed badge on day view items

**Category icons:** Simple icon set — fork/knife (meal), compass (activity), airplane/train (transport), bed (lodging)

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Frontend | Vanilla JS |
| Auth | Supabase Auth |
| Database | Supabase Postgres (new project) |
| Photos (planning) | Unsplash API (free tier; attribution required) |
| Photos (memento) | Supabase Storage (Phase 2) |
| Video (memento) | Wistia embed (Phase 2) — store Wistia media ID or embed URL on day/trip record |
| Hosting | Netlify |
| DNS | Namecheap → passports.chrisaug.com |
| GitHub | chrisaug21/passports (new repo) |
| Local dev | `netlify dev` (env var injection) |

---

## Out of Scope (explicitly deferred)

- No AI itinerary generation in MVP
- No map integration in MVP
- No email/booking parsing
- No native iOS app in MVP
- No payment or booking integration (use external links)
- No multi-currency or actual spend tracking
- No social features

---

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Bases | Required structure; invisible when only one | Multi-city trips need a home base concept; single-city trips shouldn't feel the overhead |
| Anchor/flex | Boolean on any item type | Applies equally to meals, activities, transport, lodging — not type-specific |
| Event vs. activity | No distinction | Same object; type tag handles icon/display |
| Timezone | Stored on base, not trip | Bases can't span time zones; trips can |
| Time format | Local time strings, no UTC | App is a planner, not a clock; day-level awareness is all that's needed |
| Transition days | Sort order wins | No cross-timezone reconciliation; user sequences items manually |
| Costs | USD only, planning tool | Not truing up actual spend; ranges for unconfirmed options |
| Packing list | In from MVP | High practical value; simple implementation |
| Trip todos | In from MVP | Pre-trip tasks are a real use case; links to items adds value |
| Role naming | Planner / Traveler | Human and contextual; roles are per-trip not per-account; any user can be Planner on their own trips |
| Public visibility | Single `is_public` toggle; content filtering automatic | Idea/Shortlisted always hidden from public; no secondary toggle needed |
| Old repos | Archive `trips-app` and `chrisaug-trips`; preserve `trips` static site | `trips.chrisaug.com` kept as living reference prototype; new app lives at `passports.chrisaug.com` |
| Supabase | Second free-tier account for Passports project | Free tier; avoids Pro upgrade cost ($25 base + $10/project); MCP token swap managed per-session |
| Video | Wistia embed (Phase 2) | Chris works at Wistia; best-in-class player, no storage costs, great sharing experience |
| Design | Light-cool, Fraunces display font | Distinct from Habits (dark/purple) and Homeboard (warm/sepia); body font to be workshopped live |

---

## Pre-Development Setup Checklist

Complete before running Claude Code.

### 1. GitHub
- [ ] Archive `chrisaug21/trips-app` (Settings → scroll to bottom → Archive)
- [ ] Archive `chrisaug21/chrisaug-trips`
- [ ] Leave `chrisaug21/trips` (static site) untouched — it's the reference prototype
- [ ] Create new repo: `chrisaug21/passports` (public, no template, no README)

### 2. Supabase
- [ ] Create a second Supabase account (use a different email from your main account)
- [ ] Create new project named `passports` on the new account — note Project ID, URL, anon key
- [ ] Do not run migrations yet — Claude Code will generate them
- [ ] Note: MCP token for this project is separate from your Homeboard/Habits Supabase account — swap tokens in Claude Code config when switching between projects

### 3. Netlify
- [ ] New site → Import from Git → connect `chrisaug21/passports`
- [ ] Build command: *(blank for now)*, publish directory: `.`
- [ ] Add env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `UNSPLASH_ACCESS_KEY`
- [ ] Note the Netlify preview URL — dev/test environment until DNS cutover

### 4. Local setup
- [ ] `git clone` the new repo
- [ ] `npm install -g netlify-cli` (if not already installed)
- [ ] `netlify link` to connect local repo to Netlify site
- [ ] `netlify dev` to confirm local server starts with env vars injected

### 5. Unsplash
- [ ] Create developer account at unsplash.com/developers
- [ ] Create application: "Passports App (chrisaug.com)"
- [ ] Copy Access Key → add as `UNSPLASH_ACCESS_KEY` in Netlify env vars
- [ ] Note: free tier = 50 requests/hour; attribution required on all photos

### 6. DNS *(last — after app is working)*
- [ ] Namecheap → Manage chrisaug.com → Advanced DNS
- [ ] Add new `passports` CNAME pointing at new Netlify site URL
- [ ] Leave `trips` CNAME pointing at existing static site — do not touch it

---

## Claude Code Kickoff Prompt

```
I'm building a personal trip planning and travel diary app called Passports at passports.chrisaug.com.

Stack: vanilla JS, Supabase (new project), Netlify, GitHub (chrisaug21/passports).

Please read the attached spec before writing any code.

## Phase 1 scope:
- Trip dashboard with cards (Unsplash hero, title, destination, status badge, date info)
- Trip detail: Master List view and Days view (toggled via tab)
- Master list: flat filterable list of all items (assigned and unassigned) with type, status, anchor flag, time, cost, notes, url
- Days view: unassigned pool on left, base tabs (if multiple bases), days as vertical cards with items in sort_order; anchor items visually distinguished; drag to assign/reorder
- Base management: create/edit bases with name, location, timezone, date range
- Item types: meal (with meal_slot), activity (with activity_type), transport (with mode/origin/destination), lodging
- Anchor/flex: is_anchor boolean on all items; anchor requires time_start
- Trip todos: before/during/after checklist with optional item link
- Packing list: checklist with category
- Cost fields on all items; totals on day cards and trip summary
- Multi-user auth: Admin (me) and Co-planner (Bailey); RLS so users only see their trips
- Trip settings: edit meta, set start_date and trip_length, toggle is_public, archive trip

## Before writing any code:
1. Read the entire spec
2. Propose the file structure
3. Write the Supabase schema as SQL migrations (all tables in spec)
4. Pause and wait for my approval before writing any application code

## Conventions:
- Single app.js as the runtime spine
- Supabase-first: no offline writes; show error toast if Supabase unreachable on write
- localStorage as read-only cache only
- netlify dev for local testing
- Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, UNSPLASH_ACCESS_KEY via Netlify + netlify.toml
- Branch naming: ca/<issue-number>-<short-description>
- Bump VERSION in app.js at end of every PR
- Soft delete only — never hard delete data
- Never hardcode colors — use CSS custom properties
- Never reference Supabase in user-facing error messages
- Display font: Fraunces (Google Fonts); body font TBD — use Nunito as default, we'll swap during design phase
```
