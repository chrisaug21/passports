import { ensureBrowserDecodableImage } from "./heic-convert.js";

export const DEFAULT_PHOTO_ASPECT_RATIO = 3 / 2;

// Three sizes are cropped from the same selection and uploaded together:
// full-size for the trip's own page, and two smaller ones (matching
// getPhotoPreviewPublicUrl/getPhotoCardPublicUrl in photos-service.js) so
// list views don't have to load full-size photos. Generated client-side
// rather than via Supabase's on-the-fly image transform, which requires a
// paid plan.
const PHOTO_VARIANT_SIZES = {
  full: { width: 1200, height: 800, quality: 0.85 },
  preview: { width: 720, height: 480, quality: 0.72 },
  card: { width: 360, height: 240, quality: 0.7 },
};

const SELECT_IMAGE_FALLBACK_TIMEOUT_MS = 120000;

export function selectImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let isResolved = false;
    let fallbackTimeoutId = 0;
    const cleanup = () => {
      window.removeEventListener("focus", handleWindowFocus);
      window.clearTimeout(fallbackTimeoutId);
      input.remove();
    };
    const finish = (file) => {
      if (isResolved) {
        return;
      }

      isResolved = true;
      cleanup();
      resolve(file);
    };
    // Fallback heuristic for browsers without the native "cancel" event
    // below: on some browser/OS combinations, the window "focus" event can
    // fire before the browser has finished populating input.files and
    // dispatching "change" for a real selection — a 250ms grace window was
    // observed to be too tight in practice and could read files as empty
    // and resolve null out from under a selection that was already made,
    // silently killing the rest of the upload flow with no error shown.
    // Widened, and now only a fallback behind the "cancel" event.
    const handleWindowFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) {
          finish(null);
        }
      }, 750);
    };

    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    input.addEventListener("change", () => {
      finish(input.files?.[0] || null);
    }, { once: true });
    // Primary cancel-detection signal where supported (modern Chromium,
    // Firefox, Safari) — fires reliably on dialog dismissal without any
    // dependency on window focus timing, sidestepping the race above
    // entirely for browsers that have it.
    input.addEventListener("cancel", () => {
      finish(null);
    }, { once: true });
    window.addEventListener("focus", handleWindowFocus);
    // Safety net: the "focus" listener above is a heuristic for detecting a
    // canceled file picker, and it isn't reliable on every browser/OS
    // combination. Without a hard fallback, an environment where it never
    // fires leaves this promise pending forever — which, upstream, leaves
    // the caller's busy lock stuck permanently, silently blocking every
    // future photo upload with no error shown. Guarantee this always
    // settles eventually regardless of that event firing.
    fallbackTimeoutId = window.setTimeout(() => finish(null), SELECT_IMAGE_FALLBACK_TIMEOUT_MS);
    document.body.append(input);
    input.click();
  });
}

export async function openPhotoCropModal(file, { aspectRatio = DEFAULT_PHOTO_ASPECT_RATIO } = {}) {
  let imageUrl = "";

  return openCropperModal({
    // Runs after the modal is already on screen, so a HEIC file that needs a
    // slow conversion shows a "preparing" state instead of a dead click.
    prepareImageUrl: async () => {
      imageUrl = URL.createObjectURL(await ensureBrowserDecodableImage(file));
      return imageUrl;
    },
    aspectRatio,
    cleanup: () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    },
  });
}

export function openPhotoCropModalFromUrl(imageUrl, { aspectRatio = DEFAULT_PHOTO_ASPECT_RATIO } = {}) {
  return openCropperModal({
    imageUrl,
    aspectRatio,
  });
}

