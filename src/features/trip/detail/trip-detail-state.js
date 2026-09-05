export const tripDetailState = {
  rerenderTripDetail: () => {},
  itemEditorInitialSnapshot: "",
  pendingDiscardAction: null,
  itemEditorDraft: null,
  supportedTimezonesCache: null,
  allocationDraft: null,
  allocationConfirmState: null,
  pendingTripSettingsDraft: null,
  tripLengthConfirmState: null,
  editingDayTitleId: null,
  editingDayTitleValue: "",
  closeOpenItemActionsMenus: () => {},
  itemActionsGlobalListenersBound: false,
  persistedEditorItemId: null,
  membersModalState: null,
};

export function setTripDetailRerenderer(renderer) {
  tripDetailState.rerenderTripDetail = renderer;
}

export function rerenderTripDetail() {
  tripDetailState.rerenderTripDetail();
}

// Shared with the focus-triggered background refresh (trip-detail-focus-refresh.js)
// so a silent refetch never closes a form or modal the user has open.
export function isTripDetailUiBusy(tripDetail) {
  return Boolean(
    tripDetail.editingItemId ||
    tripDetail.itemEditorMode === "add" ||
    tripDetail.isShowingTripSettings ||
    tripDetail.isShowingAddBaseForm ||
    tripDetail.editingBaseId ||
    tripDetail.showDiscardConfirm ||
    tripDetail.showDeleteItemConfirm ||
    tripDetail.showMoveItemModal ||
    tripDetail.isShowingMasterListFilters ||
    tripDetail.showDeleteBaseConfirm ||
    tripDetail.showDeleteTripConfirm ||
    tripDetail.isShowingMembersModal ||
    tripDetail.overviewEditorMode ||
    tripDetail.showDeleteOverviewBlockConfirm ||
    tripDetailState.allocationConfirmState
  );
}

export function resetTripDetailTransientState() {
  tripDetailState.itemEditorInitialSnapshot = "";
  tripDetailState.pendingDiscardAction = null;
  tripDetailState.itemEditorDraft = null;
  tripDetailState.allocationDraft = null;
  tripDetailState.allocationConfirmState = null;
  tripDetailState.pendingTripSettingsDraft = null;
  tripDetailState.tripLengthConfirmState = null;
  tripDetailState.editingDayTitleId = null;
  tripDetailState.editingDayTitleValue = "";
  tripDetailState.persistedEditorItemId = null;
  tripDetailState.membersModalState = null;
}
