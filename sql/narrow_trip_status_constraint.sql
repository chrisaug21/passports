-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm).
--
-- Drops 'upcoming' from the allowed trips.status values. It was part of the
-- original CHECK constraint but nothing in src/ ever read or wrote it --
-- see passports-destinations-spec.md, "Key existing-schema finding". The
-- app-side TRIP_STATUSES constant (src/config/constants.js) has already
-- been narrowed to match; this brings the database constraint in line.
--
-- Aborts instead of narrowing if any trip currently has status = 'upcoming'
-- -- that would violate the new, stricter constraint. The constraint's
-- actual name is looked up rather than assumed, since Postgres's default
-- naming for an inline CHECK isn't guaranteed.

DO $$
DECLARE
  v_constraint_name text;
  v_upcoming_count int;
BEGIN
  SELECT COUNT(*) INTO v_upcoming_count FROM trips WHERE status = 'upcoming';

  IF v_upcoming_count > 0 THEN
    RAISE EXCEPTION
      'Found % trip(s) with status = ''upcoming'' -- resolve these before narrowing the constraint',
      v_upcoming_count;
  END IF;

  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'trips'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';

  IF v_constraint_name IS NULL THEN
    RAISE EXCEPTION
      'Could not find the status CHECK constraint on trips -- inspect pg_constraint manually';
  END IF;

  EXECUTE format('ALTER TABLE trips DROP CONSTRAINT %I', v_constraint_name);
END $$;

ALTER TABLE trips
  ADD CONSTRAINT trips_status_check
  CHECK (status = ANY (ARRAY['destinations', 'planning', 'active', 'done']));
