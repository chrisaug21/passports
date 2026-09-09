// No-op until loadDestinationsPage registers the real renderer.
function noopRenderer() {
  return undefined;
}

let rerenderDestinationsCallback = noopRenderer;

export function setDestinationsRenderer(renderer) {
  rerenderDestinationsCallback = renderer;
}

export function rerenderDestinations() {
  rerenderDestinationsCallback();
}
