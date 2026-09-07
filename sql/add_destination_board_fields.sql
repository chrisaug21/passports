-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm),
-- or with `supabase db query --linked --file sql/add_destination_board_fields.sql`
-- against the linked project.
--
-- Adds the lightweight scheduling and manual-order fields used by the
-- Destinations board. These live on trips because a destination is the same
-- row as a trip, with status = 'destinations'.

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS target_year integer,
  ADD COLUMN IF NOT EXISTS target_month integer,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'trips'::regclass
      AND conname = 'trips_target_month_check'
  ) THEN
    ALTER TABLE trips
      ADD CONSTRAINT trips_target_month_check
      CHECK (target_month IS NULL OR target_month BETWEEN 1 AND 12);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'trips'::regclass
      AND conname = 'trips_target_month_requires_year_check'
  ) THEN
    ALTER TABLE trips
      ADD CONSTRAINT trips_target_month_requires_year_check
      CHECK (target_month IS NULL OR target_year IS NOT NULL);
  END IF;
END $$;
