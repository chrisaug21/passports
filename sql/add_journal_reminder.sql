-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm).
-- Additive only — nothing existing is changed or removed.
--
-- Powers the "add your memories to the trip journal" reminder email, sent
-- once by a daily sweep 7–10 days after a trip ends.

-- 1. Per-trip switch: a planner can turn the reminder off for one trip.
alter table public.trips
  add column if not exists journal_reminders_enabled boolean not null default true;

-- 2. Per-person switch (see sql/add_email_notifications.sql for the rule).
--    Anyone who has already turned off every existing email stays off for this
--    new one too, so a new email type can never override "unsubscribe from all".
alter table public.user_profiles
  add column if not exists email_journal_reminder boolean not null default true;

update public.user_profiles
set email_journal_reminder = false
where email_member_added = false;

-- 3. A log of reminders sent, one row per trip per END DATE. This is what
--    keeps a trip from being emailed twice, and it's how date changes work:
--    if a trip's dates move, its end date changes, which makes it eligible
--    for one fresh reminder (still only inside the 7–10 day window).
--    Server-only: RLS is on with no policies, so only the server's secret key
--    can read or write it. Kept separate from `trips` so sweeps never touch
--    trips.updated_at.
create table if not exists public.trip_email_sends (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind text not null,
  for_end_date date not null,
  sent_at timestamptz not null default now(),
  unique (trip_id, kind, for_end_date)
);

alter table public.trip_email_sends enable row level security;

-- 4. Backfill: every trip that has already ended is marked as handled, so
--    turning this on can never send reminders for old trips.
insert into public.trip_email_sends (trip_id, kind, for_end_date)
select t.id, 'journal_reminder', (t.start_date + (t.trip_length - 1))
from public.trips t
where t.start_date is not null
  and t.trip_length >= 1
  and (t.start_date + (t.trip_length - 1)) < current_date
on conflict do nothing;
