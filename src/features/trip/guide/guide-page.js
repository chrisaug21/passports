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

function summarizeSession(session) {
  return {
    hasSession: Boolean(session),
    userId: session?.user?.id || null,
    email: session?.user?.email || null,
  };
}

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
  console.info("[guide-debug] checkViewerRole:start", {
    tripId,
    userId: userId || null,
    ownerId: ownerId || null,
  });

  if (!userId) {
    console.info("[guide-debug] checkViewerRole:return-public-no-user", { tripId });
    return "public";
  }
  if (userId === ownerId) {
    console.info("[guide-debug] checkViewerRole:return-owner", { tripId, userId });
    return "owner";
  }

  const { data } = await getSupabase()
    .from("trip_members")
    .select("role")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  const resolvedRole = data?.role ? "member" : "public";
  console.info("[guide-debug] checkViewerRole:membership-query-result", {
    tripId,
    userId,
    membershipRole: data?.role || null,
    resolvedRole,
  });

  return resolvedRole;
}

// ---------------------------------------------------------------------------
// Async data load + render
// ---------------------------------------------------------------------------

export async function loadGuidePage(tripId) {
  const { session } = sessionStore.getState();
  const userId = session?.user?.id || null;
  const userEmail = session?.user?.email || "";
  console.info("[guide-debug] loadGuidePage:start", {
    tripId,
    session: summarizeSession(session),
  });

  try {
    const bundle = await fetchTripDetailBundle(tripId);
    console.info("[guide-debug] loadGuidePage:bundle-loaded", {
      tripId,
      isPublic: Boolean(bundle?.trip?.is_public),
      isJournalPublic: Boolean(bundle?.trip?.is_journal_public),
      status: bundle?.trip?.status || null,
      ownerId: bundle?.trip?.owner_id || null,
      baseCount: bundle?.bases?.length || 0,
      dayCount: bundle?.days?.length || 0,
      itemCount: bundle?.items?.length || 0,
    });
    const viewerRole = await checkViewerRole(tripId, userId, bundle.trip.owner_id);
    console.info("[guide-debug] loadGuidePage:viewer-role-resolved", {
      tripId,
      viewerRole,
      hasUserId: Boolean(userId),
      tripIsPublic: Boolean(bundle.trip.is_public),
    });

    // Non-member on a private trip → redirect away
    if (viewerRole === "public" && !bundle.trip.is_public) {
      console.warn("[guide-debug] loadGuidePage:redirect-private-trip", {
        tripId,
        viewerRole,
        tripIsPublic: bundle.trip.is_public,
      });
      navigate("/app");
      return;
    }

    let members;
    try {
      members = await fetchTripMembersWithEmails(tripId);
      console.info("[guide-debug] loadGuidePage:members-loaded", {
        tripId,
        memberCount: members?.length || 0,
        viewerRole,
      });
    } catch (error) {
      console.error("Failed to load trip members for journal attribution:", error);
      throw error;
    }

    if (!Array.isArray(members) || members.length === 0) {
      console.error("[guide-debug] loadGuidePage:members-empty", {
        tripId,
        viewerRole,
        isPublic: Boolean(bundle.trip.is_public),
        isJournalPublic: Boolean(bundle.trip.is_journal_public),
      });
      throw new Error("Trip members are required to load journal attribution.");
    }

    if (userId && userEmail && !members.find((member) => member.user_id === userId)) {
      members.push({ user_id: userId, email: userEmail, role: viewerRole });
    }

    // Pre-fetch the current user's profile so the profile prompt check is immediate
    let currentUserProfile = null;
    if (userId) {
      currentUserProfile = await fetchUserProfile(userId).catch(() => null);
      console.info("[guide-debug] loadGuidePage:current-user-profile", {
        tripId,
        userId,
        hasProfile: Boolean(currentUserProfile),
      });
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
    console.info("[guide-debug] loadGuidePage:render-complete", {
      tripId,
      viewerRole,
      renderedMode: "guide",
    });
    window.lucide?.createIcons?.();
    wireGuideView(state);
    document.title = `Passports | ${bundle.trip.title || "Guide"}`;
  } catch (error) {
    console.error("[guide-debug] loadGuidePage:error", {
      tripId,
      session: summarizeSession(session),
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    console.error(error);
    const root = document.querySelector("#guide-view-root");
    if (root) {
      root.innerHTML = renderGuideErrorView();
    }
  }
}
