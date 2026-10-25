import { expect, it } from 'vitest';
import { fragmentedLatinText, repeatedDigitGroups } from './recognitionQuality';
import type { OcrWord } from '../../types';
const words = (text: string): OcrWord[] => text.split(' ').map((text, i) => ({ id: `${i}`, lineId: 'line', text, confidence: .95,
  box: { x: i * 20, y: 0, width: 15, height: 20 } }));
it('retries confident fragmented Latin text without using document labels', () => {
  expect(fragmentedLatinText(words('C o m m u n i ty w o r k'))).toBe(true);
});
it('does not treat ordinary Chinese, punctuation, numeric tables or normal prose as fragmentation', () => {
  for (const text of ['会 议 安 排 明 天 上 午', '1 2 3 4 5 6', '! ? . , : ;', 'A walk in the garden with I and you'])
    expect(fragmentedLatinText(words(text))).toBe(false);
});

it('requests a segmentation check for repeated digit groups without rewriting digits or classifying a field',()=>{
  expect(repeatedDigitGroups(words('4111 111 111 111'))).toBe(true);
  expect(repeatedDigitGroups(words('2026 1017 286 93'))).toBe(false);
  expect(repeatedDigitGroups(words('111 example text'))).toBe(false);
});
