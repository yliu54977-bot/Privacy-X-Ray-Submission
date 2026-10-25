import type { LocalImage, PixelRect } from '../../types';
import type { BrowserImagePixelSource } from '../contracts';

const MAX_READ_PIXELS = 4_000_000;

/** Short-lived original-pixel access. OCR-only detectors never receive this object. */
export async function openBrowserImagePixels(image: LocalImage, signal: AbortSignal): Promise<
  BrowserImagePixelSource & { dispose(): void }> {
  if (signal.aborted) throw new Error('Image inspection cancelled.');
  let decoded: HTMLImageElement | null = new Image();
  decoded.src = image.previewUrl;
  try { await decoded.decode(); }
  catch (error) { decoded.src = ''; throw error; }
  if (signal.aborted) { decoded.src = ''; throw new Error('Image inspection cancelled.'); }
  return {
    imageId: image.id, width: image.width, height: image.height,
    async readPixels(rect: PixelRect) {
      if (!decoded || signal.aborted) throw new Error('Image pixels are no longer available.');
      if (![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger) ||
        rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 ||
        rect.x + rect.width > image.width || rect.y + rect.height > image.height ||
        rect.width * rect.height > MAX_READ_PIXELS)
        throw new RangeError('Pixel request exceeds the original image bounds or memory limit.');
      const canvas = document.createElement('canvas');
      canvas.width = rect.width; canvas.height = rect.height;
      try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Local pixel access is unavailable.');
        ctx.drawImage(decoded, rect.x, rect.y, rect.width, rect.height,
          0, 0, rect.width, rect.height);
        return ctx.getImageData(0, 0, rect.width, rect.height);
      } finally { canvas.width = canvas.height = 0; }
    },
    dispose() { if (decoded) decoded.src = ''; decoded = null; },
  };
}
