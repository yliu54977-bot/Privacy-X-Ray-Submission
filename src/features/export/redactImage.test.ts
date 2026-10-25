import { describe, expect, it } from 'vitest';
import type { LocalImage, RedactionRect } from '../../types';
import { prepareRedactions } from './redactImage';
const image = { id: 'image', width: 100, height: 80 } as LocalImage;
const rect: RedactionRect = { id: 'mask', imageId: 'image', source: 'manual', shouldRedact: true, x: 10.2, y: 20.9, width: 0.2, height: 1.2 };
describe('export validation and pixel coverage', () => {
  it('rounds outward without mutating input', () => {
    expect(prepareRedactions(image, [Object.freeze(rect)])).toEqual([{ x: 10, y: 20, width: 1, height: 3 }]);
    expect(rect.x).toBe(10.2);
  });
  it('clips edges and skips wholly external/inactive masks', () => {
    expect(prepareRedactions(image, [{ ...rect, x: -2.5, y: 79.2, width: 105, height: 10 },
      { ...rect, id: 'outside', x: -0.8, width: 0.2 }, { ...rect, id: 'disabled', shouldRedact: false }])).toEqual([{ x: 0, y: 79, width: 100, height: 1 }]);
  });
  it.each([NaN, Infinity, -Infinity, 0, -1])('rejects invalid width %s rather than partial output', (width) => {
    expect(() => prepareRedactions(image, [rect, { ...rect, id: 'bad', width }])).toThrow();
  });
  it('rejects overflow endpoints even in inactive masks', () => {
    expect(() => prepareRedactions(image, [{ ...rect, x: Number.MAX_VALUE, width: Number.MAX_VALUE, shouldRedact: false }])).toThrow();
  });
  it('rejects stale image IDs and duplicate IDs', () => {
    expect(() => prepareRedactions(image, [{ ...rect, imageId: 'old' }])).toThrow();
    expect(() => prepareRedactions(image, [rect, rect])).toThrow();
  });
  it.each([[0, 80], [1.5, 80], [4001, 4000], [Infinity, 1]])('rejects unsafe dimensions %s × %s', (width, height) => {
    expect(() => prepareRedactions({ ...image, width, height }, [])).toThrow();
  });
  it('accepts no masks and the pixel limit', () => {
    expect(prepareRedactions({ ...image, width: 4000, height: 4000 }, [])).toEqual([]);
  });
});
