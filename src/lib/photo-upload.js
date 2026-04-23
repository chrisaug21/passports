const MAX_IMAGE_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

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

export async function openPhotoCropModal(file, { aspectRatio = 16 / 9 } = {}) {
  const resizedImage = await resizeImageForUpload(file);
  const imageUrl = URL.createObjectURL(resizedImage.blob);

  return new Promise((resolve, reject) => {
    const cropState = {
      imageUrl,
      imageWidth: resizedImage.width,
      imageHeight: resizedImage.height,
      aspectRatio,
      offsetX: 0,
      offsetY: 0,
      zoom: 1,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      dragStartOffsetX: 0,
      dragStartOffsetY: 0,
    };
    const modal = renderCropModal();
    const image = modal.querySelector("[data-photo-crop-image]");
    const stage = modal.querySelector("[data-photo-crop-stage]");
    const cropFrame = modal.querySelector("[data-photo-crop-frame]");
    const zoomInput = modal.querySelector("[data-photo-crop-zoom]");
    const hadModalOpen = document.body.classList.contains("modal-open");

    if (!image || !stage || !cropFrame || !zoomInput) {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("Could not open the photo cropper."));
      return;
    }

    const cleanup = () => {
      URL.revokeObjectURL(imageUrl);
      modal.remove();
      document.body.classList.toggle("modal-open", hadModalOpen);
      window.removeEventListener("resize", syncCropLayout);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    const finish = (value) => {
      cleanup();
      resolve(value);
    };

    const fail = (error) => {
      cleanup();
      reject(error);
    };

    const updateImageTransform = () => {
      image.style.width = `${cropState.imageWidth * cropState.zoom}px`;
      image.style.height = `${cropState.imageHeight * cropState.zoom}px`;
      image.style.transform = `translate(${cropState.offsetX}px, ${cropState.offsetY}px)`;
    };

    const clampOffsets = () => {
      const frameRect = cropFrame.getBoundingClientRect();
      const scaledWidth = cropState.imageWidth * cropState.zoom;
      const scaledHeight = cropState.imageHeight * cropState.zoom;
      const minX = frameRect.width - scaledWidth;
      const minY = frameRect.height - scaledHeight;

      cropState.offsetX = Math.min(0, Math.max(minX, cropState.offsetX));
      cropState.offsetY = Math.min(0, Math.max(minY, cropState.offsetY));
    };

    function syncCropLayout() {
      const stageRect = stage.getBoundingClientRect();
      const maxWidth = Math.max(1, stageRect.width);
      const maxHeight = Math.max(1, stageRect.height);
      const frameWidth = Math.min(maxWidth, maxHeight * aspectRatio);
      const frameHeight = frameWidth / aspectRatio;
      const minZoom = Math.max(frameWidth / cropState.imageWidth, frameHeight / cropState.imageHeight, MIN_ZOOM);

      cropFrame.style.width = `${frameWidth}px`;
      cropFrame.style.height = `${frameHeight}px`;
      zoomInput.min = String(minZoom);
      zoomInput.max = String(Math.max(MAX_ZOOM, minZoom));

      if (cropState.zoom < minZoom) {
        cropState.zoom = minZoom;
        zoomInput.value = String(minZoom);
      }

      if (cropState.offsetX === 0 && cropState.offsetY === 0) {
        cropState.offsetX = (frameWidth - cropState.imageWidth * cropState.zoom) / 2;
        cropState.offsetY = (frameHeight - cropState.imageHeight * cropState.zoom) / 2;
      }

      clampOffsets();
      updateImageTransform();
    }

    function handlePointerMove(event) {
      if (!cropState.isDragging) {
        return;
      }

      cropState.offsetX = cropState.dragStartOffsetX + event.clientX - cropState.dragStartX;
      cropState.offsetY = cropState.dragStartOffsetY + event.clientY - cropState.dragStartY;
      clampOffsets();
      updateImageTransform();
    }

    function handlePointerUp() {
      cropState.isDragging = false;
      cropFrame.classList.remove("is-dragging");
    }

    image.src = imageUrl;
    document.body.append(modal);
    document.body.classList.add("modal-open");
    window.lucide?.createIcons?.();
    requestAnimationFrame(syncCropLayout);

    window.addEventListener("resize", syncCropLayout);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    cropFrame.addEventListener("pointerdown", (event) => {
      cropState.isDragging = true;
      cropState.dragStartX = event.clientX;
      cropState.dragStartY = event.clientY;
      cropState.dragStartOffsetX = cropState.offsetX;
      cropState.dragStartOffsetY = cropState.offsetY;
      cropFrame.classList.add("is-dragging");
      cropFrame.setPointerCapture?.(event.pointerId);
    });

    zoomInput.addEventListener("input", () => {
      const frameRect = cropFrame.getBoundingClientRect();
      const previousZoom = cropState.zoom;
      const nextZoom = Number(zoomInput.value);
      const centerX = frameRect.width / 2;
      const centerY = frameRect.height / 2;
      const imageCenterX = (centerX - cropState.offsetX) / previousZoom;
      const imageCenterY = (centerY - cropState.offsetY) / previousZoom;

      cropState.zoom = Number.isFinite(nextZoom) ? nextZoom : previousZoom;
      cropState.offsetX = centerX - imageCenterX * cropState.zoom;
      cropState.offsetY = centerY - imageCenterY * cropState.zoom;
      clampOffsets();
      updateImageTransform();
    });

    modal.querySelectorAll("[data-photo-crop-cancel]").forEach((button) => {
      button.addEventListener("click", () => {
        finish(null);
      });
    });

    modal.querySelector("[data-photo-crop-confirm]")?.addEventListener("click", async () => {
      try {
        const croppedBlob = await cropImageBlob(cropState, cropFrame);
        finish(croppedBlob);
      } catch (error) {
        fail(error);
      }
    });
  });
}

async function cropImageBlob(cropState, cropFrame) {
  const frameRect = cropFrame.getBoundingClientRect();
  const outputWidth = Math.min(cropState.imageWidth, Math.round(frameRect.width / cropState.zoom));
  const outputHeight = Math.round(outputWidth / cropState.aspectRatio);
  const sourceX = Math.max(0, Math.round(-cropState.offsetX / cropState.zoom));
  const sourceY = Math.max(0, Math.round(-cropState.offsetY / cropState.zoom));
  const sourceWidth = Math.min(cropState.imageWidth - sourceX, Math.round(frameRect.width / cropState.zoom));
  const sourceHeight = Math.min(cropState.imageHeight - sourceY, Math.round(frameRect.height / cropState.zoom));
  const image = await loadImageFromUrl(cropState.imageUrl);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not crop that image.");
  }

  canvas.width = outputWidth;
  canvas.height = outputHeight;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);

  return canvasToJpegBlob(canvas);
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
        <div class="photo-crop-modal__frame" data-photo-crop-frame>
          <img class="photo-crop-modal__image" data-photo-crop-image alt="" draggable="false" />
        </div>
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
