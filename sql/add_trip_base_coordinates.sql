-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm),
-- or with `supabase db query --linked --file sql/add_trip_base_coordinates.sql`
-- against the linked project.
--
-- Adds map coordinates to trip bases. Coordinates are nullable so existing
-- bases can keep working until the user maps them.

ALTER TABLE trip_bases
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric;
