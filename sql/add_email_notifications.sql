-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm).
--
-- Adds what the "You've been added to a trip" email needs. Purely additive:
-- two new columns, nothing existing is changed or removed.
--
-- 1. user_profiles.email_member_added — per-person on/off switch for this
--    email. Defaults to ON. There is deliberately no "unsubscribe all"
--    column: "turn all off" in Settings (and in an email's unsubscribe page)
--    just sets every email_* column to false. When a future email type adds
--    its own email_* column, give it default false for anyone whose existing
--    email_* columns are all false, and true for everyone else.
--
-- 2. trip_members.added_email_sent_at — stamped the moment the server
--    "claims" the right to email a new member. Guarantees one email per
--    membership even if the request is repeated, and stops a signed-in user
--    from re-triggering emails to someone already on the trip.

alter table public.user_profiles
  add column if not exists email_member_added boolean not null default true;

alter table public.trip_members
  add column if not exists added_email_sent_at timestamptz;

-- Everyone already on a trip has already been "told" (or never will be) —
-- mark them handled so enabling the feature can never email old members.
update public.trip_members
set added_email_sent_at = now()
where added_email_sent_at is null;
