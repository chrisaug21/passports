# Passports

Passports is a personal trip planning and travel diary web app for `passports.chrisaug.com`.

The current foundation includes:
- Supabase auth
- dashboard and trip creation
- trip detail pages
- master list quick add and editing
- base management
- days view
- trip settings and trip lifecycle controls
- item and base soft delete
- dashboard Past Trips section for completed trips

## Stack
- Vanilla HTML, CSS, and JavaScript with ES modules
- Supabase for auth and data
- Netlify for local dev and deployment

## Local Development

Use Netlify local dev so the app gets its environment variables correctly:

```bash
netlify dev
```

Then open the local URL Netlify prints.

Do not use `file://` or a simple static server for auth flows.

## Project Structure

```text
index.html
netlify.toml
src/
  app/         # bootstrapping and routing
  config/      # env loading and constants
  features/    # UI by feature area
  lib/         # formatting and shared helpers
  services/    # Supabase data access
  state/       # in-memory app state
  styles/      # tokens, base, layout, components, feature CSS
```

## Current Product Areas

- Auth: sign up, sign in, sign out
- Dashboard: list trips and create new trips
- Dashboard: separates active trips from Past Trips and hides soft-deleted trips
- Trip detail:
  - trip settings
  - base management
  - master list
  - item editing
  - item soft delete
  - base soft delete
  - trip mark-as-done and delete
  - days view

## Key Data Rules

- Soft delete only. Main records are archived with `deleted_at`; they are never hard deleted.
- `base_id` and `day_id` on `trip_items` are independent.
- Trip-level items can still be pinned to a day.
- Public sharing, todos, packing, members, and richer diary features are planned next phases.

## Planning Docs

- [passports-spec.md](./passports-spec.md): product spec and schema notes
- [passports-build-plan.md](./passports-build-plan.md): working build sequence and next-slice planning
- [AGENTS.md](./AGENTS.md): repo instructions for AI coding agents
- [CLAUDE.md](./CLAUDE.md): project context and implementation notes
