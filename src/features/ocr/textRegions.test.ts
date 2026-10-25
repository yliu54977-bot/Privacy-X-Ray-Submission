import { expect, it } from 'vitest';
import { coveringTextRegions } from './textRegions';

it('covers gaps between OCR glyphs while retaining a small safety margin', () => {
  const boxes = [
    { x: 40, y: 30, width: 16, height: 20 },
    { x: 64, y: 31, width: 16, height: 19 },
    { x: 88, y: 30, width: 16, height: 20 },
  ];
  const original = structuredClone(boxes);
  const regions = coveringTextRegions(boxes, 400, 300);
  expect(regions).toHaveLength(1);
  const region = regions[0]!;
  expect(region.x).toBeCloseTo(37.6);
  expect(region.y).toBeCloseTo(27.6);
  expect(region.x + region.width).toBeCloseTo(106.4);
  expect(region.y + region.height).toBeCloseTo(52.4);
  expect(boxes).toEqual(original);
});

it('keeps wrapped lines and separate columns independently editable', () => {
  const regions = coveringTextRegions([
    { x: 30, y: 30, width: 70, height: 20 },
    { x: 111, y: 30, width: 50, height: 20 },
    { x: 30, y: 65, width: 95, height: 20 },
    { x: 400, y: 30, width: 60, height: 20 },
  ], 600, 200);
  expect(regions).toHaveLength(3);
  expect(regions[0]!.x + regions[0]!.width).toBeLessThan(170);
  expect(regions[1]!.x).toBeGreaterThan(390);
  expect(regions[2]!.y).toBeGreaterThan(60);
});

it('clips padding at every image edge without shrinking real OCR coverage', () => {
  expect(coveringTextRegions([{ x: 0, y: 0, width: 100, height: 50 }], 100, 50))
    .toEqual([{ x: 0, y: 0, width: 100, height: 50 }]);
  const [region] = coveringTextRegions([{ x: 85, y: 35, width: 15, height: 15 }], 100, 50);
  expect(region).toEqual({ x: 83, y: 33, width: 17, height: 17 });
});

it('does not invent locations for missing, nonfinite, or out-of-image boxes', () => {
  expect(coveringTextRegions([], 100, 100)).toEqual([]);
  expect(coveringTextRegions([
    { x: -1, y: 10, width: 20, height: 10 },
    { x: 95, y: 10, width: 20, height: 10 },
    { x: 10, y: NaN, width: 20, height: 10 },
    { x: 10, y: 10, width: 0, height: 10 },
  ], 100, 100)).toEqual([]);
});

it('is independent of OCR word ordering and merges overlapping word readings', () => {
  const boxes = [
    { x: 20, y: 10, width: 80, height: 20 },
    { x: 20, y: 10, width: 30, height: 20 },
    { x: 55, y: 10, width: 45, height: 20 },
    { x: 110, y: 10, width: 30, height: 20 },
  ];
  const regions = coveringTextRegions(boxes, 200, 100);
  expect(regions).toHaveLength(1);
  expect(regions).toEqual(coveringTextRegions([...boxes].reverse(), 200, 100));
});

it('follows gently slanted text without leaving gaps between its later characters', () => {
  const boxes = Array.from({ length: 12 }, (_, i) => ({ x: 40 + i * 25, y: 40 + i * 2, width: 20, height: 24 }));
  const regions = coveringTextRegions(boxes, 800, 200);
  expect(regions).toHaveLength(1);
  expect(regions[0]!.y).toBeLessThan(40);
  expect(regions[0]!.y + regions[0]!.height).toBeGreaterThan(86);
});

it('retains continuous coverage when the same text is rendered at larger source resolution', () => {
  const boxes = [{ x: 100, y: 100, width: 200, height: 100 }, { x: 350, y: 100, width: 200, height: 100 }];
  expect(coveringTextRegions(boxes, 1000, 500)).toHaveLength(1);
});

it('does not split a trailing digit that sorts before the taller middle words', () => {
  const boxes = [
    { x: 90, y: 388, width: 70, height: 32 },
    { x: 180, y: 387, width: 80, height: 42 },
    { x: 278, y: 387, width: 150, height: 42 },
    { x: 442, y: 388, width: 22, height: 31 },
  ];
  const regions = coveringTextRegions(boxes, 1600, 1000);
  expect(regions).toHaveLength(1);
  expect(regions[0]!.x + regions[0]!.width).toBeGreaterThan(464);
});
