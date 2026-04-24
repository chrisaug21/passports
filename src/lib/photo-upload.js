const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;
export const DEFAULT_PHOTO_ASPECT_RATIO = 3 / 2;

export function selectImageFile() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let isResolved = false;
    const cleanup = () => {
      window.removeEventListener("focus", handleWindowFocus);
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
    const handleWindowFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) {
          finish(null);
        }
      }, 250);
    };

    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    input.addEventListener("change", () => {
      finish(input.files?.[0] || null);
    }, { once: true });
    window.addEventListener("focus", handleWindowFocus);
    document.body.append(input);
    input.click();
  });
}

export async function resizeImageForUpload(file) {
  const image = await loadImageFromFile(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not prepare that image.");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  return {
    blob: await canvasToJpegBlob(canvas),
    width,
    height,
  };
}

export async function openPhotoCropModal(file, { aspectRatio = DEFAULT_PHOTO_ASPECT_RATIO } = {}) {
  const resizedImage = await resizeImageForUpload(file);
  const imageUrl = URL.createObjectURL(resizedImage.blob);

  return openCropperModal({
    imageUrl,
    aspectRatio,
    cleanup: () => {
      URL.revokeObjectURL(imageUrl);
    },
  });
}

export function openPhotoCropModalFromUrl(imageUrl, { aspectRatio = DEFAULT_PHOTO_ASPECT_RATIO } = {}) {
  return openCropperModal({
    imageUrl,
    aspectRatio,
  });
}

function openCropperModal({ imageUrl, aspectRatio, cleanup = () => {} }) {
  return new Promise((resolve, reject) => {
    const CropperClass = window.Cropper;
    const modal = renderCropModal();
    const image = modal.querySelector("[data-photo-crop-image]");
    const zoomInput = modal.querySelector("[data-photo-crop-zoom]");
    const hadModalOpen = document.body.classList.contains("modal-open");
    let cropper = null;
    let minZoom = 0.01;
    let maxZoom = 3;
    let isSyncingZoom = false;

    if (!CropperClass || !image || !zoomInput) {
      cleanup();
      reject(new Error("Could not open the photo cropper."));
      return;
    }

    const teardown = () => {
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

    image.crossOrigin = "anonymous";
    image.src = imageUrl;
    document.body.append(modal);
    document.body.classList.add("modal-open");

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
        syncZoomInput();
        window.requestAnimationFrame(syncZoomInput);
      },
      zoom() {
        syncZoomInput();
      },
    });

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
        const canvas = cropper?.getCroppedCanvas({
          fillColor: "#ffffff",
        });

        if (!canvas) {
          throw new Error("Could not crop that image.");
        }

        finish(await canvasToJpegBlob(canvas));
      } catch (error) {
        fail(error);
      }
    });
  });
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
      </div>
      <label class="field photo-crop-modal__zoom">
        <span>Zoom</span>
        <input data-photo-crop-zoom type="range" min="1" max="4" step="0.01" value="1" />
      </label>
      <div class="modal-card__actions modal-card__actions--end">
        <button class="button button--secondary" data-photo-crop-cancel type="button">Cancel</button>
        <button class="button" data-photo-crop-confirm type="button">Use this crop</button>
      </div>
    </section>
  `;

  return modal;
}

function loadImageFromFile(file) {
  const imageUrl = URL.createObjectURL(file);
  return loadImageFromUrl(imageUrl).finally(() => {
    URL.revokeObjectURL(imageUrl);
  });
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(String(url || ""))) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load that image."));
    image.src = url;
  });
}

function canvasToJpegBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not prepare that image."));
        return;
      }

      resolve(blob);
    }, "image/jpeg", JPEG_QUALITY);
  });
}
