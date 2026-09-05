let mapsAppPreference = "apple";
let mapsAppPreferenceVersion = 0;

export function getMapsAppPreference() {
  return mapsAppPreference;
}

// Callers that fetch this preference asynchronously should capture this
// before the fetch starts, then compare it after — if it's changed, a
// newer read or save has already landed and the fetch result is stale.
export function getMapsAppPreferenceVersion() {
  return mapsAppPreferenceVersion;
}

export function setMapsAppPreferenceCache(value) {
  mapsAppPreference = value === "google" ? "google" : "apple";
  mapsAppPreferenceVersion += 1;
}
