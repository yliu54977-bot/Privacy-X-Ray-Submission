import { describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ detect: vi.fn(() => ({ detections: [{ boundingBox: { originX: 30, originY: 40, width: 100, height: 100 }, categories: [{ score: 0.9 }] }] })) }));
vi.mock('@mediapipe/tasks-vision', () => ({ FaceDetector: { createFromOptions: vi.fn(async () => calls) }, FilesetResolver: { forVisionTasks: vi.fn(async () => ({})) } }));
import { expandedFaceBox, localFaceDetector, faceTiles, unrotateFaceBox, scaleFaceBox } from './faceDetector';

describe('local face region geometry', () => {
  it('pads real regions within original image bounds without inventing invalid boxes', () => {
    expect(expandedFaceBox({ originX: 0, originY: 0, width: 100, height: 100 }, 0, 0, 200, 150)).toEqual({ x: 0, y: 0, width: 118, height: 118 });
    expect(expandedFaceBox({ originX: 0, originY: 0, width: -1, height: 100 }, 0, 0, 200, 150)).toBeNull();
    expect(expandedFaceBox({ originX: NaN, originY: 0, width: 20, height: 20 }, 0, 0, 200, 150)).toBeNull();
  });
  it('reads bounded tiles, returns uncertain regions and never asserts identities', async () => {
    vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
    vi.stubGlobal('location', { origin: 'http://localhost' });
    const readPixels = vi.fn(async (rect: { width: number; height: number }) => ({ width: rect.width, height: rect.height, data: new Uint8ClampedArray(rect.width * rect.height * 4) }) as ImageData);
    const result = await localFaceDetector.detect({ imageId: 'fixture', imageWidth: 1600, imageHeight: 1200,
      imagePixels: { imageId: 'fixture', width: 1600, height: 1200, readPixels } });
    expect(readPixels.mock.calls.length).toBeGreaterThan(4);
    expect(readPixels.mock.calls.every(([box]) => box.width * box.height <= 4_000_000)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(f => !f.typeId && !f.value && f.status === 'UNKNOWN_POTENTIALLY_SENSITIVE')).toBe(true);
    expect(result.every(f => f.boxes?.every(b => b.x >= 0 && b.y >= 0 && b.x + b.width <= 1600 && b.y + b.height <= 1200))).toBe(true);
    vi.unstubAllGlobals();
  });
});

it('bounds spatially distributed passes on large images', () => {
  const tiles = faceTiles(4000,4000); expect(tiles.length).toBeLessThanOrEqual(192);
  expect(tiles.some(t => t.x + t.width === 4000 && t.y + t.height === 4000)).toBe(true);
});
it('maps rotated model boxes to original pixels', () => {
  expect(unrotateFaceBox({ originX: 20, originY: 30, width: 40, height: 50 }, 1, 200, 100))
    .toEqual({ originX: 30, originY: 40, width: 50, height: 40 });
  expect(unrotateFaceBox({ originX: 20, originY: 30, width: 40, height: 50 }, 3, 200, 100))
    .toEqual({ originX: 120, originY: 20, width: 50, height: 40 });
});
it('keeps extreme panoramic planning bounded and includes the far edge', () => {
  const tiles = faceTiles(16, 1_000_000);
  expect(tiles).toHaveLength(192);
  expect(tiles.some(tile => tile.y + tile.height === 1_000_000)).toBe(true);
});

it('maps a downsampled overview back to original image pixels', () => {
  expect(scaleFaceBox({ originX: 100, originY: 200, width: 80, height: 100 }, 2.5, 2.5))
    .toEqual({ originX: 250, originY: 500, width: 200, height: 250 });
});
it('does not return a tile proposal that fails higher-confidence crop confirmation', async () => {
  vi.stubGlobal('ImageData', class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
  vi.stubGlobal('location', { origin: 'http://localhost' });
  calls.detect.mockImplementation(() => ({ detections: [{ boundingBox: { originX: 30, originY: 40, width: 100, height: 100 }, categories: [{ score: 0.7 }] }] }));
  try {
    const result = await localFaceDetector.detect({ imageId: 'weak', imageWidth: 256, imageHeight: 256,
      imagePixels: { imageId: 'weak', width: 256, height: 256, readPixels: async rect =>
        new ImageData(new Uint8ClampedArray(rect.width * rect.height * 4), rect.width, rect.height) } });
    expect(result).toHaveLength(0);
  } finally {
    calls.detect.mockImplementation(() => ({ detections: [{ boundingBox: { originX: 30, originY: 40, width: 100, height: 100 }, categories: [{ score: 0.9 }] }] }));
    vi.unstubAllGlobals();
  }
});

it('deduplicates repeated face boxes while retaining an overlapping nearby face', async () => {
  const { sameFaceRegion } = await import('./faceDetector');
  const first = { x: 0, y: 0, width: 100, height: 100 };
  expect(sameFaceRegion(first, { x: 5, y: 5, width: 100, height: 100 })).toBe(true);
  expect(sameFaceRegion(first, { x: 40, y: 0, width: 100, height: 100 })).toBe(false);
});
