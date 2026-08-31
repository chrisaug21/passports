let isDelegationBound = false;

export function initItemNotesExpandDelegation() {
  if (isDelegationBound) {
    return;
  }
  isDelegationBound = true;

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return;
    }

    const toggle = target.closest("[data-item-notes-toggle]");
    if (!toggle) {
      return;
    }

    const container = toggle.closest("[data-item-notes]");
    if (!container) {
      return;
    }

    event.preventDefault();

    const isExpanding = !container.classList.contains("is-expanded");

    if (isExpanding) {
      document.querySelectorAll("[data-item-notes].is-expanded").forEach((other) => {
        if (other !== container) {
          setItemNotesExpanded(other, false);
        }
      });
    }

    setItemNotesExpanded(container, isExpanding);
  });
}

function setItemNotesExpanded(container, isExpanded) {
  container.classList.toggle("is-expanded", isExpanded);

  const preview = container.querySelector(".item-notes-expand__preview");
  const full = container.querySelector(".item-notes-expand__full");
  const toggle = container.querySelector("[data-item-notes-toggle]");

  if (preview) {
    preview.hidden = isExpanded;
  }
  if (full) {
    full.hidden = !isExpanded;
  }
  if (toggle) {
    toggle.textContent = isExpanded ? "Read less" : "Read more";
    toggle.setAttribute("aria-expanded", String(isExpanded));
  }
}
