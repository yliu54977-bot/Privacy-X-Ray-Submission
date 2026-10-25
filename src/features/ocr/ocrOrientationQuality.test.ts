import { expect, it } from 'vitest';
import type { OcrWord } from '../../types';
import { hasSidewaysText, orientationQuality } from './ocrOrientationQuality';
const vertical: OcrWord[] = ['UNIVERSITY', 'Morgan', '7654321'].map((text, i) => ({ id: `w${i}`, lineId: `l${i}`,
  text, confidence: .96, box: { x: 200 + i * 70, y: 100, width: 24, height: 160 } }));
it('recovers high-confidence sideways Latin text instead of trusting confidence alone', () => {
  expect(hasSidewaysText(vertical)).toBe(true);
  expect(orientationQuality(vertical, 700, 1000, 'counterclockwise')).toBeGreaterThan(orientationQuality(vertical, 700, 1000) * 4);
});
it('does not turn ordinary text, a vertical sidebar, or single Chinese glyphs into an orientation claim', () => {
  const horizontal = vertical.map(word => ({ ...word, box: { ...word.box, width: 160, height: 24 } }));
  expect(hasSidewaysText(horizontal)).toBe(false);
  expect(hasSidewaysText([...horizontal, vertical[0]!])).toBe(false);
  expect(hasSidewaysText(vertical.map(word => ({ ...word, text: '学' })))).toBe(false);
  expect(hasSidewaysText(vertical.map(word => ({ ...word, confidence: .2 })))).toBe(false);
});
