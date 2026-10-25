import type { LocalImage, OcrResult } from '../../types';
import { scanImage } from '../ocr/scanImage';

/** Same-origin models, in-memory OCR. Context/policy is intentionally not an input. */
export function scanContent(image: LocalImage, progress: (value: number) => void,
  signal: AbortSignal): Promise<OcrResult> {
  return scanImage(image, progress, signal, { mixedChineseEnglish: true, enhanceLowContrast: true,
    upscaleSmallText: true, adaptiveRescan: true, detailRescan: true, generalContent: true });
}
