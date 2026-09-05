-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm).
--
-- Auto-slots a flex item's sort_order chronologically among its day's other
-- timed flex items whenever time_start (or day_id, or is_anchor) changes, so
-- every writer -- the app UI, the MCP tools, anything else -- gets
-- consistent time-based ordering without having to compute sort_order by
-- hand. This is the same "insert by time" rule the app's own edit form has
-- always used (see insertFlexItemByTime in src/features/trip/detail/
-- item-ordering.js) -- moved here so it applies no matter who writes the row.
--
-- Scope: only flex items (is_anchor = false) that belong to a day and have a
-- time_start.
--   - Anchors are untouched -- they're already always rendered in strict
--     time order and are never manually reordered (the app doesn't even
--     show reorder arrows for them), so their sort_order keeps being
--     managed the way it already is.
--   - Items with no time_start are untouched -- their position stays fully
--     manual, and they can sit anywhere relative to timed items, including
--     between two of them.
--   - A pure sort_order change (e.g. dragging/arrow-reordering two items
--     that share the same time_start) does NOT get overridden -- the
--     trigger only recomputes when time_start/day_id/is_anchor actually
--     changes.
--
-- sort_order becomes `numeric` so a new item can slot in at the midpoint
-- between its neighbors' existing values without renumbering any other row
-- -- this keeps the trigger a single-row write with no risk of cascading
-- into other items' (including anchors') sort_order.
--
-- No backfill: existing rows keep their current sort_order until they're
-- next written with a time_start/day_id/is_anchor change (through the app
-- or MCP), at which point they self-correct.

ALTER TABLE trip_items
  ALTER COLUMN sort_order TYPE numeric USING sort_order::numeric;

CREATE OR REPLACE FUNCTION trip_items_auto_sort_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_sort_order numeric;
  next_sort_order numeric;
  fallback_sort_order numeric;
BEGIN
  IF NEW.is_anchor IS TRUE
     OR NEW.day_id IS NULL
     OR NEW.time_start IS NULL
     OR NEW.deleted_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.time_start IS NOT DISTINCT FROM OLD.time_start
     AND NEW.day_id IS NOT DISTINCT FROM OLD.day_id
     AND NEW.is_anchor IS NOT DISTINCT FROM OLD.is_anchor
  THEN
    RETURN NEW;
  END IF;

  -- Last timed flex sibling at or before NEW's time (ties go to whichever
  -- of them currently sorts last, so a new same-time item lands at the end
  -- of that time's existing group).
  SELECT sort_order INTO prev_sort_order
  FROM trip_items
  WHERE day_id = NEW.day_id
    AND is_anchor = false
    AND deleted_at IS NULL
    AND time_start IS NOT NULL
    AND id <> NEW.id
    AND time_start <= NEW.time_start
  ORDER BY time_start DESC, sort_order DESC
  LIMIT 1;

  -- First timed flex sibling strictly after NEW's time.
  SELECT sort_order INTO next_sort_order
  FROM trip_items
  WHERE day_id = NEW.day_id
    AND is_anchor = false
    AND deleted_at IS NULL
    AND time_start IS NOT NULL
    AND id <> NEW.id
    AND time_start > NEW.time_start
  ORDER BY time_start ASC, sort_order ASC
  LIMIT 1;

  IF prev_sort_order IS NOT NULL AND next_sort_order IS NOT NULL THEN
    NEW.sort_order := (prev_sort_order + next_sort_order) / 2;
  ELSIF prev_sort_order IS NOT NULL THEN
    NEW.sort_order := prev_sort_order + 1;
  ELSIF next_sort_order IS NOT NULL THEN
    NEW.sort_order := next_sort_order - 1;
  ELSE
    -- No other timed flex items in this day -- append after everything
    -- currently in the day (timed or not) rather than guessing at a value.
    SELECT MAX(sort_order) INTO fallback_sort_order
    FROM trip_items
    WHERE day_id = NEW.day_id
      AND deleted_at IS NULL
      AND id <> NEW.id;

    NEW.sort_order := COALESCE(fallback_sort_order, -1) + 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_items_auto_sort_order_trigger ON trip_items;

CREATE TRIGGER trip_items_auto_sort_order_trigger
  BEFORE INSERT OR UPDATE ON trip_items
  FOR EACH ROW
  EXECUTE FUNCTION trip_items_auto_sort_order();
