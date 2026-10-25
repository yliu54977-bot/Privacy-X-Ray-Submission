import type { PixelRect } from '../../types';

/** Small text can benefit from 2× OCR input; the original image is never changed. */
export function ocrCanvasSize(width: number, height: number): { width: number; height: number } {
  const factor = Math.max(width, height) <= 900 ? 2 : 1;
  return { width: width * factor, height: height * factor };
}

/** Tesseract boxes belong to the OCR canvas; findings belong to the original image. */
export function originalPixelBox(
  box: { x0: number; y0: number; x1: number; y1: number },
  originalWidth: number, originalHeight: number,
  canvasWidth: number, canvasHeight: number,
): PixelRect | null {
  const x0 = Math.max(0, Math.min(originalWidth, box.x0 * originalWidth / canvasWidth));
  const y0 = Math.max(0, Math.min(originalHeight, box.y0 * originalHeight / canvasHeight));
  const x1 = Math.max(0, Math.min(originalWidth, box.x1 * originalWidth / canvasWidth));
  const y1 = Math.max(0, Math.min(originalHeight, box.y1 * originalHeight / canvasHeight));
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export type OcrRotation = 'none' | 'clockwise' | 'counterclockwise' | 'upsideDown';
export function uprightOcrBox(box: { x0: number; y0: number; x1: number; y1: number }, width: number, height: number, rotation: OcrRotation) {
  if (rotation === 'clockwise') return { x0: box.y0, y0: width - box.x1, x1: box.y1, y1: width - box.x0 };
  if (rotation === 'counterclockwise') return { x0: height - box.y1, y0: box.x0, x1: height - box.y0, y1: box.x1 };
  if (rotation === 'upsideDown') return { x0: width - box.x1, y0: height - box.y1, x1: width - box.x0, y1: height - box.y0 };
  return box;
}
