 Passports — Product Spec
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

ADDENDUM:

# Guide View — Feature Spec
**Feature:** `/trip/:id/guide`
**Project:** Passports (passports.chrisaug.com)
**Status:** Spec v1.0 — ready for implementation planning

---

## Overview

Guide View is a distinct, route-based reading experience for a trip. It lives at `/trip/:id/guide` and serves two equally important audiences:

- **Travelers (logged in):** A beautiful day-by-day companion while planning and actively traveling, plus a permanent memento after the trip ends.
- **Public viewers (no login):** A curated, shareable itinerary and optional travel journal — the kind of thing you'd send a friend heading to the same city.

Guide View is not a planning tool. It is a reading and storytelling experience. All editing happens in the main planning views; Guide View surfaces the result.

---

## Two Modes

Guide View has two modes, toggled via a tab in the guide header:

### Itinerary Mode
The plan — structured around what was scheduled or what actually happened. Useful before, during, and after a trip. The definitive reference for "what are we doing today" and "here's how we did our trip."

- Day-by-day editorial cards
- Items filtered by status (see Visibility Rules below)
- Times, locations, notes, links, cost indicators
- Anchor items visually prominent
- Tone: clean, practical, scannable

### Journal Mode
The story — structured around what actually happened and how it felt. Unlocks when a trip goes Active. Written by travelers as they go. Available as a memento afterwards, optionally public.

- Day-by-day narrative: `journal_notes` field is the primary content
- Items marked Done surface as a soft "what we did" list (collapsed cards)
- Up to 10 photos per day, displayed as a gallery
- Optional single photo per trip item (surfaces in both modes)
- Traveler reactions visible (⭐ Must Do, ✗ Skip, — No Preference)
- Tone: personal, narrative, warm

**The key distinction:** Itinerary Mode is item-heavy, story-light. Journal Mode is story-heavy, item-light.

---

## Item Status Model Update

To support Guide View properly, the item status ladder gains one new status between Idea and Shortlisted:

```
Idea → Option → Shortlisted → Confirmed → Reserved → Done
```

| Status | Meaning | Itinerary (owner/planners/travelers) | Itinerary (public) | Journal (all) |
|---|---|---|---|---|
| Idea | Loose capture; not seriously in play | ❌ Hidden | ❌ Hidden | ❌ Hidden |
| Option | Actively considering; might happen | ✅ Shown | ❌ Hidden | ❌ Hidden |
| Shortlisted | Strong candidate | ✅ Shown | ❌ Hidden | ❌ Hidden |
| Confirmed | Decided, not yet booked | ✅ Shown | ✅ Shown | ✅ if Done |
| Reserved | Booked/ticketed | ✅ Shown | ✅ Shown | ✅ if Done |
| Done | Happened | ✅ Shown | ✅ Shown | ✅ Shown |

**Owner/planner rule:** Option and above appear in Itinerary Mode. Ideas remain scratchpad only.

**Public rule:** Confirmed, Reserved, and Done only. Planning context is always hidden.

**Journal rule:** Only Done items appear in Journal Mode (as collapsed "what we did" cards). The journal notes field is the real story.

**Visual treatment for unconfirmed items (owner view):** Option and Shortlisted items render with a soft dashed border or muted opacity treatment in Itinerary Mode — visually distinct from locked-in items so you always know what's still in play.

---

## Visibility & Access Rules

### Who Can See Guide View

| Trip Status | Itinerary Mode | Journal Mode |
|---|---|---|
| Planning | ✅ Owner/Planners only | 🔒 Locked |
| Upcoming | ✅ All trip members | 🔒 Locked |
| Active | ✅ All trip members | ✅ Unlocked — write as you go |
| Done | ✅ All trip members | ✅ Available — memento |

Guide View is always accessible to logged-in trip members at `/trip/:id/guide`, regardless of `is_public`.

### Public Sharing

Two independent toggles control public access:

- **`is_public`** — enables Itinerary Mode via public URL; shows Confirmed/Reserved/Done items only
- **`is_journal_public`** — enables Journal Mode for public viewers; off by default even when `is_public` is true

Journal is personal by default. Sharing it is an explicit opt-in decision.

---

## URL & Navigation

### Route
```
/trip/:id/guide
```

### Accessing Guide View
A **Guide button** lives in the trip detail page header, always visible to trip members:

