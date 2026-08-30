const { z } = require("zod");
const { selectRows } = require("../lib/supabase-rest.js");
const { deriveTripStatus } = require("../lib/derive.js");

// ctx: { supabaseAccessToken } — the connected user's own live Supabase access
// token for this request. RLS on `trips` already scopes rows to trips this
// user owns or is a member of, so no manual filtering is needed here.
function registerListTrips(server, ctx) {
  server.registerTool(
    "list_trips",
    {
      title: "List trips",
      description:
        "List all trips the connected user owns or is a member of. Returns each trip's id, " +
        "title, status, dates, and length. `status` is the raw value the user (or the app) set " +
        "(planning/upcoming/active/done) and can be stale; `derived_status` " +
        "(planning/traveling/past) is computed from today's date and the trip's actual dates, so " +
        "prefer it when the goal is finding real past trips to learn the user's taste from, or " +
        "confirming what's currently active. Use `get_trip` and `get_trip_journal` with a trip's " +
        "id to pull full detail on any trip returned here.",
      inputSchema: {
        status: z
          .enum(["planning", "upcoming", "active", "done"])
          .optional()
          .describe("Filter to trips whose raw status column equals this value. Omit to return all trips."),
      },
    },
    async ({ status }) => {
      const params = {
        select:
          "id,owner_id,title,description,status,start_date,trip_length,is_public,created_at,updated_at",
        deleted_at: "is.null",
        order: "start_date.asc.nullslast",
      };
      if (status) params.status = `eq.${status}`;

      const trips = await selectRows("trips", params, { bearer: ctx.supabaseAccessToken });
      const result = trips.map((trip) => ({ ...trip, derived_status: deriveTripStatus(trip) }));

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: { trips: result },
      };
    }
  );
}

module.exports = { registerListTrips };
