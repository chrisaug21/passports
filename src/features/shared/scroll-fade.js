// Adds soft fades to the edges of a horizontally scrolling row (see
// .scroll-fade in utilities.css) so it's clear there's more to scroll to.
// Toggles has-more-left / has-more-right as the row scrolls or resizes.
// Returns a cleanup function.
export function attachScrollFade(element) {
  if (!element) return () => {};

  element.classList.add("scroll-fade");

  const update = () => {
    const maxScroll = element.scrollWidth - element.clientWidth;
    element.classList.toggle("has-more-left", element.scrollLeft > 4);
    element.classList.toggle("has-more-right", element.scrollLeft < maxScroll - 4);
  };

  element.addEventListener("scroll", update, { passive: true });
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
  resizeObserver?.observe(element);
  // Contents get swapped (e.g. itinerary <-> journal), which changes scrollWidth.
  const mutationObserver = new MutationObserver(update);
  mutationObserver.observe(element, { childList: true, subtree: true });
  update();

  return () => {
    element.removeEventListener("scroll", update);
    resizeObserver?.disconnect();
    mutationObserver.disconnect();
  };
}
