import { fetchTripDetailBundle } from "../../../services/trips-service.js";
import { fetchTripMembersWithEmails } from "../../../services/members-service.js";
import { getSupabase } from "../../../lib/supabase.js";
import { sessionStore } from "../../../state/session-store.js";
import { navigate } from "../../../app/router.js";
import {
  renderGuideView,
  renderGuideLoadingView,
  renderGuideErrorView,
} from "./guide-view.js";
import { wireGuideView, teardownGuideView } from "./guide-wire.js";

// ---------------------------------------------------------------------------
// Initial render — loading shell (called synchronously by router)
// ---------------------------------------------------------------------------

export function renderGuidePage() {
  return `
    <section class="guide-view">
      <div id="guide-view-root">
        ${renderGuideLoadingView()}
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Viewer-role check
// ---------------------------------------------------------------------------

async function checkViewerRole(tripId, userId) {
  if (!userId) return "public";

  const { data } = await getSupabase()
    .from("trip_members")
    .select("role")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  return data?.role ? "member" : "public";
}

// ---------------------------------------------------------------------------
// Async data load + render
// ---------------------------------------------------------------------------

export async function loadGuidePage(tripId) {
  const { session } = sessionStore.getState();
  const userId = session?.user?.id || null;

  try {
    const bundle = await fetchTripDetailBundle(tripId);
    const viewerRole = await checkViewerRole(tripId, userId);

    // Non-member on a private trip → redirect away
    if (viewerRole === "public" && !bundle.trip.is_public) {
      navigate("/app");
      return;
    }

    let members = [];
    if (viewerRole === "member") {
      members = await fetchTripMembersWithEmails(tripId);
    }

    const state = {
      tripId,
      trip: bundle.trip,
      bases: bundle.bases,
      days: bundle.days,
      items: bundle.items,
      members,
      viewerRole,
      userId,
    };

    const root = document.querySelector("#guide-view-root");
    if (!root) return;

    teardownGuideView();
    root.innerHTML = renderGuideView(state);
    window.lucide?.createIcons?.();
    wireGuideView(state);
    document.title = `Passports | ${bundle.trip.title || "Guide"}`;
  } catch (error) {
    console.error(error);
    const root = document.querySelector("#guide-view-root");
    if (root) {
      root.innerHTML = renderGuideErrorView();
    }
  }
}
