import type { OcrWord } from '../../types';

/** Confidence alone cannot detect sideways glyphs read as confident single letters.
 * CJK characters and punctuation are excluded: single-character tokens are normal there.
 * This is a retry signal, never a sensitive-information classification. */
export function fragmentedLatinText(words: readonly OcrWord[]): boolean {
  const latin = words.filter(word => /[a-z]/i.test(word.text) && !/[\u3400-\u9fff]/u.test(word.text));
  return latin.length >= 6 && latin.filter(word => (word.text.match(/[a-z]/gi) ?? []).length === 1).length / latin.length > .55;
}

/** Repeated digit groups are vulnerable to collapsed glyphs (for example four
 * identical digits read as three). Request one alternative segmentation pass;
 * never insert digits, validate an account, or classify the number here. */
export function repeatedDigitGroups(words: readonly Pick<OcrWord, 'text' | 'lineId'>[]): boolean {
  const byLine = new Map<string, number>();
  for (const word of words) if (/^\d{3,}$/.test(word.text) && /(\d)\1{2}/.test(word.text))
    byLine.set(word.lineId,(byLine.get(word.lineId)??0)+1);
  return [...byLine.values()].some(count=>count>=2);
}