```
[← Trips]    Spain 2026    [⋯ Settings]  [📖 Guide]
```

The Guide button uses a compass or open-book icon + "Guide" label. It is not buried in settings — it is a primary navigation element alongside Settings.

### Returning to Planning
A persistent back link in the Guide View header:
```
← Back to planning
```

Always visible. Never requires browser back button.

### Sharing
When `is_public = true`, a **Copy link** button appears in the Guide View header. It copies the public URL to clipboard.

When `is_public = false`, a **Share** button appears instead. Tapping it prompts the user to enable public sharing first (links to Trip Settings).

---

## Layout & Navigation Within Guide View

### Page Structure

Guide View is a single scrollable page with smart navigation layered on top. It is not a multi-page app — the URL does not change as you navigate between days.

```
/trip/:id/guide
├── Hero header (full-bleed photo, trip meta, mode tabs)
├── Sticky day navigation
└── Day sections (Itinerary or Journal content, depending on mode)
```

### Desktop Layout
- **Sticky left sidebar:** Day list (Day 1, Day 2... with real dates when known). Current day highlighted. Click to smooth-scroll to that day's section.
- **Main content area:** Scrollable day sections, right of sidebar.
- Sidebar is ~220px. Content area takes remaining width, max ~800px centered.

### Mobile Layout
- **Sticky pill nav:** Horizontal scrolling pill row at the top (Day 1, Day 2, Day 3...). Tapping a pill smooth-scrolls to that day section.
- Full-width content below.
- Pills are compact — day number + abbreviated date if known (e.g., "Day 3 · Jun 14").

### "Today" Awareness
When trip status is **Active**, Guide View auto-scrolls to the current day on load:
- Desktop: sidebar highlights today's day; page scrolls to that section.
- Mobile: pill nav scrolls to today's pill; page scrolls to that section.
- "Today" is determined by matching the current date against trip day dates (requires `start_date` to be set on the trip).
- If `start_date` is not set, no auto-scroll — open at Day 1.

---

## Trip Header

The first thing you see when opening Guide View. This is the cover of your guide.

### Elements (top to bottom)

**Full-bleed hero photo**
- Uses the trip's hero photo (uploaded via trip photo feature)
- Gradient overlay (dark at bottom) for text legibility
- On mobile: ~40vh height. On desktop: ~55vh height.
- If no photo: a tasteful solid or subtle pattern fill in the app's coastal-editorial palette.

**Overlaid on photo (bottom of hero):**
- Trip title — large, serif (Fraunces)
- Destination
- Date range — "Jun 12–19, 2026" or "8 days · dates TBD" if no start_date
- Status badge — subtle pill: Planning / Upcoming / Active / Done

**Below hero:**
- Trip description/tagline (if set) — soft body text, italic
- Mode tab bar: **Itinerary · Journal**
  - Journal tab is grayed/disabled when trip status is Planning or Upcoming
  - Journal tab shows a lock icon with tooltip "Unlocks when trip goes Active" on hover/tap

**Header actions (top-right corner, always visible):**
- `← Back to planning` (text link, top-left)
- `Copy link` or `Share` button (top-right, when public sharing is on/off respectively)

---

## Itinerary Mode — Day Section

Each day is a section in the scrollable page, preceded by a sticky-on-scroll day header.

### Day Header
```
Day 3  ·  Thursday, June 14       Granada
```
- Day number + real date (if known)
- Base/city name on the right
- Visually divides sections. Sticks to top of viewport as you scroll through that day's items.

### Item Cards

Each confirmed/option/shortlisted item (per visibility rules) renders as an editorial card.

**Full card (Itinerary Mode):**

```
┌─────────────────────────────────────────────────┐
│ 🍽  7:30 PM  ·  CONFIRMED            [📎 anchor] │
│                                                  │
│ Casa Lucio                                       │
│ La Latina · Madrid                               │
│                                                  │
│ "Classic cochinillo. Reservation under Chris,    │
│  party of 2."                                    │
│                                                  │
│ [🔗 Reservation]                      €€€        │
└─────────────────────────────────────────────────┘
```