function openCropperModal({ imageUrl = "", prepareImageUrl = null, aspectRatio, cleanup = () => {} }) {
  return new Promise((resolve, reject) => {
    const CropperClass = window.Cropper;
    const modal = renderCropModal();
    const image = modal.querySelector("[data-photo-crop-image]");
    const stage = modal.querySelector("[data-photo-crop-stage]");
    const zoomInput = modal.querySelector("[data-photo-crop-zoom]");
    const statusElement = modal.querySelector("[data-photo-crop-status]");
    const confirmButton = modal.querySelector("[data-photo-crop-confirm]");
    const hadModalOpen = document.body.classList.contains("modal-open");
    let cropper = null;
    let minZoom = 0.01;
    let maxZoom = 3;
    let isSyncingZoom = false;
    let isClosed = false;
    let initTimeoutId = 0;

    if (!CropperClass || !image || !stage || !zoomInput) {
      cleanup();
      reject(new Error("Could not open the photo cropper."));
      return;
    }

    const teardown = () => {
      isClosed = true;
      if (initTimeoutId) {
        window.clearTimeout(initTimeoutId);
      }
      cropper?.destroy();
      modal.remove();
      document.body.classList.toggle("modal-open", hadModalOpen);
      cleanup();
    };

    const finish = (value) => {
      teardown();
      resolve(value);
    };

    const fail = (error) => {
      teardown();
      reject(error);
    };

    const syncZoomInput = () => {
      if (!cropper) {
        return;
      }

      const imageData = cropper.getImageData();
      const containerData = cropper.getContainerData();
      const currentZoom = imageData.naturalWidth ? imageData.width / imageData.naturalWidth : 1;
      const nextMinZoom = imageData.naturalWidth && imageData.naturalHeight
        ? Math.max(0.01, Math.min(
          containerData.width / imageData.naturalWidth,
          containerData.height / imageData.naturalHeight
        ))
        : 0.01;

      minZoom = nextMinZoom;
      maxZoom = Math.max(minZoom + 0.01, currentZoom, minZoom * 6, 3);
      zoomInput.min = String(minZoom);
      zoomInput.max = String(maxZoom);
      isSyncingZoom = true;
      zoomInput.value = String(Math.min(maxZoom, Math.max(minZoom, currentZoom)));
      isSyncingZoom = false;
    };

    const showStatus = (message, { isError = false } = {}) => {
      statusElement.textContent = message;
      statusElement.classList.toggle("photo-crop-modal__status--error", isError);
      statusElement.hidden = false;
    };

    image.crossOrigin = "anonymous";
    document.body.append(modal);
    document.body.classList.add("modal-open");

    const initializeCropper = (remainingAttempts = 8) => {
      if (isClosed || cropper) {
        return;
      }

      if (stage.offsetWidth <= 0 || stage.offsetHeight <= 0) {
        if (remainingAttempts <= 0) {
          fail(new Error("Could not open the photo cropper."));
          return;
        }

        initTimeoutId = window.setTimeout(() => {
          window.requestAnimationFrame(() => initializeCropper(remainingAttempts - 1));
        }, 50);
        return;
      }

      cropper = new CropperClass(image, {
        aspectRatio,
        viewMode: 1,
        autoCropArea: 0.85,
        dragMode: "move",
        responsive: true,
        restore: false,
        background: false,
        guides: false,
        center: false,
        highlight: false,
        movable: true,
        zoomable: true,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
        ready() {
          confirmButton.disabled = false;
          syncZoomInput();
          window.requestAnimationFrame(syncZoomInput);
        },
        zoom() {
          syncZoomInput();
        },
      });
    };

    const startCropper = (url) => {
      image.src = url;
      window.requestAnimationFrame(() => initializeCropper());
    };

    if (prepareImageUrl) {
      showStatus("Preparing your photo…");
      prepareImageUrl().then((url) => {
        if (isClosed) {
          return;
        }

        statusElement.hidden = true;
        startCropper(url);
      }).catch((error) => {
        console.error(error);
        if (!isClosed) {
          showStatus(
            "We couldn't open that photo. Try a JPEG or PNG instead, or check your connection and try again.",
            { isError: true }
          );
        }
      });
    } else {
      startCropper(imageUrl);
    }

    zoomInput.addEventListener("input", () => {
      if (!cropper || isSyncingZoom) {
        return;
      }

      const nextZoom = Number(zoomInput.value);

      if (!Number.isFinite(nextZoom)) {
        return;
      }

      cropper.zoomTo(Math.min(maxZoom, Math.max(minZoom, nextZoom)));
    });

    modal.querySelectorAll("[data-photo-crop-cancel]").forEach((button) => {
      button.addEventListener("click", () => {
        finish(null);
      });
    });

    modal.querySelector("[data-photo-crop-confirm]")?.addEventListener("click", async () => {
      try {
        const variantEntries = await Promise.all(
          Object.entries(PHOTO_VARIANT_SIZES).map(async ([variant, { width, height, quality }]) => {
            const canvas = cropper?.getCroppedCanvas({ width, height, fillColor: "#ffffff" });

            if (!canvas) {
              throw new Error("Could not crop that image.");
            }

            return [variant, await canvasToJpegBlob(canvas, quality)];
          })
        );

        finish(Object.fromEntries(variantEntries));
      } catch (error) {
        fail(error);
      }
    });
  });
}

