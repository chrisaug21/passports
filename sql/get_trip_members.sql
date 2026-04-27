-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm).
--
-- Creates a SECURITY DEFINER function so any authenticated member of a trip
-- can fetch the full member list, bypassing the trip_members RLS SELECT policy
-- that otherwise restricts each user to seeing only their own row.
--
-- Safety: the function checks that auth.uid() is an active member of the
-- requested trip before returning any rows; non-members get an empty result.

CREATE OR REPLACE FUNCTION get_trip_members(p_trip_id uuid)
RETURNS TABLE (
  id          uuid,
  trip_id     uuid,
  user_id     uuid,
  role        text,
  invited_at  timestamptz,
  accepted_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tm.id,
    tm.trip_id,
    tm.user_id,
    tm.role,
    tm.invited_at,
    tm.accepted_at
  FROM trip_members tm
  WHERE tm.trip_id = p_trip_id
    AND tm.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM trip_members viewer
      WHERE viewer.trip_id = p_trip_id
        AND viewer.user_id = auth.uid()
        AND viewer.deleted_at IS NULL
    )
  ORDER BY tm.invited_at ASC;
$$;
