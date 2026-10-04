-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm).
-- Additive only — nothing existing is changed or removed.
--
-- Powers two emails sent by the daily trip-memories sweep:
--   * "X years ago today" (kind trip_memories): on the anniversary of a day
--     from a past trip that has journal memories, a look back at that day.
--   * "Add your memories" nudge (kind trip_journal_nudge): the same
--     anniversary for a past trip whose journal is completely empty.
-- Both share ONE per-person switch, email_trip_memories.

-- 1. Per-person switch (see sql/add_email_notifications.sql for the rule).
--    Anyone who has already turned off every existing email stays off for
--    this one too, so a new email type can never override "unsubscribe all".
alter table public.user_profiles
  add column if not exists email_trip_memories boolean not null default true;

update public.user_profiles
set email_trip_memories = false
where email_member_added = false
  and email_journal_reminder = false
  and email_trip_day_two = false
  and email_trip_starts_soon = false;

-- 2. A per-PERSON send log (trip_email_sends is per trip). It does three jobs:
--    * the unique key allows one email per person, per trip, per kind, per year
--      (and doubles as the "claim" that stops a repeat send);
--    * sent_at powers the spacing limits (14 days between any two memory
--      emails/nudges, 30 days between nudges);
--    * day_id records which day was featured, so the rotation can show the
--      least recently featured day next.
--    Server-only: no policies, nothing for the browser to read or write.
create table if not exists public.user_email_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  trip_id uuid references public.trips(id) on delete cascade,
  day_id uuid references public.trip_days(id) on delete cascade,
  for_year integer not null,
  sent_at timestamptz not null default now(),
  unique (user_id, kind, trip_id, for_year)
);
alter table public.user_email_sends enable row level security;
revoke all on public.user_email_sends from anon, authenticated;

create index if not exists user_email_sends_user_sent
  on public.user_email_sends (user_id, sent_at desc);
