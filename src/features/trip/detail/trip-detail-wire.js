function bindClick(selector, handler) {
  if (!handler) {
    return;
  }

  document.querySelectorAll(selector).forEach((element) => {
    element.addEventListener("click", handler);
  });
}

function bindSubmit(selector, handler) {
  if (!handler) {
    return;
  }

  document.querySelectorAll(selector).forEach((element) => {
    element.addEventListener("submit", handler);
  });
}

function bindAll(selector, eventName, handler) {
  if (!handler) {
    return;
  }

  document.querySelectorAll(selector).forEach((element) => {
    element.addEventListener(eventName, () => handler(element));
  });
}

export function wireTripDetailPageEvents(handlers) {
  bindClick("#trip-back-to-dashboard", handlers.onBackToDashboard);
  bindClick("#retry-trip-load", handlers.onRetryTripLoad);
  bindAll("[data-view-mode]", "click", (button) => {
    handlers.onViewModeChange?.(button.getAttribute("data-view-mode"));
  });
  bindClick("#toggle-trip-settings", handlers.onToggleTripSettings);
  bindClick("#cancel-trip-settings", handlers.onCancelTripSettings);
  bindClick("#mark-trip-done", handlers.onMarkTripDone);
  bindClick("#reopen-trip", handlers.onReopenTrip);
  bindClick("#open-delete-trip-confirm", handlers.onOpenDeleteTripConfirm);
  bindSubmit("#trip-settings-form", handlers.onTripSettingsSubmit);
  bindClick("#show-add-base-form", handlers.onShowAddBaseForm);
  bindClick("#cancel-add-base", handlers.onCancelAddBase);
  bindAll("[data-edit-base]", "click", (button) => {
    handlers.onEditBase?.(button.getAttribute("data-edit-base"));
  });
  bindAll("[data-cancel-edit-base]", "click", handlers.onCancelEditBase);
  bindAll("[data-allocation-adjust]", "click", (button) => {
    handlers.onAllocationAdjust?.({
      slotKey: button.getAttribute("data-slot-key"),
      direction: button.getAttribute("data-allocation-adjust"),
    });
  });
  bindClick("#cancel-allocation-changes", handlers.onCancelAllocationChanges);
  bindClick("#save-allocation-changes", handlers.onSaveAllocationChanges);
  bindClick("#cancel-allocation-confirm", handlers.onCancelAllocationConfirm);
  bindClick("[data-close-allocation-confirm]", handlers.onCloseAllocationConfirm);
  bindClick("#confirm-allocation-change", handlers.onConfirmAllocationChange);
  bindClick("#cancel-trip-length-confirm", handlers.onCancelTripLengthConfirm);
  bindClick("[data-close-trip-length-confirm]", handlers.onCloseTripLengthConfirm);
  bindClick("#confirm-trip-length-change", handlers.onConfirmTripLengthChange);
  bindSubmit("#add-base-form", handlers.onAddBaseSubmit);
  document.querySelectorAll("[data-edit-base-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      handlers.onEditBaseSubmit?.(event, form);
    });
  });
  bindAll("[data-delete-base]", "click", (button) => {
    handlers.onRequestDeleteBase?.(button.getAttribute("data-delete-base"));
  });
  bindSubmit("#master-list-quick-add-form", handlers.onQuickAddSubmit);
  bindAll("[data-edit-item]", "click", (button) => {
    handlers.onEditItem?.(button.getAttribute("data-edit-item"));
  });
  bindAll("[data-request-delete-item]", "click", (button) => {
    handlers.onRequestDeleteItem?.(button.getAttribute("data-request-delete-item"));
  });
  bindAll("[data-open-move-item]", "click", (button) => {
    handlers.onOpenMoveItem?.(button.getAttribute("data-open-move-item"));
  });
  bindClick("#close-item-editor", handlers.onCloseItemEditor);
  bindClick("#cancel-item-editor", handlers.onCloseItemEditor);
  bindClick("[data-close-item-editor]", handlers.onCloseItemEditor);
  handlers.onAfterItemEditorOpen?.();
  if (handlers.onItemEditorTypeChange) {
    document.querySelectorAll("#item-type-select").forEach((element) => {
      element.addEventListener("change", handlers.onItemEditorTypeChange);
    });
  }
  if (handlers.onItemEditorAssignmentChange) {
    document.querySelectorAll('[name="baseId"]').forEach((element) => {
      element.addEventListener("change", handlers.onItemEditorAssignmentChange);
    });
    document.querySelectorAll('[name="dayId"]').forEach((element) => {
      element.addEventListener("change", handlers.onItemEditorAssignmentChange);
    });
  }
  if (handlers.onItemEditorDraftChange) {
    document.querySelectorAll("#item-editor-form").forEach((element) => {
      element.addEventListener("input", handlers.onItemEditorDraftChange);
      element.addEventListener("change", handlers.onItemEditorDraftChange);
    });
  }
  bindSubmit("#item-editor-form", handlers.onItemEditorSubmit);
  bindClick("#close-move-item", handlers.onCloseMoveItem);
  bindClick("[data-close-move-item]", handlers.onCloseMoveItem);
  bindAll("[data-move-item-destination]", "click", (button) => {
    handlers.onMoveItemDestination?.(button.getAttribute("data-move-item-destination"), button);
  });
  bindClick("#delete-item-button", handlers.onDeleteItemButton);
  bindClick("#cancel-delete-item", handlers.onCancelDeleteItem);
  bindClick("[data-cancel-delete-item]", handlers.onCancelDeleteItem);
  bindClick("#confirm-delete-item", handlers.onConfirmDeleteItem);
  document.querySelectorAll("[data-reorder-item-up], [data-reorder-item-down]").forEach((button) => {
    button.addEventListener("click", () => {
      handlers.onReorderItem?.({
        itemId: button.getAttribute("data-reorder-item-up") || button.getAttribute("data-reorder-item-down"),
        dayId: button.getAttribute("data-reorder-day-id"),
        direction: button.hasAttribute("data-reorder-item-up") ? -1 : 1,
        button,
      });
    });
  });
  bindClick("#cancel-delete-base", handlers.onCancelDeleteBase);
  bindClick("[data-cancel-delete-base]", handlers.onCancelDeleteBase);
  bindClick("#confirm-delete-base", handlers.onConfirmDeleteBase);
  bindClick("#cancel-trip-status-confirm", handlers.onCancelTripStatusConfirm);
  bindClick("[data-cancel-trip-status-confirm]", handlers.onCancelTripStatusConfirm);
  bindClick("#confirm-trip-status-change", handlers.onConfirmTripStatusChange);
  bindClick("#cancel-delete-trip", handlers.onCancelDeleteTrip);
  bindClick("[data-cancel-delete-trip]", handlers.onCancelDeleteTrip);
  bindClick("#confirm-delete-trip", handlers.onConfirmDeleteTrip);
  bindAll("[data-edit-day-title]", "click", (button) => {
    handlers.onEditDayTitle?.(button.getAttribute("data-edit-day-title"));
  });
  bindAll("[data-day-title-trigger]", "click", (button) => {
    handlers.onDayTitleTrigger?.(button.getAttribute("data-day-title-trigger"));
  });

  document.querySelectorAll("#day-title-inline-input").forEach((dayTitleInput) => {
    handlers.onDayTitleInputReady?.(dayTitleInput);
    dayTitleInput.addEventListener("input", (event) => {
      handlers.onDayTitleInput?.(event.currentTarget.value);
    });
    if (handlers.onDayTitleBlur) {
      dayTitleInput.addEventListener("blur", handlers.onDayTitleBlur);
    }
    if (handlers.onDayTitleKeydown) {
      dayTitleInput.addEventListener("keydown", handlers.onDayTitleKeydown);
    }
  });
}
