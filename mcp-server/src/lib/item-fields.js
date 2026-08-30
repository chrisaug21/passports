const { z } = require("zod");

// Mirrors the enums in src/config/constants.js — this package is plain
// CommonJS and can't import the app's ES modules, so these are kept in sync
// by hand. Shared by create_trip_item and propose_update_trip_item so the
// two tools can't drift against each other.
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
const ITEM_STATUSES = ["idea", "option", "shortlisted", "confirmed", "reserved"];

// Some MCP clients (e.g. MCP Inspector's form) send an empty string for an
// optional field left blank, rather than omitting the key entirely. zod's
// .optional() only accepts a missing field, not a present-but-blank one, so
// treat "" as "not provided" before the real validation runs.
const optionalOf = (schema) => z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

// Some MCP clients' auto-generated form UIs serialize an array-typed field
// as a plain object keyed by numeric-string index (e.g. {"0": {...},
// "1": {...}}) instead of a real JSON array — observed from MCP Inspector's
// form against propose_update_trip_item's `changes` field. Coerce that
// shape back into a real array before the real array validation runs, same
// category of client quirk as optionalOf's blank-string handling above,
// just for arrays instead of scalars.
const arrayOf = (schema) =>
  z.preprocess((value) => {
    if (Array.isArray(value) || value == null || typeof value !== "object") return value;
    const keys = Object.keys(value);
    const isIndexObject = keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
    return isIndexObject ? keys.sort((a, b) => Number(a) - Number(b)).map((k) => value[k]) : value;
  }, schema);

// Which sub-type field goes with which itemType — the input schema can't
// express "required only when itemType is X" on its own (each field is
// independently optional), so this is checked by hand before anything
// touches the database.
const REQUIRED_SUBFIELD_BY_ITEM_TYPE = { meal: "mealSlot", activity: "activityType", transport: "transportMode", lodging: null };

// Returns an error string, or null if the sub-type fields match itemType:
// the one that belongs to itemType must be present, and none of the others
// may be — e.g. a "meal" item must have mealSlot and must not have
// activityType/transportMode. Used both on a brand-new item (create_trip_item)
// and on the *resulting* item after a proposed patch is merged onto the
// current row (propose_update_trip_item), so a partial itemType change can't
// leave an inconsistent sub-field combination.
function validateItemTypeFields(itemType, subfields) {
  const requiredField = REQUIRED_SUBFIELD_BY_ITEM_TYPE[itemType];

  if (requiredField && !subfields[requiredField]) {
    return `itemType '${itemType}' requires ${requiredField}.`;
  }

  for (const [field, value] of Object.entries(subfields)) {
    if (value && field !== requiredField) {
      return `${field} doesn't apply to itemType '${itemType}' — omit it.`;
    }
  }

  return null;
}

module.exports = {
  ITEM_TYPES,
  MEAL_SLOTS,
  ACTIVITY_TYPES,
  TRANSPORT_MODES,
  ITEM_STATUSES,
  optionalOf,
  arrayOf,
  validateItemTypeFields,
};
