// Draws the travel map with MapLibre GL. map-page.js owns the data and popup
// content; this file owns the map engine details (globe, clustering, markers).

const FIT_OPTIONS = { padding: 48, maxZoom: 6 };
const POPUP_VIEW_PADDING = 12;
const GLOBE_SPAN_DEGREES = 100;
const PIN_SOURCE_ID = "trip-pins";

// `camera` ({ center, zoom }) restores the view when the style is swapped.
export function createTravelMap({ container, style, pinGroups, camera, createPinElement, renderPopupHtml, onPopupOpen }) {
  const { maplibregl } = window;
  const map = new maplibregl.Map({
    container,
    style,
    center: camera?.center || [0, 20],
    zoom: camera?.zoom ?? 1,
    maxZoom: 18,
    pitchWithRotate: false,
    dragRotate: false,
    attributionControl: { compact: true },
  });

  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

  const markersByKey = new Map();
  let openPopup = null;

  function fitAll(options = {}) {
    if (pinGroups.length === 0) {
      map.easeTo({ center: [0, 20], zoom: 1, ...options });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    pinGroups.forEach((pinGroup) => bounds.extend([pinGroup.lng, pinGroup.lat]));

    // Pins spread across the world: a rectangle fit would crop the globe, so
    // zoom out until the whole globe fits the frame instead.
    if (bounds.getEast() - bounds.getWest() > GLOBE_SPAN_DEGREES || bounds.getNorth() - bounds.getSouth() > GLOBE_SPAN_DEGREES / 2) {
      const usableHeight = Math.max(container.clientHeight - FIT_OPTIONS.padding, 120);
      const globeZoom = Math.log2((Math.PI * usableHeight) / 512);
      map.easeTo({ center: bounds.getCenter(), zoom: Math.max(globeZoom, 0.5), ...options });
      return;
    }

    map.fitBounds(bounds, { ...FIT_OPTIONS, ...options });
  }

  // Popups don't pan the map on their own, so a pin near an edge (common on
  // phones) opens a popup that is partly off screen. Nudge the map just enough
  // that the popup and its pin are both fully visible; do nothing if they fit.
  function keepPopupInView(popup, markerElement) {
    const popupRect = popup.getElement()?.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    if (!popupRect || popupRect.width === 0) {
      return;
    }

    const pinRect = markerElement.getBoundingClientRect();
    const left = Math.min(popupRect.left, pinRect.left);
    const right = Math.max(popupRect.right, pinRect.right);
    const top = Math.min(popupRect.top, pinRect.top);
    const bottom = Math.max(popupRect.bottom, pinRect.bottom);

    let shiftX = 0;
    let shiftY = 0;

    if (left < containerRect.left + POPUP_VIEW_PADDING) {
      shiftX = containerRect.left + POPUP_VIEW_PADDING - left;
    } else if (right > containerRect.right - POPUP_VIEW_PADDING) {
      shiftX = containerRect.right - POPUP_VIEW_PADDING - right;
    }

    if (top < containerRect.top + POPUP_VIEW_PADDING) {
      shiftY = containerRect.top + POPUP_VIEW_PADDING - top;
    } else if (bottom > containerRect.bottom - POPUP_VIEW_PADDING) {
      shiftY = containerRect.bottom - POPUP_VIEW_PADDING - bottom;
    }

    // If both can't fit (a very tall popup), the popup's top edge wins.
    if (top + shiftY < containerRect.top + POPUP_VIEW_PADDING) {
      shiftY = containerRect.top + POPUP_VIEW_PADDING - top;
    }

    if (shiftX !== 0 || shiftY !== 0) {
      // Content moves opposite to the map's own pan direction.
      map.panBy([-shiftX, -shiftY], { duration: 300 });
    }
  }

  function createPinMarker(pinGroup) {
    const element = createPinElement(pinGroup);
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", pinGroup.title);
    element.title = pinGroup.title;

    const popup = new maplibregl.Popup({ offset: 20, maxWidth: "none" }).setHTML(renderPopupHtml(pinGroup));

    // Leaflet closed the old popup when a new one opened; MapLibre doesn't.
    popup.on("open", () => {
      if (openPopup && openPopup !== popup) {
        openPopup.remove();
      }

      openPopup = popup;
      onPopupOpen(popup.getElement());
      requestAnimationFrame(() => keepPopupInView(popup, element));
    });

    return new maplibregl.Marker({ element, opacityWhenCovered: "0" }).setLngLat([pinGroup.lng, pinGroup.lat]).setPopup(popup);
  }

  function createClusterMarker(feature) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "travel-map-cluster";
    element.setAttribute("aria-label", `${feature.properties.point_count} places, zoom in`);
    element.innerHTML = `<span>${feature.properties.point_count}</span>`;

    element.addEventListener("click", async () => {
      const zoom = await map.getSource(PIN_SOURCE_ID).getClusterExpansionZoom(feature.properties.cluster_id);
      map.easeTo({ center: feature.geometry.coordinates, zoom: Math.min(zoom, 14) });
    });

    return new maplibregl.Marker({ element, opacityWhenCovered: "0" }).setLngLat(feature.geometry.coordinates);
  }

  // Pins are HTML elements (so they keep their CSS look), which MapLibre can't
  // cluster on its own. Let it cluster the data, then mirror the visible
  // clusters/points as markers whenever the view changes.
  function syncMarkers() {
    if (!map.getSource(PIN_SOURCE_ID) || !map.isSourceLoaded(PIN_SOURCE_ID)) {
      return;
    }

    const visibleKeys = new Set();

    map.querySourceFeatures(PIN_SOURCE_ID).forEach((feature) => {
      const isCluster = feature.properties.cluster;
      const key = isCluster ? `cluster-${feature.properties.cluster_id}` : `pin-${feature.properties.index}`;

      if (visibleKeys.has(key)) {
        return;
      }

      visibleKeys.add(key);

      if (!markersByKey.has(key)) {
        const marker = isCluster
          ? createClusterMarker(feature)
          : createPinMarker(pinGroups[feature.properties.index]);
        marker.addTo(map);
        markersByKey.set(key, marker);
      }
    });

    markersByKey.forEach((marker, key) => {
      if (!visibleKeys.has(key)) {
        marker.remove();
        markersByKey.delete(key);
      }
    });
  }

  map.on("load", () => {
    map.addSource(PIN_SOURCE_ID, {
      type: "geojson",
      cluster: true,
      clusterRadius: 50,
      clusterMaxZoom: 10,
      data: {
        type: "FeatureCollection",
        features: pinGroups.map((pinGroup, index) => ({
          type: "Feature",
          properties: { index },
          geometry: { type: "Point", coordinates: [pinGroup.lng, pinGroup.lat] },
        })),
      },
    });

    // A source only loads tiles for the view if some layer draws it, so add an
    // invisible one; the visible pins are HTML markers.
    map.addLayer({
      id: `${PIN_SOURCE_ID}-probe`,
      type: "circle",
      source: PIN_SOURCE_ID,
      paint: { "circle-radius": 1, "circle-opacity": 0 },
    });

    map.on("render", syncMarkers);
    if (!camera) {
      fitAll({ duration: 0 });
    }
  });

  return {
    getCamera: () => ({ center: map.getCenter().toArray(), zoom: map.getZoom() }),
    fitAll: () => fitAll({ duration: 800 }),
    remove: () => map.remove(),
  };
}