**Card anatomy:**
- **Top row:** Category icon + time (if set) + status badge (soft, small) + anchor pin icon (if `is_anchor = true`)
- **Name:** Large, primary text
- **Location:** Neighborhood · City — secondary text, helps with wayfinding
- **Note:** Planning note surfaced as a caption (italic, muted). This is the detail that makes a guide actually useful — "reservation under Chris" or "buy tickets in advance."
- **URL link:** Tap to open (reservation, Google Maps, website). Icon + label.
- **Cost indicator:** € / €€ / €€€ / €€€€ range — not exact numbers. Derived from `cost_low`/`cost_high`. Hidden from public view.
- **Item photo** (if set): Displayed below the note as a thumbnail. Tap to expand. Visible in both Itinerary and Journal modes, to logged-in members and public viewers.

**Anchor item treatment:**
- Left border accent (e.g., a 3px colored stripe)
- Pin icon in top-right
- Anchor items always render first within their time slot

**Option/Shortlisted items (owner/planner view only):**
- Dashed border instead of solid
- Muted status badge ("Option" or "Shortlisted" in amber/gray)
- Slightly reduced opacity (~85%)
- A soft label: "Still deciding" or just the status badge is sufficient

**No-time flex items:**
- Render without a time in the top row
- "Flex" label or simply no time shown — don't fabricate a time

**Lodging items:**
- Render as a distinct card style — perhaps a horizontal band rather than a box
- Show check-in / check-out at top and bottom of a base's days rather than within a specific day's item list

### Day section — item ordering
1. Anchor items, sorted by `time_start`
2. Flex items with estimated times, sorted by `time_start`
3. Flex items with no time, sorted by `sort_order`

---

## Journal Mode — Day Section

### Day Header
Same structure as Itinerary Mode, but warmer visual treatment (slightly softer typography weight).

### Journal Notes
The primary content of each day section in Journal Mode.

- Freeform text field: `journal_notes` on the `trip_days` table
- Renders as flowing prose, full-width
- **Edit behavior (logged-in Planners and Travelers, Active or Done trips):**
  - Click/tap the notes area to enter edit mode
  - Inline editing — no separate modal or page
  - Auto-saves on blur (debounced)
  - Placeholder text when empty: *"How was Day 3? Add notes, highlights, or reflections..."*
- **Read behavior (public viewers, or logged-in when not editing):**
  - Renders as styled prose
  - Empty days: no placeholder shown to public — day section simply has no notes

### Day Photo Gallery
Up to **10 photos per day**, displayed as a gallery below the journal notes.

- **Display:** Responsive grid — 2 columns on mobile, 3–4 on desktop. Tap any photo to open a full-screen lightbox with swipe navigation between photos.
- **Upload (edit mode, logged-in Planners/Travelers):**
  - "Add photos" button below the gallery (or inline with empty state)
  - Multi-select upload — up to 10 per day total
  - Simple upload, no cropping required (unlike trip hero photos — these are memories, not compositions)
  - Photos stored in Supabase Storage: `trip-photos` bucket, path `day-photos/:trip_id/:day_id/:filename`
  - Upload replaces at the individual photo level — can delete and re-upload individual photos
- **Ordering:** Photos display in upload order. Drag to reorder (logged-in, edit mode).
- **Caption:** Optional per-photo caption. Tap to add/edit in edit mode. Renders below photo in gallery and in lightbox.
- **Public visibility:** Day photos are visible to public viewers when `is_journal_public = true`.

### Item Photo (per trip item)
Any trip item can have a single associated photo. This is separate from day gallery photos.

- **Purpose:** A photo of a specific place, dish, or moment associated with that item ("the cochinillo at Casa Lucio")
- **Upload:** Via item edit modal in planning view OR inline in Journal Mode edit
- **Display in Journal Mode:** Renders as a thumbnail on the collapsed Done item card
- **Display in Itinerary Mode:** Renders as a thumbnail within the full item card (below notes)
- **Storage:** `trip-photos` bucket, path `item-photos/:trip_id/:item_id/:filename`
- **Limit:** 1 photo per item
- **Public visibility:** Item photos are visible to public viewers in both Itinerary and Journal modes

### "What We Did" — Collapsed Item List
Below the journal notes (and above or below the photo gallery — TBD during implementation), Done items for the day render as a compact list.

```
✓  🍽  Casa Lucio
✓  🧭  Alhambra Palace
✓  🚶  Albaicín neighborhood walk
```

- Icon + name only — no time, no cost, no note
- Checkmark prefix to signal "done"
- Not interactive (no un-done from here)
- Hidden if day has no Done items

