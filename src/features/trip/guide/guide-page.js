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
import { fetchUserProfile } from "../../../services/journal-service.js";

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

async function checkViewerRole(tripId, userId, ownerId) {
  if (!userId) {
    return "public";
  }
  if (userId === ownerId) {
    return "owner";
  }

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
  const userEmail = session?.user?.email || "";

  try {
    const bundle = await fetchTripDetailBundle(tripId);
    const viewerRole = await checkViewerRole(tripId, userId, bundle.trip.owner_id);

    // Non-member on a private trip → redirect away
    if (viewerRole === "public" && !bundle.trip.is_public) {
      navigate("/app");
      return;
    }

    let members = [];
    if (viewerRole !== "public") {
      try {
        members = await fetchTripMembersWithEmails(tripId);
      } catch (error) {
        console.error("Failed to load trip members for guide view:", error);
        throw error;
      }
    }

    if (userId && userEmail && !members.find((member) => member.user_id === userId)) {
      members.push({ user_id: userId, email: userEmail, role: viewerRole });
    }

    // Pre-fetch the current user's profile so the profile prompt check is immediate
    let currentUserProfile = null;
    if (userId) {
      currentUserProfile = await fetchUserProfile(userId).catch(() => null);
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
      userEmail,
      currentUserProfile,
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
