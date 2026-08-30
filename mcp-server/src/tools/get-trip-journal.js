const { z } = require("zod");
const { selectRows, selectForTrip } = require("../lib/supabase-rest.js");
const { withToolErrorHandling } = require("../lib/tool-error.js");

// Mirrors getDisplayName in netlify/functions/trip-export.js. Keep the two in
// sync by hand — see the TRIP_ITEM_SELECT note in get-trip.js for why this
// package can't just import the shared version.
function getDisplayName(userId, profilesById) {
  const profile = profilesById.get(userId);
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");
  return name || "A traveler";
}

// ctx: { getSupabaseAccessToken } — see mcp-server/src/index.js. Deliberately
// does NOT apply the `is_journal_public` gate that netlify/functions/trip-export.js
// uses: that gate is for the anonymous public-share view. The connected
// user is authenticated as themself (or a real trip member) via RLS, so
// they see their own journal regardless of whether it's ever been shared.
function registerGetTripJournal(server, ctx) {
  server.registerTool(
    "get_trip_journal",
    {
      title: "Get trip journal",
      description:
        "Get the journal for one trip: day-level and item-level notes, plus photo URLs (URLs " +
        "only, not image data). Each entry/photo includes `author_name` for who wrote or " +
        "uploaded it. An entry with a `day_id` and no `item_id` is a general note about that " +
        "day; an entry with an `item_id` is about that specific item. Get a trip's id from " +
        "list_trips.",
      inputSchema: {
        tripId: z.string().uuid().describe("The trip's id, from list_trips."),
      },
    },
    withToolErrorHandling(async ({ tripId }) => {
      const bearer = await ctx.getSupabaseAccessToken();

      const trips = await selectRows("trips", { id: `eq.${tripId}`, deleted_at: "is.null", select: "id" }, { bearer });
      if (!trips[0]) {
        return {
          isError: true,
          content: [{ type: "text", text: "No trip found with that id, or you don't have access to it." }],
        };
      }

      const [entries, photos] = await Promise.all([
        selectForTrip("journal_entries", tripId, "id,trip_id,user_id,day_id,item_id,notes,created_at,updated_at", {
          bearer,
        }),
        selectForTrip("journal_item_photos", tripId, "id,trip_id,user_id,item_id,public_url,created_at", { bearer }),
      ]);

      const authorIds = [...new Set([...entries.map((e) => e.user_id), ...photos.map((p) => p.user_id)])];
      let profilesById = new Map();
      if (authorIds.length > 0) {
        const profiles = await selectRows(
          "user_profiles",
          { id: `in.(${authorIds.join(",")})`, select: "id,first_name,last_name" },
          { bearer }
        );
        profilesById = new Map(profiles.map((p) => [p.id, p]));
      }

      const result = {
        entries: entries.map((entry) => ({ ...entry, author_name: getDisplayName(entry.user_id, profilesById) })),
        photos: photos.map((photo) => ({ ...photo, author_name: getDisplayName(photo.user_id, profilesById) })),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    })
  );
}

module.exports = { registerGetTripJournal };
