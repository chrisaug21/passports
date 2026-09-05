const { z } = require("zod");
const { selectRows, insertRow } = require("../lib/supabase-rest.js");
const { checkAndIncrementRateLimit, logWrite } = require("../lib/mcp-auth.js");
const { withToolErrorHandling } = require("../lib/tool-error.js");
const { OVERVIEW_CATEGORIES } = require("../lib/overview-fields.js");
const { optionalOf } = require("../lib/item-fields.js");

// Confirms the trip exists (and is visible to this user via RLS), and that
// baseId — if given — actually belongs to that trip. Mirrors
// validateTripReferences in create-trip-item.js, minus the dayId check
// (overview blocks aren't day-scoped).
async function validateTripAndBase(tripId, baseId, bearer) {
  const [trips, base] = await Promise.all([
    selectRows("trips", { id: `eq.${tripId}`, deleted_at: "is.null", select: "id" }, { bearer }),
    baseId
      ? selectRows("trip_bases", { id: `eq.${baseId}`, trip_id: `eq.${tripId}`, deleted_at: "is.null", select: "id" }, { bearer })
      : null,
  ]);

  if (!trips[0]) return "No trip found with that id, or you don't have access to it.";
  if (baseId && !base[0]) return "That baseId doesn't belong to this trip.";
  return null;
}

// Appends to the end of the block's (trip_id, base_id, category) group, same
// convention nextSortOrderForTrip uses for items.
async function nextSortOrderForGroup(tripId, baseId, category, bearer) {
  const params = {
    trip_id: `eq.${tripId}`,
    category: `eq.${category}`,
    deleted_at: "is.null",
    select: "sort_order",
    base_id: baseId ? `eq.${baseId}` : "is.null",
  };
  const existing = await selectRows("trip_overview_blocks", params, { bearer });
  return existing.reduce((max, row) => Math.max(max, Number(row.sort_order) || 0), -1) + 1;
}

// ctx: { getSupabaseAccessToken, userId, connectionId } — see mcp-server/src/index.js.
// Direct write, no propose/confirm — a new block isn't overwriting anything,
// same reasoning as create_trip_item.
function registerCreateOverviewBlock(server, ctx) {
  server.registerTool(
    "create_overview_block",
    {
      title: "Add a new piece of overview content to a trip",
      description:
        "Add a new block of place-focused overview content (history, culture, language, food & drink, " +
        "logistics, etc.) to a trip or one of its bases — separate from the day-by-day items. Always " +
        "creates the block as an unpublished draft (`isPublished: false`) unless the user has explicitly " +
        "asked for it to be published immediately — only pass `isPublished: true` when you have that " +
        "clear go-ahead, since a draft is invisible to everyone except the trip's own members, while a " +
        "published block on a public trip is visible to anyone with the share link. Get a trip's id from " +
        "`list_trips`, and a base's id from `get_trip`.\n\n" +
        "Leave `baseId` empty for trip-wide content (e.g. general history or currency notes that apply " +
        "everywhere); set it for content specific to one base (e.g. a base's local dialect or neighborhood " +
        "customs). `summary` is meant as a short hype-building overview and is shown first; the other " +
        "categories have no inherent order beyond what `sortOrder` you give them.",
      inputSchema: {
        tripId: z.string().uuid().describe("The trip's id, from list_trips."),
        baseId: optionalOf(z.string().uuid()).describe("Which base this content is specific to. Omit for trip-wide content."),
        category: z.enum(OVERVIEW_CATEGORIES).describe("summary, culture, food_drink, history, language, logistics, or misc."),
        subtitle: optionalOf(z.string()).describe(
          "Optional heading for this specific block, e.g. 'Currency & Payments'. Only add one if the " +
            "category will have more than one block, or it's otherwise more specific than the category " +
            "alone — a lone History block doesn't need a subtitle that just says 'History' again."
        ),
        body: z.string().min(1).describe("The content itself, as plain text. Paragraph breaks are preserved; no markdown."),
        isPublished: optionalOf(z.boolean()).describe(
          "Whether this is immediately visible in Guide view / the public share link. Defaults to false " +
            "(draft) — only set true with the user's explicit go-ahead, per the guidance above."
        ),
      },
    },
    withToolErrorHandling(async ({ tripId, baseId, category, subtitle, body, isPublished }) => {
      const allowed = await checkAndIncrementRateLimit(ctx.connectionId);
      if (!allowed) {
        return { isError: true, content: [{ type: "text", text: "Too many changes at once — try again in a minute." }] };
      }

      const bearer = await ctx.getSupabaseAccessToken();

      const referenceError = await validateTripAndBase(tripId, baseId, bearer);
      if (referenceError) {
        return { isError: true, content: [{ type: "text", text: referenceError }] };
      }

      const sortOrder = await nextSortOrderForGroup(tripId, baseId, category, bearer);
      const now = new Date().toISOString();
      const created = await insertRow(
        "trip_overview_blocks",
        {
          trip_id: tripId,
          base_id: baseId || null,
          category,
          subtitle: subtitle || null,
          body,
          sort_order: sortOrder,
          is_published: Boolean(isPublished),
          source: "mcp",
          created_by: ctx.userId,
          created_at: now,
          updated_at: now,
        },
        { bearer }
      );

      // The block is already created at this point — a logging failure must
      // not surface as a tool error, or the caller will see "failed" and
      // retry a write that actually succeeded.
      try {
        await logWrite({
          connectionId: ctx.connectionId,
          userId: ctx.userId,
          toolName: "create_overview_block",
          tripId,
          itemId: created?.id,
          payload: { baseId: baseId || null, category, isPublished: Boolean(isPublished) },
        });
      } catch (error) {
        console.error("create_overview_block: audit log write failed (block was still created)", error);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(created, null, 2) }],
        structuredContent: created,
      };
    })
  );
}

module.exports = { registerCreateOverviewBlock };