### Journal Interactivity

**Mark item Done (Active trips, logged-in):**
- In Journal Mode, a Done toggle appears on each item's collapsed card
- Tapping marks the item `status = Done`
- Item moves from the active list to the "What We Did" section on next render
- This is the primary interaction while actively traveling — "we just finished dinner, mark it done"

**Edit journal notes:** Inline, as described above.

**Upload/manage day photos:** Via "Add photos" / delete buttons in edit mode.

**Upload item photo:** Via inline button on item card in Journal Mode edit.

No other editing from Guide View. All item edits (name, time, location, etc.) happen in the planning view.

---

## Data Model Additions

The following additions to the existing schema are required for Guide View:

### New status value
Add `option` to the `trip_items_status` enum:
```
idea | option | shortlisted | confirmed | reserved | done
```

### `trip_days` table additions
| Column | Type | Notes |
|---|---|---|
| `journal_notes` | text, nullable | Freeform day journal entry |

### `day_photos` table (new)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `trip_id` | uuid FK → trips | For RLS |
| `day_id` | uuid FK → trip_days | |
| `storage_path` | text | Supabase Storage path |
| `public_url` | text | Cached public URL |
| `caption` | text, nullable | Optional photo caption |
| `sort_order` | integer | Display order within day |
| `uploaded_by` | uuid FK → users | |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz, nullable | Soft delete |

**Constraint:** Max 10 non-deleted photos per `day_id` (enforced at application layer, validated server-side).

### `trip_items` table additions
| Column | Type | Notes |
|---|---|---|
| `photo_storage_path` | text, nullable | Single item photo — Storage path |
| `photo_public_url` | text, nullable | Cached public URL |
| `photo_uploaded_by` | uuid FK → users, nullable | |

### `trips` table additions
| Column | Type | Notes |
|---|---|---|
| `is_journal_public` | boolean, default false | Public access to Journal Mode |

---

## Sharing — Public URL Behavior

**Public URL format:** `/trip/:id/guide` — same route, no login required when `is_public = true`.

**When `is_public = true`, public viewers see:**
- Guide View in Itinerary Mode
- Confirmed, Reserved, Done items only
- Trip hero photo, day headers, item cards (no costs)
- Item photos
- Journal Mode tab is visible but disabled unless `is_journal_public = true`

**When `is_journal_public = true` (requires `is_public = true`):**
- Journal tab is enabled for public viewers
- Journal notes, day photo galleries, item photos, Done item list all visible
- Edit controls are hidden — read-only

**When neither toggle is on:**
- `/trip/:id/guide` redirects to login for unauthenticated users

---

## Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Guide View always accessible | Yes — to logged-in members always | `is_public` only gates public URL access |
| Item filter (owner) | Option and above | Ideas are scratchpad; Options are actively in play |
| Item filter (public) | Confirmed/Reserved/Done only | Public view is always the curated, finished version |
| Journal public | Separate toggle (`is_journal_public`) | Journal is personal by default; sharing it is opt-in |
| Route | Distinct `/trip/:id/guide` | Shareable, bookmarkable, clean separation from planning |
| Navigation | Sticky sidebar (desktop) + pill nav (mobile) | One scrollable page, smart jump navigation |
| Today auto-scroll | Yes, when Active + start_date set | Passive but smart — no button required |
| Itinerary interactivity | Read-only | Clean separation; edit = go back to planning |
| Journal interactivity | Write-enabled for logged-in members | Notes, Done toggle, photo upload |
| Day photos | Up to 10 per day, gallery display | Memory capture; journals without photos feel incomplete |
| Item photo | 1 per item | Specific memory or reference for that place/dish |
| Photo cropping | Not required for day/item photos | These are memories, not compositions |
| Done toggle in Journal | Yes, Active trips | Core active travel use case — "we just did this" |
| Option status | Added between Idea and Shortlisted | Disambiguates "considering" from "just an idea" |

---

## Out of Scope for This Feature

- Video embeds (deferred to Phase 3 — Wistia integration)
- Reactions UI in Guide View (reactions set from planning view; may surface as read-only display in Journal Mode in a future pass)
- Map integration
- Offline support / PWA caching of Guide View
- Photo editing or filters
- Comments or social features on public Guide View
- AI-generated summaries or captions
