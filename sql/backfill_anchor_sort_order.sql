-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm), once,
-- after sql/trip_items_time_based_sort_order.sql has been applied.
--
-- One-time correction for anchors that already exist in the database: their
-- sort_order was set (via getAnchorDestinationSortOrder in src/features/
-- trip/detail/item-ordering.js) to a plain count of the day's items at
-- creation/move time -- not a real chronological position -- so they can
-- render out of order relative to other items (e.g. a 3pm hotel check-in
-- showing up before an 11am item). trip_items_auto_sort_order_trigger only
-- fires on INSERT or when time_start/day_id changes, so it won't correct an
-- anchor that's just sitting there with a stale value -- this backfill does
-- that correction directly, once.
--
-- Safe to re-run: it always recomputes fresh from the current data and only
-- ever touches anchor rows (flex items and untimed items are never written).
-- Processes anchors day-by-day, in time order, using the exact same
-- prev/next-neighbor midpoint logic as the trigger, so each anchor lands
-- correctly relative to that day's other timed items (flex items and any
-- already-corrected anchor processed earlier in this same run).

DO $$
DECLARE
  target_day RECORD;
  anchor_item RECORD;
  prev_sort_order numeric;
  next_sort_order numeric;
  fallback_sort_order numeric;
BEGIN
  FOR target_day IN
    SELECT DISTINCT day_id
    FROM trip_items
    WHERE is_anchor = true
      AND day_id IS NOT NULL
      AND time_start IS NOT NULL
      AND deleted_at IS NULL
  LOOP
    FOR anchor_item IN
      SELECT id, time_start
      FROM trip_items
      WHERE day_id = target_day.day_id
        AND is_anchor = true
        AND time_start IS NOT NULL
        AND deleted_at IS NULL
      ORDER BY time_start ASC, sort_order ASC
    LOOP
      SELECT sort_order INTO prev_sort_order
      FROM trip_items
      WHERE day_id = target_day.day_id
        AND deleted_at IS NULL
        AND time_start IS NOT NULL
        AND id <> anchor_item.id
        AND time_start <= anchor_item.time_start
      ORDER BY time_start DESC, sort_order DESC
      LIMIT 1;

      SELECT sort_order INTO next_sort_order
      FROM trip_items
      WHERE day_id = target_day.day_id
        AND deleted_at IS NULL
        AND time_start IS NOT NULL
        AND id <> anchor_item.id
        AND time_start > anchor_item.time_start
      ORDER BY time_start ASC, sort_order ASC
      LIMIT 1;

      IF prev_sort_order IS NOT NULL AND next_sort_order IS NOT NULL THEN
        UPDATE trip_items SET sort_order = (prev_sort_order + next_sort_order) / 2 WHERE id = anchor_item.id;
      ELSIF prev_sort_order IS NOT NULL THEN
        UPDATE trip_items SET sort_order = prev_sort_order + 1 WHERE id = anchor_item.id;
      ELSIF next_sort_order IS NOT NULL THEN
        UPDATE trip_items SET sort_order = next_sort_order - 1 WHERE id = anchor_item.id;
      ELSE
        SELECT COALESCE(MAX(sort_order), -1) + 1 INTO fallback_sort_order
        FROM trip_items
        WHERE day_id = target_day.day_id
          AND deleted_at IS NULL
          AND id <> anchor_item.id;

        UPDATE trip_items SET sort_order = fallback_sort_order WHERE id = anchor_item.id;
      END IF;
    END LOOP;
  END LOOP;
END $$;
