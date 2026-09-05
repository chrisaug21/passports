import { appStore } from "../../../state/app-store.js";
import { isTripDetailUiBusy } from "./trip-detail-state.js";
import { loadTripDetail } from "./trip-detail-loader.js";

// wireTripDetailPage runs on every Plan-view re-render (not just once per
// navigation), so this always tears down and re-adds rather than trying to
// track whether it's "already set up" — cheap, and avoids a stale listener
// pointing at a tripId the user has since navigated away from.
let handleFocus = null;

export function teardownTripDetailFocusRefresh() {
  if (!handleFocus) {
    return;
  }

  window.removeEventListener("focus", handleFocus);
  document.removeEventListener("visibilitychange", handleFocus);
  handleFocus = null;
}

// Refetches the trip bundle when the app regains focus/visibility, so edits
// made via the MCP connector (in Claude, a separate surface) show up here
// without the user needing to reload. Skipped whenever a form or modal is
// open so it can't silently discard in-progress input.
export function setupTripDetailFocusRefresh(tripId) {
  teardownTripDetailFocusRefresh();

  handleFocus = () => {
    if (document.visibilityState === "hidden") {
      return;
    }

    if (isTripDetailUiBusy(appStore.getState().tripDetail)) {
      return;
    }

    void loadTripDetail(tripId);
  };

  window.addEventListener("focus", handleFocus);
  document.addEventListener("visibilitychange", handleFocus);
}
