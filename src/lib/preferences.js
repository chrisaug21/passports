let mapsAppPreference = "apple";

export function getMapsAppPreference() {
  return mapsAppPreference;
}

export function setMapsAppPreferenceCache(value) {
  mapsAppPreference = value === "google" ? "google" : "apple";
}
