-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm).
-- Additive only — nothing existing is changed or removed.
--
-- Powers two emails sent by the hourly trip-timeline sweep:
--   * "Day 2" check-in (kind trip_day_two): the evening of a trip's second
--     day, local time, encouraging the traveler to start journaling.
--   * "Starts in 3 days" (kind trip_starts_soon): a link to the Guide plus
--     what's still open on the to-do list.

-- 1. Per-person switches (see sql/add_email_notifications.sql for the rule).
--    Anyone who has already turned off every existing email stays off for the
--    new ones too, so a new email type can never override "unsubscribe all".
alter table public.user_profiles
  add column if not exists email_trip_day_two boolean not null default true,
  add column if not exists email_trip_starts_soon boolean not null default true;

update public.user_profiles
set email_trip_day_two = false,
    email_trip_starts_soon = false
where email_member_added = false
  and email_journal_reminder = false;

-- 2. Sends are logged in the existing trip_email_sends table (one row per
--    trip + kind + date), which is what stops a repeat. Its `for_end_date`
--    column was named for the journal reminder; for these kinds it holds:
--      trip_day_two      -> the date of the trip's second day
--      trip_starts_soon  -> the trip's start date
--    so a date edit makes a trip eligible for one fresh email, same as the
--    journal reminder. Nothing to alter — just the backfill below.

-- 3. Backfill: mark moments that have already passed as handled, so turning
--    this on can never email about a trip that is already underway.
insert into public.trip_email_sends (trip_id, kind, for_end_date)
select t.id, 'trip_day_two', (t.start_date + 1)
from public.trips t
where t.start_date is not null
  and (t.start_date + 1) <= current_date
on conflict do nothing;

insert into public.trip_email_sends (trip_id, kind, for_end_date)
select t.id, 'trip_starts_soon', t.start_date
from public.trips t
where t.start_date is not null
  and t.start_date <= current_date + 2
on conflict do nothing;
