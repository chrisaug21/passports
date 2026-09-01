// Mirrors OVERVIEW_CATEGORIES/OVERVIEW_CATEGORY_LABELS in src/config/constants.js
// — this package is plain CommonJS and can't import the app's ES modules, so
// this is kept in sync by hand, same convention as item-fields.js.
const OVERVIEW_CATEGORIES = ["summary", "culture", "food_drink", "history", "language", "logistics", "misc"];

const OVERVIEW_CATEGORY_LABELS = {
  summary: "Summary",
  culture: "Culture",
  food_drink: "Food & Drink",
  history: "History",
  language: "Language",
  logistics: "Logistics",
  misc: "Misc",
};

module.exports = { OVERVIEW_CATEGORIES, OVERVIEW_CATEGORY_LABELS };
