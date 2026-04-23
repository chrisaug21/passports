import { tripDetailState } from "./trip-detail-state.js";

export function wireItemActionsMenus() {
  const menus = [...document.querySelectorAll(".item-actions-menu")];
  tripDetailState.closeOpenItemActionsMenus = (exceptionMenu = null) => {
    document.querySelectorAll(".item-actions-menu").forEach((menu) => {
      if (menu !== exceptionMenu) {
        menu.open = false;
      }
    });
  };

  menus.forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (menu.open) {
        const trigger = menu.querySelector(".item-actions-menu__trigger");

        if (trigger) {
          const { left, width } = trigger.getBoundingClientRect();
          const midpoint = left + (width / 2);
          menu.dataset.menuDirection = midpoint >= (window.innerWidth / 2) ? "left" : "right";
        }

        tripDetailState.closeOpenItemActionsMenus(menu);
      }
    });
  });

  if (tripDetailState.itemActionsGlobalListenersBound) {
    return;
  }

  document.addEventListener("click", (event) => {
    const menu = event.target instanceof Element ? event.target.closest(".item-actions-menu") : null;

    if (!menu) {
      tripDetailState.closeOpenItemActionsMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      tripDetailState.closeOpenItemActionsMenus();
    }
  });

  tripDetailState.itemActionsGlobalListenersBound = true;
}
