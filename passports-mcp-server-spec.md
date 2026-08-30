# Passports MCP Server — Spec (v2)

**Status:** Phase 0 not started. This is a planning document for a future implementation session.

**Audience:** A fresh Claude Code session with no memory of how this was scoped. Read this whole document before writing any code. This is a revision of an earlier draft — the "Revision history" section below explains what changed and why, since the original draft's core auth design turned out not to be buildable as written.

## Revision history

**v1 → v2 (2026-08-29):** The original draft designed Phase 0 around the user generating an opaque "connector token" in the app and pasting it into Claude.ai's custom connector settings as a Bearer token. Anthropic's own connector-authentication docs (checked at [claude.com/docs/connectors/building/authentication](https://claude.com/docs/connectors/building/authentication) and confirmed against the live "Add custom connector" dialog) rule this out: Claude.ai's custom connectors support real OAuth (the standard path) or `static_headers` — a **beta, organization-admin-configured, org-wide shared credential**, not a personal per-user token paste. There is no mechanism for an individual user to paste their own bearer token into a custom connector today.

**Consequence:** real OAuth 2.0, which v1 treated as optional future polish ("Noted but deferred"), is now Phase 0's actual scope — not a later upgrade. The good news: this reuses almost all of v1's hard design work (encrypted refresh-token storage, rotation/race handling, `needs_reconnect` status) — it just gets triggered by a real OAuth handshake instead of a copy-pasted secret, and removes the "raw secret shown on screen" risk entirely. See **Auth model** below for the full rewrite.

Also decided in this revision:
- Settings UI location (was an open question in v1) — see **Where "Settings" lives in the app**.
- Rate limiting on write tools moves from "deferred" (v1) to **mandatory starting Phase 2** — a leaked/misbehaving connection can already spam every trip a single user owns once `create_trip_item` exists; that's not a "wait for more users" problem.
- Phase 3's proposal expiry is pinned at **30 minutes** (v1 left this as "implementer's judgment" — it's a security-relevant parameter, not a taste call).
- Code location for the MCP server is confirmed: an isolated `mcp-server/` folder, not repo root — see **Code location** below.

## Why this exists

The user wants to use Claude (specifically Claude.ai on the web) as a planning assistant for their trips in this app: read what's already planned for a work-in-progress trip, read past trips (itineraries + journal entries) to learn their taste, and — eventually — act on suggestions by adding, editing, or removing items directly in the app, instead of the user doing it by hand.

**This is a multi-user app, not a personal tool.** Passports has a real sign-up flow and is built around `trip_members`/shared trips, even though the current active user is effectively one person today. The MCP server must be designed so any account holder can connect their own Claude.ai to their own trips — not hardcoded to one person. This shaped essentially every decision below.

Two earlier, smaller features already exist to partially solve "reading," and are unaffected by this work:

- [`netlify/functions/trip-export.js`](netlify/functions/trip-export.js) — a public, read-only, plain-text export of one trip (`?mode=itinerary` or `?mode=planning`), reachable via a share link toggle in trip settings. Anonymous, no auth, one trip at a time. Keep it — it solves a different problem (sharing a trip with anyone, including non-users) than the MCP server does (a signed-in user's own AI assistant across all their trips).
- The MCP server described here is the real solution: authenticated as whichever user connects it, not limited to one trip, not limited to reading, usable conversationally from Claude.ai.

## What MCP is, briefly

MCP (Model Context Protocol) lets an AI assistant call **tools** — named functions with a JSON schema — against an external system. The assistant can only do what a tool explicitly allows; there's no general database or filesystem access. A "remote" MCP server is an HTTP server implementing the MCP wire protocol, reachable from Claude.ai as a "custom connector" a user adds in their own Claude.ai account settings.

**This must be a remote server**, not a local stdio one, because the target client is Claude.ai on the web, not Claude Code:

- It needs a public URL — Netlify Functions in this repo is the natural home, no new hosting.
- It needs per-user authentication (see below) — this is not optional in a multi-user app, since a shared secret would let one user act as another.
- It should be built with the official `@modelcontextprotocol/sdk` npm package rather than hand-rolled JSON-RPC, to stay correct as the spec evolves.

## Code location

**Confirmed: an isolated `mcp-server/` folder**, not repo root. Only that folder gets a `package.json` / `node_modules` — the rest of the app (`src/`) stays exactly as dependency-free as it is today. `netlify/functions/` gets a thin wrapper function that requires into `mcp-server/`, matching how Netlify Functions bundle per-function dependencies.

```text
mcp-server/
  package.json
  src/
    index.js              — MCP server entry (tool registration, transport)
    oauth/
      metadata.js          — serves .well-known/oauth-authorization-server + oauth-protected-resource
      register.js          — DCR endpoint
      authorize.js         — login/consent step
      token.js              — code exchange + refresh, Supabase refresh-token rotation logic
    tools/                  — one file per MCP tool (Phase 1+)
    lib/
      supabase-rest.js      — REST helper, mirrors trip-export.js's fetch pattern

netlify/functions/
  mcp.js                                       — thin wrapper requiring mcp-server/src/index.js
  mcp-oauth-approve.js                          — the browser's POST when the user clicks Allow
  mcp-oauth-token.js
  mcp-oauth-register.js
  mcp-oauth-metadata-resource.js                — /.well-known/oauth-protected-resource
  mcp-oauth-metadata-authorization-server.js    — /.well-known/oauth-authorization-server
```

(Implementation note, added after Phase 0 shipped: the two metadata documents were originally one function branching on a `?type=` query param — a caching layer in front of it served the wrong document for one of the two paths in production, breaking client registration. Splitting into two functions with distinct URLs and no caching removed the ambiguity.)

**Required repo-wide update, part of the Phase 0 PR itself:** `CLAUDE.md`, `AGENTS.md`, and `README.md` all currently state "no build step, no npm dependencies" as a flat rule. Update each to note `mcp-server/` as a scoped, approved exception — e.g. *"The `mcp-server/` folder is the one exception to the no-npm-dependencies rule above: it's the MCP connector backend, isolated with its own `package.json`, and does not affect how the rest of the app (`src/`) is built or run."* Do this in the same PR that creates the folder, not as a follow-up.

## Data model context (for reference — see main CLAUDE.md for full detail)

- Supabase project: `tqxvtsdghobustiatiqm` ("Passports")
- Hierarchy: `trips` → `trip_bases` (1–4) → `trip_days` → `trip_items`. Also `trip_todos`, `trip_packing_items`, `trip_reactions` (schema exists, no UI built yet — out of scope here), `journal_entries`, `journal_item_photos` (confirmed present — see `src/services/journal-service.js`).
- Item statuses: `idea → option → shortlisted → confirmed → reserved` (confirmed against `src/config/constants.js`'s `ITEM_STATUSES`; `is_done` is a separate boolean, not a status value). Note: the main `CLAUDE.md`/`AGENTS.md` docs list a slightly different, stale sequence (`idea → shortlisted → confirmed → reserved → done`) — worth a small separate cleanup PR to those docs at some point, unrelated to this project.
- Soft delete only, everywhere, via `deleted_at` — this app **never hard-deletes** except replaced photo files in storage. The MCP server must follow the same rule: no tool should ever issue a real `DELETE`.
- RLS is already correctly scoped for the real app: `owner_id = auth.uid()`, trip membership checks (`trip_members`), plus the `is_public`/`is_planning_public` anon-read policies added for `trip-export.js`. **This existing RLS is the foundation the MCP server should build on, not bypass** — see Data scoping model below.

## Auth model: real OAuth 2.0 (Dynamic Client Registration), backed by the user's real Supabase session

The core design decision, unchanged from v1: **the MCP server acts as the actual connecting user**, not as a superuser filtering manually by an owner id. Every MCP request resolves to a real Supabase session for a real user, and existing RLS does the rest of the scoping — the database itself refuses to return another user's rows, no matter what a tool's code gets wrong.

What changed in v2 is *how a user establishes that connection*: a real OAuth 2.0 flow using **Dynamic Client Registration (DCR)**, which Claude.ai supports natively with zero setup on Anthropic's end (no waiting on `mcp-review@anthropic.com` approval — that's only needed for the `oauth_anthropic_creds` path, meant for connectors published to Anthropic's public directory, not a personal one-user server).

### How a user connects (Phase 0)

1. In Claude.ai, the user adds a custom connector and enters the MCP server's URL (`https://<netlify-site>/.netlify/functions/mcp` or similar).
2. Claude.ai calls the MCP endpoint, gets a `401` with a `WWW-Authenticate: Bearer resource_metadata="..."` header, and fetches that metadata document — a static JSON file describing where the OAuth endpoints live (`/authorize`, `/token`, `/register`).
3. Claude.ai calls `/register` (DCR) automatically to register itself as an OAuth client. The server stores the returned `client_id` + redirect URI in a new `mcp_oauth_clients` table. No user involvement in this step.
4. Claude.ai opens the user's browser to `/authorize`. This is a real page in the Passports app: if not logged in, it shows the existing login screen; once logged in, it shows a consent screen ("Claude wants to access your trips — Allow / Deny"). This step reuses the app's existing Supabase Auth session — no new login system.
5. On approval, the server issues a short-lived, single-use authorization code (`mcp_oauth_authorization_codes`, PKCE-bound per the MCP spec) and redirects back to Claude.ai's callback URL (`https://claude.ai/api/mcp/auth_callback`).
6. Claude.ai calls `/token` with the code. The server:
   - Validates the code + PKCE challenge.
   - Captures the **user's real Supabase refresh token** (the browser's already-authenticated session already holds one via `supabase-js` — same mechanism v1 described, just triggered by this OAuth step instead of a "connect" button).
   - Encrypts and stores that Supabase refresh token in a new `mcp_connections` row: `(user_id, client_id, encrypted_supabase_refresh_token, label, status, created_at, last_used_at, expires_at, revoked_at)`.
   - Mints its own opaque access token (short-lived, e.g. 1 hour) and refresh token (long-lived, rotates), both **hashed** before storage (like an API key — we only ever need to compare, never recover them; this is distinct from the Supabase refresh token, which must be encrypted, not hashed, since the server needs to present the real value back to Supabase later).
   - Returns those to Claude.ai per RFC 6749 (`application/x-www-form-urlencoded` request, JSON response with `access_token`, `refresh_token`, `expires_in`).
7. The user can see and revoke this connection later via **Settings → Connected Apps** (see below) — same "manage API keys" UX v1 described, just populated by the OAuth flow instead of a manual mint. Show `label` (default to the client name Claude registered, e.g. "Claude"), `created_at`, `last_used_at`, and `status`.

**Token health status, unchanged from v1.** `status` is `healthy` or `needs_reconnect`. The moment a Supabase refresh-token exchange fails (see rotation handling below), set it immediately rather than only surfacing the failure as an error on that one request. Reflect this in the Connected Apps list.

**Expiry policy, unchanged from v1.** `expires_at` on the underlying connection (e.g. 90 days from `last_used_at`, extended on each successful use), with a hard ceiling (e.g. 1 year) as defense-in-depth. Distinct from the short-lived OAuth access token's own `expires_in` — Claude.ai refreshes that reactively on a `401` and proactively up to 5 minutes before its stored expiry, per Anthropic's docs, so the two expiry concepts don't need to match.

### On every incoming MCP request

1. Extract `Authorization: Bearer <our-access-token>`. Hash it, look it up. Reject with `401` (with the `WWW-Authenticate` header, so Claude knows to refresh or re-auth) if missing, not found, expired, or the underlying connection is revoked/expired/`needs_reconnect`.
2. Look up the associated `mcp_connections` row's encrypted Supabase refresh token.
3. Exchange it for a fresh Supabase access token via Supabase's standard token-refresh flow — the same mechanism `supabase-js` does automatically in the browser.
4. **Supabase refresh tokens rotate on use by default** — the exchange returns a new refresh token that must immediately overwrite the stored one, or the next request fails. Confirmed via Supabase's docs ([User sessions](https://supabase.com/docs/guides/auth/sessions), [Refresh Tokens — DeepWiki](https://deepwiki.com/supabase/auth/6.2-refresh-tokens)) that both the legacy and current rotation algorithms support reuse detection and concurrent-refresh handling, and that a password change or account deletion terminates the underlying session — meaning `needs_reconnect` will correctly trigger the next time a stale connection is used, not silently linger. This is the single most likely thing to silently break in production if implemented naively, so handle it explicitly:
   - **Concurrent requests racing on the same stored token.** Serialize refreshes per user (a simple per-user lock or a "refresh in progress" flag with a short timeout is enough at this scale) rather than letting them race.
   - **Retry-once-against-latest.** If an exchange fails with an "already used" style error, re-read the stored refresh token once (in case a concurrent request already rotated it) and retry before giving up and marking `needs_reconnect`.
5. Use the resulting user access token (JWT) + the existing `SUPABASE_ANON_KEY` for all downstream REST calls to Supabase — exactly like the browser client does. RLS then does the real enforcement.

**Real encryption, not encoding.** The stored Supabase refresh token must be encrypted at rest with a real cipher (e.g. AES-GCM) keyed by a secret held only in a Netlify env var — not base64, not reversible-by-inspection. It must never appear in logs, error messages, or crash reports anywhere in the request path. Plan for what encryption-key rotation would look like before you need it (likely: re-encrypting all stored tokens, or accepting a "everyone reconnects" event) rather than discovering there's no plan when the key needs to change.

**No service role key is needed anywhere in this design.** That's a meaningful risk reduction versus a naive multi-tenant design — there's no maximally-privileged credential sitting in a serverless function that a bug could misuse across users.

### Technical constraints from Anthropic's connector docs (verify at build time, don't assume)

Confirmed via [claude.com/docs/connectors/building/authentication](https://claude.com/docs/connectors/building/authentication):

- `/token` must accept `Content-Type: application/x-www-form-urlencoded` (both initial exchange and refresh) — many frameworks default to JSON-only parsing and will 415 here.
- `/register` (DCR) must accept `application/json`.
- Refresh-token failures must return RFC 6749-compliant error codes (`invalid_grant`), not a custom shape, or Claude won't handle them correctly.
- The MCP endpoint's `401` must include `WWW-Authenticate: Bearer resource_metadata="https://.../.well-known/oauth-protected-resource"` — the `resource_metadata` URL doesn't need to be on the same host, which matters since Netlify Functions don't natively serve arbitrary `/.well-known/*` paths at the root; may need an explicit route/redirect in `netlify.toml`.
- Claude includes PKCE (`S256`) on every authorization request — the metadata must advertise `"code_challenge_methods_supported": ["S256"]`.
- Endpoint latency budget: Claude waits up to 10s for discovery/registration/token endpoints, up to 30s for refresh — a Netlify Function cold start plus a Supabase round-trip should comfortably fit, but worth timing during Phase 0 testing.
- Register callback URL `https://claude.ai/api/mcp/auth_callback` wherever the authorization server tracks allowed redirect URIs.

### What can still go wrong, and the residual risk

- A compromised connection lets someone act as that one user (read/write their trips, once later phases ship) — same blast radius as a leaked password, but scoped to one account only, not all accounts.
- Storing encrypted refresh tokens is new sensitive data at rest — real AES-GCM encryption, revocation UI, `status`/`expires_at` fields are the mitigation (see above); Supabase confirms password change / account deletion invalidate the underlying session, bounding how long a stale connection can be misused.
- This is genuinely more upfront work than v1's token-paste design — a real (if small) OAuth authorization server has to exist before any tool call can work at all. See roadmap below.

**No longer deferred:** v1 filed full OAuth as "revisit later, UX polish only." It's Phase 0 now, for the reasons in **Revision history** above.

## Where "Settings" lives in the app

There is no account-level settings page anywhere in the app today — confirmed by reading `src/features/` (only `auth/`, `dashboard/`, `trip/`, `shared/` exist) and the account dropdown itself. The only existing account-related UI is the profile dropdown in the header.

**Decision:** add a second item to that dropdown, below "Profile," labeled **"Settings"** (not "Connected Apps") — chosen for extensibility, since this will likely hold other account-level settings later even though today it's just the one section.

**Exact implementation, confirmed against the current code:**

- The dropdown is defined in [`src/app/bootstrap.js`](src/app/bootstrap.js) (`renderAppShell`, markup ~lines 126–141) as a native `<details>`/`<summary>` element. The panel currently has two buttons: `#open-profile-modal` ("Profile") and `#sign-out-button` ("Sign Out"), each wired via a `document.querySelector("#<id>")?.addEventListener("click", ...)` block around lines 157–182.
- Add a new button `<button class="account-menu__profile" id="open-settings-modal">Settings</button>` between the two existing items, plus a matching click handler that closes the `<details>` (`document.querySelector("#account-menu").open = false`) and calls a new `openSettingsModal()`.
- Follow the exact pattern of [`src/features/shared/profile-modal.js`](src/features/shared/profile-modal.js) for the new modal: a new `src/features/shared/settings-modal.js` exporting `openSettingsModal()`, using the shared `.modal-shell` / `.modal-backdrop` / `.modal-card` classes (defined once in `src/styles/features/dashboard.css`, reused by convention — there is no shared `openModal()` JS helper in this codebase, each modal is copy-paste structure), toggling `body.modal-open` for scroll lock, same as every other modal in the app (`create-trip-modal.js`, `item-editor-modals.js`, etc.).
- The modal's content for Phase 0: a "Connected Apps" section listing rows from `mcp_connections` for the current user (label, created date, last used, status) with a Revoke button per row (sets `revoked_at`, matching the app's soft-delete convention).
- `APP_VERSION` bump applies to this UI change per the usual convention — it's shipped frontend code.

## Phased roadmap

Ship in this order, one phase at a time, with real usage in between before moving to the next. **This session builds Phase 0 only.**

### Phase 0 — Authentication & connector setup

Must exist before Phase 1 can be tested end-to-end:

- New tables: `mcp_oauth_clients` (DCR registrations), `mcp_oauth_authorization_codes` (short-lived, single-use, PKCE-bound), `mcp_connections` (see Auth model above — status/expires_at included).
- OAuth endpoints: metadata document, `/register`, `/authorize` (real login/consent UI, reusing the existing Supabase Auth session), `/token` (code exchange + refresh, with the Supabase rotation/race handling described above).
- The 401/`WWW-Authenticate` handshake on the MCP endpoint itself.
- Settings UI: the new "Settings" menu item + modal (see above), showing Connected Apps (label, created date, last used, status) with revoke.
- `mcp-server/` folder scaffolded with `package.json` + `@modelcontextprotocol/sdk`; thin Netlify Function wrappers.
- `CLAUDE.md` / `AGENTS.md` / `README.md` updated with the scoped npm-dependency exception (see Code location above).
- No MCP tools exist yet at the end of this phase — it's purely the plumbing every later phase needs. Test with the MCP Inspector tool locally before ever registering the connector against production Claude.ai.

### Phase 1 — Read-only

Tools (all scoped automatically to the connected user via RLS):

- **`list_trips`** — all of the connected user's trips (id, title, status, dates, trip_length). Optional `status` filter (planning/upcoming/active/done) so the model can specifically ask for past trips when building a "taste profile."
- **`get_trip`** — full bundle for one trip: trip meta, bases, days, **all items regardless of status** (unlike the public export — this is the account owner or a trip member, so no confirmed/reserved-only filtering), including costs, confirmation refs, notes, everything the user themself could see in the app.
- **`get_trip_journal`** — journal entries (day-level and item-level notes) and photo URLs (URLs only, not binary image data) for one trip.

No special "cross-trip taste analysis" tool is needed — Claude can call `list_trips` (with a completed-trips filter) then `get_trip` + `get_trip_journal` per trip in a loop when asked something like "look at my past trips and suggest ideas for this one." Make sure tool descriptions make that pattern obvious.

Note: since RLS already governs `trip_members`-shared trips too, a user who's a member (not owner) of someone else's trip will naturally see that trip via these tools as well, exactly as they would in the app. That's expected and correct — no special-casing needed.

### Phase 2 — Additive writes only

- **`create_trip_item`** — creates a new `trip_items` row. **Hardcode `status: 'idea'`, `is_anchor: false` regardless of input** — this tool can never create a confirmed/reserved item, and can never touch an existing row. This is the user's own risk mitigation from the scoping conversation: the AI can suggest things into the plan, but can't jump straight to "confirmed" or overwrite anything.
- Fields: `tripId`, `title`, `itemType`, optionally `baseId`, `dayId`, `mealSlot`/`activityType`/`transportMode` etc., `notes`, `url`. Reuse the shape of `createDetailedTripItem` in [`src/services/trips-service.js`](src/services/trips-service.js) as the reference for valid fields — mirror its validation (item_type/meal_slot/etc enums), don't reinvent it.
- Since this now goes through the user's real session, RLS's existing `trip_members` insert policy already enforces that only planners/members of the target trip can add to it — another case where reusing real auth removes a class of bugs a hand-rolled check could introduce.
- **Mandatory in this phase, not deferred: a crude per-connection rate limit on write tool calls.** e.g. add `write_count` + `window_started_at` to the `mcp_connections` row (or a small counters table); on each write, reset the window if it's >60s old, otherwise increment; reject with a clear, model-relayable error (e.g. "Too many changes at once — try again in a minute") past a threshold like 20 writes/min. No new infra — reuses the request path that already looks up the connection. Rationale: once `create_trip_item` exists, a single compromised connection can already spam junk into every trip one user owns — that's a risk at one user, not "once there are many users."
- **Also build starting this phase: a lightweight audit log.** A simple table recording every write tool call — which tool, which trip/item id, a timestamp, and which `mcp_connections` row made the call (not necessarily the full before/after payload, though that's worth considering too). This doesn't need a UI yet, but it needs to exist before Phase 3 ships, since that's where an audit trail actually starts mattering (see below). If something ever goes wrong, this is the difference between "we can see exactly what the AI changed and manually fix it" and having no idea.

### Phase 3 — Editing existing items

The risk here isn't the database operation — it's that Claude.ai may call a tool without first confirming the change with the user the way this coding agent's permission system does. Mitigate that with a **propose-then-confirm pattern** instead of a single tool that commits immediately:

- **`propose_update_trip_item`** — takes the intended changes, validates them, and returns a plain-language summary of what would change (e.g. "move 'Dinner at X' from Day 2 to Day 3, change status from idea to confirmed") plus a short-lived proposal id. Does not touch the database.
- **`confirm_update_trip_item`** — takes a proposal id and actually commits the change. This gives Claude a natural moment to show the user the proposed diff and get a real answer before anything happens, rather than hoping the client-side UX surfaces it.
- Store proposals in a short-lived table (or reuse the audit log table with a `pending` state) with a **pinned 30-minute expiry** — an old, unconfirmed proposal is not committable after that, closing off the risk of a stale proposal from an abandoned conversation getting confirmed much later.
- Log the eventual commit in the Phase 2 audit log, referencing which proposal it came from.

### Phase 4 — Soft delete

- **`propose_delete_trip_item`** / **`confirm_delete_trip_item`** — same propose-then-confirm shape as Phase 3, same 30-minute proposal expiry, since a mistaken delete is exactly the kind of thing that pattern exists to prevent. `confirm_delete_trip_item` sets `deleted_at`, exactly like [`softDeleteTripItem`](src/services/trips-service.js) does today — never a real SQL `DELETE`. Since this mirrors the app's own reversible-by-design convention, the actual risk here is lower than "delete" sounds — a mistaken deletion is recoverable (manually, via SQL, until a restore feature exists — there isn't one today), and the propose/confirm step plus the audit log entry make it easy to find and reverse.

### Explicitly out of scope (don't build without a new conversation first)

- Creating or deleting whole **trips** (as opposed to items within a trip).
- Anything touching `trip_members` roles, auth, or account settings beyond the Settings/Connected Apps UI itself.
- Hard deletes of anything.
- Any bulk/batch destructive operation (e.g. "delete all idea items") — deserves its own scoping conversation given the blast radius.

## Risk summary

| Phase | New capability | Main risk | Mitigation |
|---|---|---|---|
| 0 | Real OAuth authorization server in front of Supabase Auth; store per-user credentials | New attack surface (four new endpoints implementing a security protocol), plus encrypted-at-rest refresh tokens as a new class of sensitive data | Follow Anthropic's documented contract exactly (PKCE, RFC 6749 error codes, 401/WWW-Authenticate handshake); real AES-GCM encryption; revocation UI; `status`/`expires_at` fields; confirmed Supabase invalidates sessions on password change/account deletion |
| 0 | Refresh-token rotation on every request | A missed or raced rotation silently breaks a user's connection | Serialize refreshes per user, retry-once-against-latest on an "already used" failure, surface `needs_reconnect` in the Settings UI instead of failing silently |
| 1 | Read a connected user's own (and shared) trips | A compromised connection exposes that one user's trip history | Per-user OAuth connection, revocable independently, RLS still the backstop even if server code has a bug |
| 2 | Create idea-status items | Clutter (junk ideas added), not data loss; a compromised connection could spam writes | Always `status: 'idea'`, never touches existing rows, RLS still requires real trip membership, logged in the audit table, per-connection rate limit |
| 3 | Edit existing items | Could change something the user didn't intend (wrong day, wrong status) | Propose-then-confirm two-step tool pattern with a 30-minute proposal expiry gives the user a checkpoint before the write commits; audit log records what happened |
| 4 | Soft-delete items | Item disappears from the UI | Propose-then-confirm pattern; reversible via `deleted_at`, matches app convention; audit log makes a mistaken delete easy to find, though no restore UI exists yet |

**Deferred hardening (reasonable ideas, not required for the phases above):** "new device/first use" notifications similar to a sign-in alert. Worth revisiting once there are enough real users that the threat model changes — not worth the build cost today. (Rate limiting itself is no longer deferred — see Phase 2.)

## Technical notes for whoever builds this

- No service role key anywhere in the MCP request path — only the anon key + a per-request user access token obtained via the refresh-token exchange described above.
- Reuse the REST-query style from `trip-export.js` (`fetchFromSupabase`-equivalent helper, direct calls to `${SUPABASE_URL}/rest/v1/...}`), but swap the fixed anon-only auth for the per-user JWT once resolved.
- The MCP transport to implement is whatever the current spec calls "Streamable HTTP" at build time — check the `@modelcontextprotocol/sdk` docs fresh, since transport names/shapes have changed before and will likely change again.
- **Verify at build time**: Netlify Function execution-time behavior against MCP's Streamable HTTP transport and the OAuth endpoint latency budgets above (10s discovery/registration/token, 30s refresh) — do a quick spike before committing further, this was not verified during scoping.
- Test locally with the MCP Inspector tool before ever registering the connector against production Claude.ai.
- Phase 0 has no destructive MCP tools (it's auth plumbing only), so testing directly against the production Supabase project with the user's own account is reasonably low-risk — no separate staging environment is required for this phase specifically. Revisit for later phases once real writes exist.
- The audit log table (Phase 2+) and the proposal table (Phase 3+) can reasonably be the same table with a `state` column (`committed` vs `pending`) rather than two separate tables — implementer's judgment.
- `APP_VERSION` bump convention from the main CLAUDE.md still applies to changes to the shipped PWA itself; the new Settings UI is app-facing and should follow it. The MCP function endpoints themselves are backend-only — use judgment on whether a given change counts as "shipped code," and ask if unsure.

## Open questions — resolved during this scoping pass

1. ~~Confirm Supabase's actual behavior for refresh-token rotation and for invalidation on password change / logout-everywhere.~~ **Resolved**: confirmed via Supabase docs — password change and account deletion both terminate the session and invalidate refresh tokens; both rotation algorithms (V1/V2) support reuse detection and concurrent-refresh handling. See citations in Auth model above.
2. ~~Confirm current Claude.ai custom-connector requirements still accept a plain bearer token.~~ **Resolved, and the answer changed the design**: they don't, for an individual user — see Revision history.
3. ~~Confirm they're okay adding `package.json` + `@modelcontextprotocol/sdk`, and where it should live.~~ **Resolved**: isolated `mcp-server/` folder; CLAUDE.md/AGENTS.md/README.md updated with a scoped exception note, in the same PR.
4. ~~Where in the app should the connector-management UI live?~~ **Resolved**: new "Settings" item in the existing account dropdown (`src/app/bootstrap.js`), opening a new modal (`src/features/shared/settings-modal.js`) following the existing `profile-modal.js` pattern.
5. **Confirmed by the user**: sit with Phase 1 (and each subsequent phase) before greenlighting the next one — this scoping session builds Phase 0 only.

No remaining open questions block starting Phase 0.
