// Small floating "Map style" menu on the map canvas. Owns only its own DOM;
// map-page.js decides what happens when a style is picked.

export function mountMapStylePicker({ shell, styles, selectedId, onSelect }) {
  shell.querySelector(".map-style-picker")?.remove();

  if (styles.length < 2) {
    return;
  }

  const selectedStyle = styles.find((style) => style.id === selectedId) || styles[0];
  const picker = document.createElement("div");
  picker.className = "map-style-picker";
  picker.innerHTML = `
    <button class="map-style-picker__toggle" type="button" aria-expanded="false" aria-controls="map-style-menu">
      <span class="map-style-picker__swatch" aria-hidden="true"></span>
      <span class="map-style-picker__current"></span>
    </button>
    <div class="map-style-picker__menu" id="map-style-menu" role="group" aria-label="Map style" hidden>
      ${styles.map((style) => `
        <button class="map-style-picker__option" type="button" data-map-style-id="${style.id}" aria-pressed="${style.id === selectedStyle.id}">
          <strong></strong>
          <small></small>
        </button>
      `).join("")}
    </div>
  `;

  picker.querySelector(".map-style-picker__current").textContent = selectedStyle.label;
  picker.querySelectorAll(".map-style-picker__option").forEach((button, index) => {
    button.querySelector("strong").textContent = styles[index].label;
    button.querySelector("small").textContent = styles[index].hint;
  });

  const toggle = picker.querySelector(".map-style-picker__toggle");
  const menu = picker.querySelector(".map-style-picker__menu");

  toggle.addEventListener("click", () => {
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", String(willOpen));
  });

  menu.addEventListener("click", (event) => {
    const option = event.target.closest("[data-map-style-id]");

    if (option) {
      onSelect(option.getAttribute("data-map-style-id"));
    }
  });

  shell.append(picker);
}
