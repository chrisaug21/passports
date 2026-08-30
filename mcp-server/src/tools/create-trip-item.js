const { z } = require("zod");
const { selectRows, selectForTrip, insertRow } = require("../lib/supabase-rest.js");
const { checkAndIncrementRateLimit, logWrite } = require("../lib/mcp-auth.js");
const { withToolErrorHandling } = require("../lib/tool-error.js");

// Mirrors the enums in src/config/constants.js — same duplication reasoning
// as derive.js and get-trip.js's TRIP_ITEM_SELECT: this package is plain
// CommonJS and can't import the app's ES modules.
const ITEM_TYPES = ["meal", "activity", "transport", "lodging"];
const MEAL_SLOTS = ["breakfast", "brunch", "lunch", "dinner"];
const ACTIVITY_TYPES = [
  "arts_culture",
  "cafes_markets",
  "entertainment",
  "live_music_shows",
  "nightlife",
  "outdoors_nature",
  "shopping",
  "sightseeing",
  "sports",
  "tastings_drinks",
  "walking_exploring",
  "wellness_spa",
  "other",
];
const TRANSPORT_MODES = ["flight", "train", "car", "ferry", "bus", "other"];

// Appends to the end of the trip's existing item order, same convention the
// app's own "add item" UI uses.
async function nextSortOrderForTrip(tripId, bearer) {
  const existingItems = await selectForTrip("trip_items", tripId, "sort_order", { bearer });
  return existingItems.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), -1) + 1;
}

// ctx: { getSupabaseAccessToken, userId, connectionId } — see mcp-server/src/index.js.
// This is Phase 2's only write tool. Two hardcoded rules are the whole point
// of this phase: it can only ever create a new `status: 'idea'` item, never
// touch an existing row, and never create anything already confirmed/reserved.
// The actual insert goes through the user's own Supabase access token, so
// RLS's real trip_members check is what actually decides whether the write
// is allowed — not any logic in this file.
function registerCreateTripItem(server, ctx) {
  server.registerTool(
    "create_trip_item",
    {
      title: "Add a new idea to a trip",
      description:
        "Add a new idea to a trip's master list. Always creates the item with status 'idea' and " +
        "is_anchor false, regardless of what's passed — this tool can only suggest new ideas, " +
        "never create something already confirmed/reserved, and never modifies an existing item. " +
        "Get a trip's id from `list_trips`.\n\n" +
        "Base assignment: if you don't already know the trip's bases, call `get_trip` first. Try " +
        "to infer the right `baseId` from context (the destination or activity mentioned); if the " +
        "trip has exactly one base, default to it unless the idea is clearly trip-wide (e.g. an " +
        "inbound/outbound flight). Leave `baseId` empty rather than guessing when it's genuinely " +
        "ambiguous or the trip has no bases yet — an unplaced idea is completely normal and the " +
        "user can assign it later.",
      inputSchema: {
        tripId: z.string().uuid().describe("The trip's id, from list_trips."),
        title: z.string().min(1).describe("Short title for the idea, e.g. 'Try the tasting menu at Noma'."),
        itemType: z.enum(ITEM_TYPES).describe("meal, activity, transport, or lodging."),
        baseId: z
          .string()
          .uuid()
          .optional()
          .describe("Which of the trip's bases this belongs to. Omit if unknown or genuinely ambiguous — see guidance above."),
        dayId: z.string().uuid().optional().describe("Which day this belongs to, if known. Usually omitted for a loose idea."),
        mealSlot: z.enum(MEAL_SLOTS).optional().describe("Required only when itemType is 'meal'."),
        activityType: z.enum(ACTIVITY_TYPES).optional().describe("Required only when itemType is 'activity'."),
        transportMode: z.enum(TRANSPORT_MODES).optional().describe("Required only when itemType is 'transport'."),
        notes: z.string().optional().describe("Any free-text notes about the idea."),
        url: z.string().optional().describe("A link related to the idea (restaurant site, listing, article, etc.)."),
      },
    },
    withToolErrorHandling(async ({ tripId, title, itemType, baseId, dayId, mealSlot, activityType, transportMode, notes, url }) => {
      const allowed = await checkAndIncrementRateLimit(ctx.connectionId);
      if (!allowed) {
        return {
          isError: true,
          content: [{ type: "text", text: "Too many changes at once — try again in a minute." }],
        };
      }

      const bearer = await ctx.getSupabaseAccessToken();

      const trips = await selectRows("trips", { id: `eq.${tripId}`, deleted_at: "is.null", select: "id" }, { bearer });
      if (!trips[0]) {
        return {
          isError: true,
          content: [{ type: "text", text: "No trip found with that id, or you don't have access to it." }],
        };
      }

      const nextSortOrder = await nextSortOrderForTrip(tripId, bearer);

      const created = await insertRow(
        "trip_items",
        {
          trip_id: tripId,
          base_id: baseId || null,
          day_id: dayId || null,
          created_by: ctx.userId,
          title,
          item_type: itemType,
          status: "idea",
          is_anchor: false,
          meal_slot: mealSlot || null,
          activity_type: activityType || null,
          transport_mode: transportMode || null,
          notes: notes || null,
          url: url || null,
          sort_order: nextSortOrder,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { bearer }
      );

      await logWrite({
        connectionId: ctx.connectionId,
        userId: ctx.userId,
        toolName: "create_trip_item",
        tripId,
        itemId: created?.id,
        payload: { title, itemType, baseId: baseId || null, dayId: dayId || null },
      });

      return {
        content: [{ type: "text", text: JSON.stringify(created, null, 2) }],
        structuredContent: created,
      };
    })
  );
}

module.exports = { registerCreateTripItem };
