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
};

export function setTripDetailRerenderer(renderer) {
  tripDetailState.rerenderTripDetail = renderer;
}

export function rerenderTripDetail() {
  tripDetailState.rerenderTripDetail();
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
}
