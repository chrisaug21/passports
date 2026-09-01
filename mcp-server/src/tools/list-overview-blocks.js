const { z } = require("zod");
const { selectRows } = require("../lib/supabase-rest.js");
const { withToolErrorHandling } = require("../lib/tool-error.js");
const { OVERVIEW_CATEGORIES } = require("../lib/overview-fields.js");
const { optionalOf } = require("../lib/item-fields.js");

const OVERVIEW_BLOCK_SELECT =
  "id,trip_id,base_id,category,subtitle,body,sort_order,is_published,source,created_by,created_at,updated_at";

// ctx: { getSupabaseAccessToken } — see mcp-server/src/index.js.
function registerListOverviewBlocks(server, ctx) {
  server.registerTool(
    "list_overview_blocks",
    {
      title: "List a trip's overview content",
      description:
        "List the place-focused overview content (history, culture, language, food & drink, logistics, " +
        "etc.) for a trip — separate from the day-by-day items. Each block has a `base_id` that's either " +
        "null (trip-wide content) or set to one of the trip's bases (content specific to that place); a " +
        "block only shows to a public viewer once `is_published` is true. Get a trip's id from `list_trips`, " +
        "and a base's id from `get_trip` if you need to filter to one.",
      inputSchema: {
        tripId: z.string().uuid().describe("The trip's id, from list_trips."),
        baseId: optionalOf(z.string().uuid()).describe("Only return blocks scoped to this base. Omit to return every block on the trip."),
        category: optionalOf(z.enum(OVERVIEW_CATEGORIES)).describe("Only return blocks in this category. Omit to return every category."),
      },
    },
    withToolErrorHandling(async ({ tripId, baseId, category }) => {
      const bearer = await ctx.getSupabaseAccessToken();

      const trips = await selectRows("trips", { id: `eq.${tripId}`, deleted_at: "is.null", select: "id" }, { bearer });
      if (!trips[0]) {
        return { isError: true, content: [{ type: "text", text: "No trip found with that id, or you don't have access to it." }] };
      }

      if (baseId) {
        const base = await selectRows(
          "trip_bases",
          { id: `eq.${baseId}`, trip_id: `eq.${tripId}`, deleted_at: "is.null", select: "id" },
          { bearer }
        );
        if (!base[0]) {
          return { isError: true, content: [{ type: "text", text: "That baseId doesn't belong to this trip." }] };
        }
      }

      const params = { trip_id: `eq.${tripId}`, deleted_at: "is.null", select: OVERVIEW_BLOCK_SELECT, order: "sort_order.asc" };
      if (baseId) params.base_id = `eq.${baseId}`;
      if (category) params.category = `eq.${category}`;

      const blocks = await selectRows("trip_overview_blocks", params, { bearer });

      return {
        content: [{ type: "text", text: JSON.stringify(blocks, null, 2) }],
        structuredContent: { blocks },
      };
    })
  );
}

module.exports = { registerListOverviewBlocks };