// Second step after cropping: pick the point that stays in view when the
// photo is shown in a shorter/narrower frame (wide banner, tall thumbnail).
// Resolves { focalX, focalY } (0-100), or null if cancelled. Uses the same
// shapes the app actually renders so the previews are honest.
export function openFocalPointModal(imageUrl, { focalX = 50, focalY = 50 } = {}) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-shell photo-crop-modal";
    modal.setAttribute("aria-hidden", "false");
    modal.innerHTML = `
      <div class="modal-backdrop" data-focal-cancel></div>
      <section class="panel modal-card modal-card--editor photo-focal-modal__card" role="dialog" aria-modal="true" aria-label="Choose photo focus">
        <div class="modal-card__header">
          <h3>Choose what stays in view</h3>
          <button class="icon-button" data-focal-cancel type="button" aria-label="Close">×</button>
        </div>
        <p class="photo-focal-modal__hint">Drag the dot to the part of the photo that matters. Shorter banners and small thumbnails will center on it.</p>
        <div class="photo-focal-modal__stage" data-focal-stage>
          <img class="photo-focal-modal__image" data-focal-image alt="" draggable="false" />
          <span class="photo-focal-modal__dot" data-focal-dot aria-hidden="true"></span>
        </div>
        <div class="photo-focal-modal__previews">
          <figure class="photo-focal-modal__preview photo-focal-modal__preview--banner">
            <img data-focal-preview alt="" />
            <figcaption>Banner</figcaption>
          </figure>
          <figure class="photo-focal-modal__preview photo-focal-modal__preview--thumb">
            <img data-focal-preview alt="" />
            <figcaption>Thumbnail</figcaption>
          </figure>
        </div>
        <div class="modal-card__actions modal-card__actions--end photo-crop-modal__actions">
          <button class="button button--secondary" data-focal-cancel type="button">Cancel</button>
          <button class="button" data-focal-confirm type="button">Save photo</button>
        </div>
      </section>
    `;

    const hadModalOpen = document.body.classList.contains("modal-open");
    const stage = modal.querySelector("[data-focal-stage]");
    const dot = modal.querySelector("[data-focal-dot]");
    const previews = modal.querySelectorAll("[data-focal-preview]");
    // Set via the DOM rather than interpolated into the template above.
    modal.querySelector("[data-focal-image]").src = imageUrl;
    previews.forEach((preview) => {
      preview.src = imageUrl;
    });
    let x = clampPercent(focalX);
    let y = clampPercent(focalY);

    const render = () => {
      dot.style.left = `${x}%`;
      dot.style.top = `${y}%`;
      previews.forEach((preview) => {
        preview.style.objectPosition = `${x}% ${y}%`;
      });
    };

    const moveTo = (event) => {
      const rect = stage.getBoundingClientRect();
      x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
      y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
      render();
    };

    const finish = (result) => {
      modal.remove();
      if (!hadModalOpen) {
        document.body.classList.remove("modal-open");
      }
      resolve(result);
    };

    stage.addEventListener("pointerdown", (event) => {
      stage.setPointerCapture(event.pointerId);
      moveTo(event);
    });
    stage.addEventListener("pointermove", (event) => {
      if (stage.hasPointerCapture(event.pointerId)) {
        moveTo(event);
      }
    });
    modal.querySelectorAll("[data-focal-cancel]").forEach((button) => {
      button.addEventListener("click", () => finish(null));
    });
    modal.querySelector("[data-focal-confirm]").addEventListener("click", () => {
      finish({ focalX: x, focalY: y });
    });

    render();
    document.body.classList.add("modal-open");
    document.body.append(modal);
  });
}

function clampPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, Math.round(number * 10) / 10)) : 50;
}

function renderCropModal() {
  const modal = document.createElement("div");
  modal.className = "modal-shell photo-crop-modal";
  modal.setAttribute("aria-hidden", "false");
  modal.innerHTML = `
    <div class="modal-backdrop" data-photo-crop-cancel></div>
    <section class="panel modal-card modal-card--editor photo-crop-modal__card" role="dialog" aria-modal="true" aria-label="Crop photo">
      <div class="modal-card__header">
        <h3>Crop Photo</h3>
        <button class="icon-button" data-photo-crop-cancel type="button" aria-label="Close photo cropper">×</button>
      </div>
      <div class="photo-crop-modal__stage" data-photo-crop-stage>
        <img class="photo-crop-modal__image" data-photo-crop-image alt="" draggable="false" />
        <p class="photo-crop-modal__status" data-photo-crop-status role="status" hidden></p>
      </div>
      <label class="field photo-crop-modal__zoom">
        <span>Zoom</span>
        <input data-photo-crop-zoom type="range" min="1" max="4" step="0.01" value="1" />
      </label>
      <div class="modal-card__actions modal-card__actions--end photo-crop-modal__actions">
        <button class="button button--secondary" data-photo-crop-cancel type="button">Cancel</button>
        <button class="button" data-photo-crop-confirm type="button" disabled>Use this crop</button>
      </div>
    </section>
  `;

  return modal;
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not prepare that image."));
        return;
      }

      resolve(blob);
    }, "image/jpeg", quality);
  });
}
