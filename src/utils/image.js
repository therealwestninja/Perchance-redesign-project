// utils/image.js
//
// Avatar pipeline: validate → decode → square-crop → resize → JPEG data URL.
//
// Split into two functions so the pure validator can be unit-tested in Node
// (no canvas required) while the browser-only resize stays straightforward.

const DEFAULT_ALLOWED_TYPES = Object.freeze([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
]);
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10MB input cap — rejects huge raw files before decode
const DEFAULT_MAX_DIM = 256;                // output square dimension (plenty for 88px display on high-DPI)
const DEFAULT_QUALITY = 0.82;               // JPEG quality — produces ~30-50KB outputs for typical photos

/**
 * Validate a file-like object without touching browser image APIs.
 * Accepts any { type, size } — works with DOM File, Blob, or test mocks.
 *
 * @param {{ type?: string, size?: number } | null | undefined} file
 * @param {{ maxBytes?: number, allowedTypes?: string[] }} [opts]
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function checkImageFile(file, opts = {}) {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowedTypes = opts.allowedTypes ?? DEFAULT_ALLOWED_TYPES;

  if (!file || typeof file !== 'object') {
    return { ok: false, error: 'No file selected.' };
  }
  if (typeof file.type !== 'string' || !allowedTypes.includes(file.type)) {
    return { ok: false, error: 'Please choose a JPEG, PNG, WebP, or GIF image.' };
  }
  if (typeof file.size !== 'number' || file.size <= 0) {
    return { ok: false, error: 'That file appears to be empty.' };
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, error: `That image is too large (limit ${mb}MB).` };
  }
  return { ok: true };
}

/**
 * Read a File as a data URL via FileReader. Browser-only.
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Decode a data URL into an HTMLImageElement. Browser-only.
 */
function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode that image.'));
    img.src = dataUrl;
  });
}

/**
 * Resize a validated image file to a square JPEG data URL.
 * Center-crops to the shorter edge, then scales to the target dimension.
 *
 * Browser-only — uses FileReader, Image, and canvas.
 *
 * @param {File} file
 * @param {{ maxDim?: number, quality?: number }} [opts]
 * @returns {Promise<string>} A "data:image/jpeg;base64,..." URL
 */
export async function resizeImageToDataURL(file, opts = {}) {
  const maxDim = opts.maxDim ?? DEFAULT_MAX_DIM;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  const sourceDataUrl = await readFileAsDataURL(file);
  const img = await loadImage(sourceDataUrl);

  // Center-crop to a square of the shorter edge, then scale to maxDim.
  const srcSize = Math.min(img.width, img.height);
  const srcX = (img.width - srcSize) / 2;
  const srcY = (img.height - srcSize) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = maxDim;
  canvas.height = maxDim;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Extremely rare — some privacy modes / headless environments return null.
    // Better to throw a clear message than let the next line fail with a
    // cryptic "Cannot set properties of null" TypeError.
    throw new Error('Canvas unavailable — cannot process image.');
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, maxDim, maxDim);

  return canvas.toDataURL('image/jpeg', quality);
}

export {
  DEFAULT_ALLOWED_TYPES,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_DIM,
  DEFAULT_QUALITY,
};
