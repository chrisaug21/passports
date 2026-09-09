let rerenderDestinationsCallback = () => {};

export function setDestinationsRenderer(renderer) {
  rerenderDestinationsCallback = renderer;
}

export function rerenderDestinations() {
  rerenderDestinationsCallback();
}
