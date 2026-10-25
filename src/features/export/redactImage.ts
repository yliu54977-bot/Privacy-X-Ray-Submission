import type { LocalImage, PixelRect, RedactImage, RedactionRect } from '../../types';
import { MAX_FILE_BYTES, validateDimensions } from '../image/loadImage';

/** Validate all regions before decoding. Outward rounding fully covers fractional edge pixels. */
export function prepareRedactions(image: LocalImage, rectangles: readonly RedactionRect[]): readonly PixelRect[] {
  validateDimensions(image.width, image.height);
  if (!image.id) throw new Error('The image must have an identity.');
  const ids = new Set<string>();
  const result: PixelRect[] = [];
  for (const rect of rectangles) {
    const right = rect.x + rect.width, bottom = rect.y + rect.height;
    if (!rect.id || ids.has(rect.id) || rect.imageId !== image.id ||
        typeof rect.shouldRedact !== 'boolean' ||
        ![rect.x, rect.y, rect.width, rect.height, right, bottom].every(Number.isFinite) ||
        rect.width <= 0 || rect.height <= 0) {
      throw new Error('A redaction has an invalid identity or geometry. Review your masks.');
    }
    ids.add(rect.id);
    // Check actual intersection before rounding: a wholly external box masks nothing.
    if (!rect.shouldRedact || right <= 0 || bottom <= 0 || rect.x >= image.width || rect.y >= image.height) continue;
    const x = Math.max(0, Math.floor(rect.x)), y = Math.max(0, Math.floor(rect.y));
    const endX = Math.min(image.width, Math.ceil(right)), endY = Math.min(image.height, Math.ceil(bottom));
    result.push({ x, y, width: endX - x, height: endY - y });
  }
  return result;
}

/** Only local File pixels enter a fresh Canvas; no editor layers or source metadata are copied. */
export const redactImage: RedactImage = async (image, rectangles) => {
  const masks = prepareRedactions(image, rectangles);
  if (!(image.file instanceof File) || image.file.size === 0 || image.file.size > MAX_FILE_BYTES ||
      !['image/png', 'image/jpeg'].includes(image.mimeType) || image.file.type !== image.mimeType) {
    throw new Error('Choose a valid local PNG or JPG before exporting.');
  }
  const url = URL.createObjectURL(image.file);
  const source = new Image();
  let canvas: HTMLCanvasElement | undefined;
  try {
    source.src = url;
    await source.decode(); // Same browser orientation handling as A's image loader.
    if (source.naturalWidth !== image.width || source.naturalHeight !== image.height) {
      throw new Error('The decoded image dimensions changed. Choose the image again.');
    }
    canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not create an image canvas.');
    ctx.drawImage(source, 0, 0);
    ctx.resetTransform();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000000';
    for (const rect of masks) ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas!.toBlob((blob) => {
        if (!blob || blob.size === 0 || blob.type !== 'image/png') reject(new Error('PNG encoding failed. Please try again.'));
        else resolve(blob);
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url); // Never revoke A's preview URL.
    source.src = '';
    if (canvas) canvas.width = canvas.height = 0;
  }
};
