-- Transport arrival date, for overnight trips (red-eyes, night trains).
-- Null = arrives the same day as it departs. Lodging keeps using check_out_date.
alter table public.trip_items add column if not exists arrival_date date;
