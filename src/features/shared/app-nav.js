import { navigate } from "../../app/router.js";

const NAV_ITEMS = [
  { id: "trips", label: "Trips", path: "/app", icon: "luggage" },
  { id: "destinations", label: "Destinations", path: "/app/destinations", icon: "map" },
  { id: "archive", label: "Archive", path: "/app/archive", icon: "archive" },
];

export function renderAppNav(activeItem = "") {
  return `
    <nav class="app-nav" aria-label="Primary">
      ${NAV_ITEMS.map((item) => {
        return `
          <button
            class="app-nav__item"
            type="button"
            data-app-nav-item="${item.id}"
            data-app-nav-path="${item.path}"
            aria-current="${item.id === activeItem ? "page" : "false"}"
          >
            <i data-lucide="${item.icon}" aria-hidden="true"></i>
            <span>${item.label}</span>
          </button>
        `;
      }).join("")}
    </nav>
  `;
}

export function wireAppNav() {
  document.querySelectorAll("[data-app-nav-item]").forEach((button) => {
    button.addEventListener("click", () => {
      navigate(button.getAttribute("data-app-nav-path"));
    });
  });
}
