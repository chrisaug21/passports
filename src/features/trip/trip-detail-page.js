import { appStore } from "../../state/app-store.js";
import { navigate } from "../../app/router.js";
import {
  rerenderTripDetail,
  setTripDetailRerenderer,
  tripDetailState,
  isTripDetailUiBusy,
} from "./detail/trip-detail-state.js";
import { loadTripDetail as loadTripDetailFromModule } from "./detail/trip-detail-loader.js";
import { wireTripDetailPageEvents } from "./detail/trip-detail-wire.js";
import {
  setupTripDetailFocusRefresh,
  teardownTripDetailFocusRefresh,
} from "./detail/trip-detail-focus-refresh.js";
import {
  createTripSettingsHandlers,
} from "./detail/trip-settings-controller.js";
import {
  createBaseAllocationHandlers,
  wireTimezonePickers,
} from "./detail/base-allocation-controller.js";
import {
  createDaysViewHandlers,
} from "./detail/days-view-controller.js";
import {
  createPhotoUploadHandlers,
} from "./detail/photo-upload-controller.js";
import {
  createItemsHandlers,
  wireItemActionsMenus,
} from "./detail/items-controller.js";
import {
  createItemEditorHandlers,
  getTripItemErrorMessage,
} from "./detail/item-editor-controller.js";
import { createMembersHandlers } from "./detail/members-controller.js";
import { createOverviewHandlers } from "./detail/overview-controller.js";
import { renderTripDetailPageView } from "./detail/trip-detail-view.js";

export function setTripDetailRenderer(renderer) {
  setTripDetailRerenderer(renderer);
}

export async function loadTripDetail(tripId) {
  return loadTripDetailFromModule(tripId);
}

function syncTripDetailModalState(tripDetail) {
  if (typeof document === "undefined") {
    return;
  }

  document.body.classList.toggle("modal-open", isTripDetailUiBusy(tripDetail));
}

function createTripDetailHandlers(tripId) {
  const tripSettingsHandlers = createTripSettingsHandlers({
    getTripItemErrorMessage,
    loadTripDetail,
  });
  const baseAllocationHandlers = createBaseAllocationHandlers({
    getTripItemErrorMessage,
    loadTripDetail,
  });
  const daysViewHandlers = createDaysViewHandlers();
  const photoUploadHandlers = createPhotoUploadHandlers();
  const itemsHandlers = createItemsHandlers({
    getTripItemErrorMessage,
  });
  const itemEditorHandlers = createItemEditorHandlers();
  const membersHandlers = createMembersHandlers();
  const overviewHandlers = createOverviewHandlers();

  return {
    onBackToDashboard: () => navigate("/app"),
    onOpenGuide: () => navigate(`/app/trip/${tripId}/guide`),
    onRetryTripLoad: () => loadTripDetail(tripId),
    onRefreshTripDetail: () => loadTripDetail(tripId),
    onViewModeChange: (viewMode) => {
      if (!viewMode) {
        return;
      }

      appStore.updateTripDetail({ viewMode });
      rerenderTripDetail();
    },
    ...tripSettingsHandlers,
    ...baseAllocationHandlers,
    ...daysViewHandlers,
    ...photoUploadHandlers,
    ...itemsHandlers,
    ...itemEditorHandlers,
    ...membersHandlers,
    ...overviewHandlers,
  };
}

export function renderTripDetailPage() {
  syncTripDetailModalState(appStore.getState().tripDetail);
  return renderTripDetailPageView();
}

export function wireTripDetailPage(tripId) {
  wireItemActionsMenus();
  wireTimezonePickers();
  wireTripDetailPageEvents(createTripDetailHandlers(tripId));
  setupTripDetailFocusRefresh(tripId);
}

export { teardownTripDetailFocusRefresh };
