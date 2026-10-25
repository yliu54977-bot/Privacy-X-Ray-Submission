import type { LocalImage, OcrResult } from '../../types';
import { scanImage } from '../../features/ocr/scanImage';

/** Browser-local v2 profile; v1 scan behavior remains unchanged. */
export function scanImageV2(image: LocalImage, onProgress: (progress: number) => void,
  signal: AbortSignal): Promise<OcrResult> {
  return scanImage(image, onProgress, signal, {
    mixedChineseEnglish: true, enhanceLowContrast: true, upscaleSmallText: true,
    adaptiveRescan: true, detailRescan: true,
  });
}
