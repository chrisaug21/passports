  Recommended App Structure

  I would keep a single-page app with one small runtime entry file and many focused
  modules:

  /
    index.html
    netlify.toml
    package.json                  # only if you want local tooling/helpers
    passports-spec.md

    /src
      /app
        app.js                    # runtime spine: boot app, route, hydrate state
        router.js                 # tiny URL router
        bootstrap.js              # env checks, auth session boot, initial data load

      /config
        env.js                    # reads Netlify-injected env
        constants.js              # statuses, item types, roles, colors, defaults

      /lib
        supabase.js               # client init only
        events.js                 # lightweight pub/sub for UI refreshes
        storage-cache.js          # read-only localStorage cache wrapper
        format.js                 # dates, times, currency, labels
        validate.js               # form validation rules
        guards.js                 # permission checks
        sort.js                   # item/day/base sorting helpers
        derive.js                 # computed values: end date, trip totals, visible items

      /services
        auth-service.js
        trips-service.js
        bases-service.js
        days-service.js
        items-service.js
        todos-service.js
        packing-service.js
        members-service.js
        reactions-service.js      # Phase 2, stub early if helpful
        photos-service.js         # Phase 2
        public-trip-service.js

      /state
        session-store.js          # signed-in user + auth state
        app-store.js              # current route, filters, loading flags
        trip-store.js             # active trip, bases, days, items, totals

      /features
        /auth
          login-page.js
          signup-page.js
          invite-accept-page.js

        /dashboard
          dashboard-page.js
          trip-card.js
          create-trip-modal.js

        /trip
          trip-layout.js
          trip-header.js
          trip-nav.js
          trip-summary.js
          trip-settings-panel.js

        /master-list
          master-list-page.js
          master-list-filters.js
          item-list.js
          item-row.js
          quick-add-form.js
          item-editor-modal.js

        /days
          days-page.js
          base-tabs.js
          day-card.js
          day-item.js
          unassigned-pool.js
          drag-drop.js

        /bases
          base-manager.js
          base-form-modal.js

        /todos
          todos-panel.js
          todo-list.js
          todo-form.js

        /packing
          packing-panel.js
          packing-list.js
          packing-form.js

        /members
          members-panel.js
          invite-member-form.js
          member-row.js

        /public-trip
          public-trip-page.js
          public-trip-hero.js
          public-day-list.js

        /shared
          button.js
          input.js
          select.js
          modal.js
          drawer.js
          tabs.js
          badge.js
          empty-state.js
          loading-state.js
          error-state.js
          toast.js
          confirm-dialog.js

      /styles
        main.css
        tokens.css
        base.css
        utilities.css
        layout.css
        components.css
        /features
          dashboard.css
          trip.css
          master-list.css
          days.css
          forms.css
          todos.css
          packing.css
          members.css
          public-trip.css

      /assets
        /icons
        /images

  Why this split:

  - app starts the app and routes views.
  - services is the data layer: each file talks to Supabase for one domain.
  - state holds what is currently loaded in memory so modules are not reaching into each
    other.
  - features keeps UI grouped by user problem, not by technical type.
  - lib holds reusable helpers and derived logic.
  - This gives you modularity from day one without bringing in a framework.

  CSS Organization

  I’d use plain CSS files with a strict layering approach:

  1. tokens.css
     This is your design system foundation: color variables, spacing, radius, shadows,
     font stacks, z-index values, status colors.
  2. base.css
     Resets, body styles, typography defaults, links, form element baseline.
  3. utilities.css
     Small reusable classes like .visually-hidden, .stack, .cluster, .sr-only, .text-
     muted.
  4. layout.css
     App shell, page widths, grids, sidebars, sticky headers, responsive breakpoints.
  5. components.css
     Shared UI pieces like buttons, badges, pills, tabs, modals, cards, toasts.
  6. Feature CSS files
     Only styles specific to dashboard, master list, days view, settings, public trip,
     etc.

  A few rules I’d keep:

  - Use CSS custom properties everywhere for color, spacing, type, and status styling.
  - Keep selectors shallow and class-based. That means simple class names instead of deep
    chains, so styles stay predictable.
  - Use a small naming pattern like trip-card, trip-card__title, trip-card--active.
  - Put responsive changes next to the component they affect, not all in one giant media-
    query file.

  Phase 1 Build Order

  I’d build MVP in this order:

  1. App shell, routing, and auth
     This is the foundation. Until login, session handling, and route protection exist,
     everything else is awkward to test.
  2. Supabase data layer and shared domain helpers
     Before UI gets large, define the service modules and derived helpers for trip totals,
     dates, permissions, public filtering, and role rules.
  3. Dashboard and trip creation
     This gives you the first complete flow: sign in, create trip, land somewhere useful.
  4. Trip layout plus read-only trip load
     Build the trip page shell, header, tabs, and data fetch before forms and drag/drop.
     Make sure the app can reliably load trips, bases, days, items, todos, and packing
     data.
  5. Master List with quick add and edit
     This should be the first real planning workflow because the spec says it is the
     default view and fastest capture path.
  6. Base management and trip settings
     These shape the trip hierarchy and dates. Days view depends on bases and trip length
     behaving correctly.
  7. Days view without drag/drop first
     Render bases, days, assigned items, and unassigned pool in stable read-only form
     before adding movement.
  8. Assignment and reorder interactions
     Add drag/drop or simpler move controls once the underlying rendering and save model
     are already stable.
  9. Trip todos and packing list
     These are important, but they are isolated and lower-risk once the main trip page
     exists.
  10. Cost rollups and summary calculations
     Easier to add after item creation/editing is already working.
  11. Membership and invites
     Auth should exist early, but the full member-management UI can come after the single-
     user planning loop works.
  12. Public share page
     Last in Phase 1, because it depends on trip data, item filtering rules, and stable
     display structure.

  Dependencies that matter:

  - Master List depends on auth, trip load, and item services.
  - Days view depends on trips, bases, days, and items.
  - Cost totals depend on item editing existing first.
  - Public share depends on the same trip display model plus filtering rules.
  - Invites depend on auth and role enforcement being settled.

  Spec Areas That Feel Ambiguous or Worth Tightening

  1. “Admin” vs “Planner”
     The Phase 1 section says “Admin only,” but the rest of the spec consistently uses
     Planner. I would standardize on Planner everywhere.
  2. Live schema vs spec schema
     The top of the spec still says “Supabase (new project)” and the setup checklist says
     migrations have not run yet, while your request says the schema is already live. That
     mismatch needs to be resolved before implementation.
  3. User table naming
     The schema references users, but Supabase Auth uses auth.users. If you already have a
     public users profile table, great. If not, that needs to be explicit because many
     foreign keys depend on it.
  4. Soft delete behavior
     The spec mentions archiving trips as soft delete, but not whether items, todos,
     packing items, and bases also need archive flags. I would decide this before coding
     so delete behavior stays consistent.
  5. Lodging model
     The spec says one lodging item per base, or multiple options during planning. That
     means the UI and rules need clarity on whether multiple lodging records can coexist
     on one base in all statuses, and how one becomes the surfaced check-in/check-out
     source.
  6. Day generation rules
     When trip_length changes, the spec says days are added or removed from the end. It
     does not say what happens to items assigned to removed days. I would not guess here.
  7. Base date rules
     The spec says base dates are “derived when possible” but also editable. We should
     decide whether base dates are source-of-truth inputs, derived displays, or a hybrid
     with warnings when they conflict.
  8. Public route identifier
     The spec uses /trip/:id. Using raw UUIDs publicly is simple, but not ideal if you
     ever want revocable sharing links. I would consider a public_share_slug or token even
     if Phase 1 starts with UUID-based access.
  9. Invite flow
     “Invite by email” is specified, but not whether an invited user must already have an
     account, whether invites send email, or whether this is initially just a manual add-
     after-signup workflow. This affects scope a lot.
  10. Traveler edit rights
     The spec says Bailey can add items but cannot edit others’ items. It should
     explicitly say whether Travelers can edit or delete their own items after creating
     them.
  11. Drag/drop on mobile
     The spec wants phone-friendly active use. Drag/drop can be awkward on touch devices.
     I’d likely build move controls first and treat drag/drop as progressive enhancement
     unless you want touch-first drag as a hard requirement.
  12. Unsplash in Phase 1
     The dashboard wants hero images, but the formal Phase 2 section introduces day photos
     later. We should decide whether trip/base hero image fetching is in MVP from day one
     or whether placeholders are acceptable until the photo integration lands.

  My Recommended Adjustment

  If we want a stable Phase 1, I would treat the MVP backbone as:

  - Auth and roles
  - Dashboard and trip creation
  - Trip shell
  - Master List
  - Bases and settings
  - Days view
  - Todos and packing
  - Costs
  - Membership
  - Public share

  That order keeps the core planning workflow working before layering on collaboration and
  presentation polish.

  No files were modified. No code was written. If you approve this direction, the next
  step should be to lock the ambiguous decisions above, then I can turn this into a
  concrete scaffold plan tied to the actual repo files we’ll create.