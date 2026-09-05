const MAPS_APP_PREFERENCE_KEY = "passports-maps-app-preference";

export function getMapsAppPreference() {
  try {
    return localStorage.getItem(MAPS_APP_PREFERENCE_KEY) || "apple";
  } catch {
    return "apple";
  }
}

export function setMapsAppPreference(value) {
  try {
    localStorage.setItem(MAPS_APP_PREFERENCE_KEY, value);
  } catch {
    // Storage may be unavailable (private browsing, blocked cookies) — preference just won't persist.
  }
}
