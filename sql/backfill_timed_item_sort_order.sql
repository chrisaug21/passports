-- Run this in the Supabase SQL editor (project: tqxvtsdghobustiatiqm), as
-- needed, to repair sort_order for a specific trip whose items have drifted
-- out of sync with their time_start.
--
-- Root cause (fixed alongside this script -- see item-ordering.js and
-- item-move-controller.js): the app's own client-side ordering code used to
-- recompute and overwrite sort_order for every sibling item in a day
-- whenever one item in that day was edited or reordered, using whatever
-- items happened to be loaded in the browser at that moment. If that local
-- copy was stale (e.g. an item had been added or edited elsewhere, such as
-- via the MCP connector, without the page refetching first), the save wrote
-- the stale ordering back over the database's correct values -- including
-- for items the edit never meant to touch. sql/trip_items_time_based_sort_order.sql
-- only recomputes a row when ITS OWN time_start/day_id changes, so it has no
-- way to catch or undo that kind of overwrite on other rows.
--
-- This script re-derives sort_order from time_start directly: for every
-- timed item (anchor or flex) in the target trip, it assigns a fresh
-- strictly-increasing sort_order per day, ordered chronologically. Items
-- without a time_start are left completely alone -- their position stays
-- fully manual, per spec.
--
-- Safe to re-run: always recomputes fresh from current time_start values.
-- Edit the trip title below to scope this to a different trip.

WITH target_days AS (
  SELECT td.id AS day_id
  FROM trip_days td
  JOIN trips t ON t.id = td.trip_id
  WHERE t.title = 'Sonoma & San Francisco'
    AND td.deleted_at IS NULL
),
ranked AS (
  SELECT
    ti.id,
    ROW_NUMBER() OVER (
      PARTITION BY ti.day_id
      ORDER BY ti.time_start ASC, ti.sort_order ASC, ti.created_at ASC
    ) - 1 AS new_sort_order
  FROM trip_items ti
  JOIN target_days td ON td.day_id = ti.day_id
  WHERE ti.time_start IS NOT NULL
    AND ti.deleted_at IS NULL
)
UPDATE trip_items ti
SET sort_order = ranked.new_sort_order
FROM ranked
WHERE ti.id = ranked.id;
