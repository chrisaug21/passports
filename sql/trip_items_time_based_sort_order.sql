-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm).
--
-- Auto-slots any timed item -- anchor or flex -- into chronological sort_order
-- among its day's other timed items whenever time_start or day_id changes, so
-- every writer -- the app UI, the MCP tools, anything else -- gets
-- consistent time-based ordering without having to compute sort_order by
-- hand. This is the same "insert by time" rule the app's own edit form has
-- always used for flex items (see insertFlexItemByTime in src/features/trip/
-- detail/item-ordering.js) -- moved here, and extended to anchors, so it
-- applies no matter who writes the row.
--
-- Scope: any item that belongs to a day and has a time_start -- is_anchor no
-- longer matters. Anchors and timed flex items now share one ordering pool:
-- getInterleavedDayItems (src/features/trip/detail/item-ordering.js) already
-- treats an anchor's sort_order as its position relative to flex items, but
-- until now that value was just an item count from whenever the anchor was
-- created/moved, not a real chronological position -- which is why an anchor
-- could render out of order relative to other items. Giving anchors a real,
-- trigger-computed sort_order fixes that without needing to change the
-- render logic itself.
--   - Items with no time_start are untouched -- their position stays fully
--     manual, and they can sit anywhere relative to timed items, including
--     between two of them.
--   - A pure sort_order change (e.g. arrow-reordering two items that share
--     the same time_start) does NOT get overridden -- the trigger only
--     recomputes when time_start/day_id actually changes.
--
-- sort_order is `numeric` so a new item can slot in at the midpoint between
-- its neighbors' existing values without renumbering any other row -- this
-- keeps the trigger a single-row write with no cascading updates.
--
-- No backfill here for existing anchors -- see
-- sql/backfill_anchor_sort_order.sql for the one-time correction of anchors
-- that already have a stale, pre-this-trigger sort_order value.

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
  IF NEW.day_id IS NULL
     OR NEW.time_start IS NULL
     OR NEW.deleted_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.time_start IS NOT DISTINCT FROM OLD.time_start
     AND NEW.day_id IS NOT DISTINCT FROM OLD.day_id
  THEN
    RETURN NEW;
  END IF;

  -- Last timed sibling (anchor or flex) at or before NEW's time (ties go to
  -- whichever of them currently sorts last, so a new same-time item lands
  -- at the end of that time's existing group).
  SELECT sort_order INTO prev_sort_order
  FROM trip_items
  WHERE day_id = NEW.day_id
    AND deleted_at IS NULL
    AND time_start IS NOT NULL
    AND id <> NEW.id
    AND time_start <= NEW.time_start
  ORDER BY time_start DESC, sort_order DESC
  LIMIT 1;

  -- First timed sibling (anchor or flex) strictly after NEW's time.
  SELECT sort_order INTO next_sort_order
  FROM trip_items
  WHERE day_id = NEW.day_id
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
    -- No other timed items in this day -- append after everything
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
