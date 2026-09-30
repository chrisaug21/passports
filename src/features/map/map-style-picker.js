// Small floating "Map style" menu on the map canvas. Owns only its own DOM;
// map-page.js decides what happens when a style is picked.

function createElement(tagName, className, attributes = {}) {
  const element = document.createElement(tagName);
  element.className = className;
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}

function createOption(style, isSelected) {
  const option = createElement("button", "map-style-picker__option", {
    type: "button",
    "data-map-style-id": style.id,
    "aria-pressed": String(isSelected),
  });
  const label = document.createElement("strong");
  const hint = document.createElement("small");

  label.textContent = style.label;
  hint.textContent = style.hint;
  option.append(label, hint);
  return option;
}

export function mountMapStylePicker({ shell, styles, selectedId, onSelect }) {
  shell.querySelector(".map-style-picker")?.remove();

  if (styles.length < 2) {
    return;
  }

  const selectedStyle = styles.find((style) => style.id === selectedId) || styles[0];
  const picker = createElement("div", "map-style-picker");

  const toggle = createElement("button", "map-style-picker__toggle", {
    type: "button",
    "aria-expanded": "false",
    "aria-controls": "map-style-menu",
  });
  const current = createElement("span", "map-style-picker__current");
  current.textContent = selectedStyle.label;
  toggle.append(createElement("span", "map-style-picker__swatch", { "aria-hidden": "true" }), current);

  const menu = createElement("div", "map-style-picker__menu", {
    id: "map-style-menu",
    role: "group",
    "aria-label": "Map style",
  });
  menu.hidden = true;
  menu.append(...styles.map((style) => createOption(style, style.id === selectedStyle.id)));

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

  picker.append(toggle, menu);
  shell.append(picker);
}
