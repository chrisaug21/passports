// HEIC/HEIF (the default iPhone photo format) can't be decoded into an <img>
// or canvas by Firefox/Chrome, which breaks the crop step. Safari can, so we
// feature-detect instead of sniffing the browser: only when a HEIC file
// genuinely can't be decoded do we download the (~1.3MB) heic2any library and
// convert it to a JPEG first. Everyone else never pays for that download.
const HEIC_SCRIPT_URL = "/src/lib/vendor/heic2any.min.js";
const HEIC_CONVERT_QUALITY = 0.9;

let heicScriptPromise = null;

export function looksLikeHeic(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  return type === "image/heic"
    || type === "image/heif"
    || name.endsWith(".heic")
    || name.endsWith(".heif");
}

// Returns the file itself when the browser can already decode it, otherwise a
// JPEG Blob converted from it. Throws if conversion isn't possible.
export async function ensureBrowserDecodableImage(file) {
  if (!looksLikeHeic(file) || await canBrowserDecode(file)) {
    return file;
  }

  await loadHeicLibrary();
  const converted = await window.heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: HEIC_CONVERT_QUALITY,
  });
  // A multi-image HEIC comes back as an array; the first is the primary photo.
  const jpeg = Array.isArray(converted) ? converted[0] : converted;

  if (!jpeg) {
    throw new Error("Could not convert that HEIC photo.");
  }

  return jpeg;
}

async function canBrowserDecode(file) {
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close?.();
    return true;
  } catch {
    return false;
  }
}

function loadHeicLibrary() {
  if (window.heic2any) {
    return Promise.resolve();
  }

  if (!heicScriptPromise) {
    heicScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = HEIC_SCRIPT_URL;
      script.async = true;
      script.addEventListener("load", () => {
        if (window.heic2any) {
          resolve();
          return;
        }
        script.remove();
        reject(new Error("HEIC converter loaded but is unavailable."));
      }, { once: true });
      script.addEventListener("error", () => {
        script.remove();
        reject(new Error("Could not download the HEIC converter."));
      }, { once: true });
      document.head.append(script);
    }).catch((error) => {
      // Forget the failure (offline, blip) so the next upload attempt retries
      // instead of replaying a cached rejection forever.
      heicScriptPromise = null;
      throw error;
    });
  }

  return heicScriptPromise;
}
