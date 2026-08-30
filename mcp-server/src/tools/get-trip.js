const { z } = require("zod");
const { selectRows } = require("../lib/supabase-rest.js");
const { deriveTripStatus } = require("../lib/derive.js");

const TRIP_ITEM_SELECT =
  "id,trip_id,base_id,day_id,created_by,title,item_type,status,is_done,done_by,done_at," +
  "is_anchor,meal_slot,activity_type,transport_mode,transport_origin,transport_destination," +
  "time_start,time_end,time_is_estimated,cost_low,cost_high,confirmation_ref,url,notes," +
  "sort_order,check_out_date,created_at,updated_at";

// ctx: { supabaseAccessToken } — see list-trips.js. Unlike the public
// trip-export.js, this tool is the account owner (or a trip member) looking
// at their own trip, so no status/cost filtering — every item and field is
// returned, exactly as they'd see it in the app itself.
function registerGetTrip(server, ctx) {
  server.registerTool(
    "get_trip",
    {
      title: "Get full trip detail",
      description:
        "Get everything about one trip: trip info, bases (1-4 home locations), days, and every " +
        "item regardless of status (idea/option/shortlisted/confirmed/reserved) — unlike the " +
        "public share view, nothing is filtered out here. A few things worth knowing when " +
        "reading the result: an item's `base_id` and `day_id` are independent and can point to " +
        "different bases (e.g. a transport item on a travel day) or be null (an unplaced idea); " +
        "`is_anchor: true` means the item has a fixed `time_start` and shouldn't be moved without " +
        "reason; `todos` and `packing_items` are usually empty today since the app has no UI for " +
        "them yet, but the fields are included for when it does. Get a trip's id from `list_trips`.",
      inputSchema: {
        tripId: z.string().uuid().describe("The trip's id, from list_trips."),
      },
    },
    async ({ tripId }) => {
      const bearer = ctx.supabaseAccessToken;

      const trips = await selectRows(
        "trips",
        {
          id: `eq.${tripId}`,
          deleted_at: "is.null",
          select:
            "id,owner_id,title,description,status,start_date,trip_length,is_public," +
            "is_planning_public,is_journal_public,cover_photo_url,created_at,updated_at",
        },
        { bearer }
      );
      const trip = trips[0];

      if (!trip) {
        return {
          isError: true,
          content: [{ type: "text", text: "No trip found with that id, or you don't have access to it." }],
        };
      }

      const [bases, days, items, todos, packingItems] = await Promise.all([
        selectRows(
          "trip_bases",
          {
            trip_id: `eq.${tripId}`,
            deleted_at: "is.null",
            select: "id,trip_id,name,location_name,local_timezone,sort_order,notes",
            order: "sort_order.asc",
          },
          { bearer }
        ),
        selectRows(
          "trip_days",
          {
            trip_id: `eq.${tripId}`,
            deleted_at: "is.null",
            select: "id,trip_id,base_id,day_number,title,location_name,sort_order",
            order: "day_number.asc",
          },
          { bearer }
        ),
        selectRows(
          "trip_items",
          {
            trip_id: `eq.${tripId}`,
            deleted_at: "is.null",
            select: TRIP_ITEM_SELECT,
            order: "sort_order.asc",
          },
          { bearer }
        ),
        selectRows(
          "trip_todos",
          { trip_id: `eq.${tripId}`, deleted_at: "is.null", select: "*" },
          { bearer }
        ),
        selectRows(
          "trip_packing_items",
          { trip_id: `eq.${tripId}`, deleted_at: "is.null", select: "*" },
          { bearer }
        ),
      ]);

      const result = {
        trip: { ...trip, derived_status: deriveTripStatus(trip) },
        bases,
        days,
        items,
        todos,
        packing_items: packingItems,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    }
  );
}

module.exports = { registerGetTrip };
