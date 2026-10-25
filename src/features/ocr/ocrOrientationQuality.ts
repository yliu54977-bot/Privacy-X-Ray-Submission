import type { OcrWord } from '../../types';
import type { OcrRotation } from './ocrGeometry';
import { layoutBox } from './ocrOrientation';

const weight = (word: OcrWord) => word.confidence >= 0.55 && /[\p{L}\p{N}]/u.test(word.text)
  ? Math.min(20, word.text.length) * word.confidence : 0;
const isLongHorizontalScript = (text: string) => /^[\p{Script=Latin}\d@._/+:-]{4,}$/u.test(text);

/** AUTO can read sideways text confidently while retaining sideways locations. */
export function hasSidewaysText(words: readonly OcrWord[]): boolean {
  const eligible = words.filter(word => isLongHorizontalScript(word.text) && weight(word) > 0);
  const vertical = eligible.filter(word => word.box.height > word.box.width * 1.25);
  const total = eligible.reduce((sum, word) => sum + weight(word), 0);
  return vertical.length >= 2 && vertical.reduce((sum, word) => sum + weight(word), 0) >= total * 0.35;
}

/** Score recognition in the candidate's reading orientation, not the source axes. */
export function orientationQuality(words: readonly OcrWord[], width: number, height: number,
  rotation: OcrRotation = 'none'): number {
  return words.reduce((sum, word) => {
    const box = layoutBox(word.box, width, height, rotation);
    const sideways = isLongHorizontalScript(word.text) && box.height > box.width * 1.25;
    return sum + weight(word) * (sideways ? 0.2 : 1);
  }, 0);
}
