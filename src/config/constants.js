// When bumping APP_VERSION, also update the version constant in sw.js.
export const APP_VERSION = "1.3.13";

export const TRIP_STATUSES = ["destinations", "planning", "active", "done"];

// Days before a planning-status trip's start date at which its dashboard
// card shows a "Starting soon" badge (see isTripStartingSoon in derive.js).
export const STARTING_SOON_WINDOW_DAYS = 14;

export const DEFAULT_BASE_TIMEZONE = "America/New_York";

export const ITEM_TYPES = ["meal", "activity", "transport", "lodging"];

export const DEFAULT_ITEM_STATUS = "idea";

export const ITEM_STATUSES = ["idea", "option", "shortlisted", "confirmed", "reserved"];

export const MEAL_SLOTS = ["breakfast", "brunch", "lunch", "dinner"];

export const ACTIVITY_TYPES = [
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

export const TRANSPORT_MODES = ["flight", "train", "car", "ferry", "bus", "other"];

// "summary" always leads (a hype-up overview, meant to be seen first), then
// the rest stay alphabetical. This order drives every add/edit category
// picker and the Guide view tab row.
export const OVERVIEW_CATEGORIES = ["summary", "culture", "food_drink", "history", "language", "logistics", "misc"];

export const OVERVIEW_CATEGORY_LABELS = {
  summary: "Summary",
  culture: "Culture",
  food_drink: "Food & Drink",
  history: "History",
  language: "Language",
  logistics: "Logistics",
  misc: "Misc",
};

export const OVERVIEW_CATEGORY_ICONS = {
  summary: "flame",
  culture: "palette",
  food_drink: "utensils",
  history: "landmark",
  language: "languages",
  logistics: "compass",
  misc: "sparkles",
};

export const CANONICAL_TIMEZONES = [
  ["America/New_York", "Eastern Time - US & Canada"],
  ["America/Chicago", "Central Time - US & Canada"],
  ["America/Denver", "Mountain Time - US"],
  ["America/Phoenix", "Mountain Time - Arizona"],
  ["America/Los_Angeles", "Pacific Time - US & Canada"],
  ["America/Anchorage", "Alaska Time"],
  ["Pacific/Honolulu", "Hawaii Time"],
  ["America/St_Johns", "Newfoundland Time"],
  ["America/Halifax", "Atlantic Time - Canada"],
  ["America/Toronto", "Eastern Time - Toronto"],
  ["America/Winnipeg", "Central Time - Winnipeg"],
  ["America/Edmonton", "Mountain Time - Edmonton"],
  ["America/Vancouver", "Pacific Time - Vancouver"],
  ["America/Mexico_City", "Central Time - Mexico City"],
  ["America/Cancun", "Eastern Time - Cancun"],
  ["America/Tijuana", "Pacific Time - Tijuana"],
  ["Atlantic/Reykjavik", "Iceland Time"],
  ["Europe/London", "United Kingdom Time"],
  ["Europe/Dublin", "Ireland Time"],
  ["Europe/Lisbon", "Portugal Time"],
  ["Europe/Paris", "Central European Time - Paris"],
  ["Europe/Madrid", "Central European Time - Madrid"],
  ["Europe/Berlin", "Central European Time - Berlin"],
  ["Europe/Rome", "Central European Time - Rome"],
  ["Europe/Amsterdam", "Central European Time - Amsterdam"],
  ["Europe/Stockholm", "Central European Time - Stockholm"],
  ["Europe/Athens", "Eastern European Time - Athens"],
  ["Europe/Helsinki", "Eastern European Time - Helsinki"],
  ["Europe/Istanbul", "Turkey Time"],
  ["Asia/Dubai", "Gulf Time - Dubai"],
  ["Asia/Jerusalem", "Israel Time"],
  ["Asia/Riyadh", "Arabia Time - Riyadh"],
  ["Asia/Tehran", "Iran Time"],
  ["Asia/Kolkata", "India Time"],
  ["Asia/Kathmandu", "Nepal Time"],
  ["Asia/Dhaka", "Bangladesh Time"],
  ["Asia/Bangkok", "Indochina Time - Bangkok"],
  ["Asia/Singapore", "Singapore Time"],
  ["Asia/Shanghai", "China Time - Shanghai"],
  ["Asia/Hong_Kong", "Hong Kong Time"],
  ["Asia/Tokyo", "Japan Time - Tokyo"],
  ["Asia/Seoul", "Korea Time - Seoul"],
  ["Australia/Perth", "Western Australia Time"],
  ["Australia/Adelaide", "Central Australia Time"],
  ["Australia/Sydney", "Eastern Australia Time - Sydney"],
  ["Pacific/Auckland", "New Zealand Time - Auckland"],
  ["Pacific/Fiji", "Fiji Time"],
  ["Africa/Casablanca", "Morocco Time"],
  ["Africa/Lagos", "West Africa Time - Lagos"],
  ["Africa/Johannesburg", "South Africa Time"],
  ["Africa/Nairobi", "East Africa Time - Nairobi"],
  ["America/Bogota", "Colombia Time"],
  ["America/Lima", "Peru Time"],
  ["America/Santiago", "Chile Time - Santiago"],
  ["America/Argentina/Buenos_Aires", "Argentina Time - Buenos Aires"],
  ["America/Sao_Paulo", "Brazil Time - Sao Paulo"],
];

// Every email Passports can send, as shown in Settings. `column` is the boolean
// on user_profiles that switches it on/off. Keep in sync with EMAIL_KINDS in
// netlify/lib/email-prefs.js (the server can't import this file, and this file
// can't import that one — there is no build step).
// Set by a "Create account" button elsewhere in the app so the login page opens
// on the sign-up form (sessionStorage; read once, then cleared).
export const LOGIN_START_MODE_KEY = "login-start-mode";

// Where a campaign link's /login?invite=CODE is held while the login page loads.
export const INVITE_PREFILL_KEY = "login-invite-prefill";

export const EMAIL_PREFERENCE_OPTIONS = [
  {
    column: "email_member_added",
    label: "Added to a trip",
    description: "When someone adds you to one of their trips.",
  },
  {
    column: "email_journal_reminder",
    label: "Journal reminders",
    description: "About a week after a trip ends, a nudge to add your memories.",
  },
  {
    column: "email_trip_day_two",
    label: "Trip check-in",
    description: "The evening of the second day of a trip, a nudge to start journaling.",
  },
  {
    column: "email_trip_starts_soon",
    label: "Trip countdown",
    description: "Three days before a trip starts, a link to your itinerary and what's still to do.",
  },
  {
    column: "email_trip_memories",
    label: "Trip memories",
    description: "On the anniversary of a day from a past trip, a look back at your journal or a nudge to add your memories.",
  },
];
