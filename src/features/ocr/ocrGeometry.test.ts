import { describe, expect, it } from 'vitest';
import { ocrCanvasSize, originalPixelBox } from './ocrGeometry';

describe('OCR scaling and original-image coordinates', () => {
  it('enlarges small screenshots but leaves current demo size unchanged', () => {
    expect(ocrCanvasSize(600, 400)).toEqual({ width: 1200, height: 800 });
    expect(ocrCanvasSize(1200, 850)).toEqual({ width: 1200, height: 850 });
  });

  it('maps scaled boxes back to the original image and clips edge noise', () => {
    expect(originalPixelBox({ x0: 20, y0: 40, x1: 220, y1: 80 },
      600, 400, 1200, 800)).toEqual({ x: 10, y: 20, width: 100, height: 20 });
    expect(originalPixelBox({ x0: -4, y0: 0, x1: 40, y1: 20 },
      600, 400, 1200, 800)).toEqual({ x: 0, y: 0, width: 20, height: 10 });
    expect(originalPixelBox({ x0: 100, y0: 10, x1: 100, y1: 30 },
      600, 400, 1200, 800)).toBeNull();
  });
});

describe('orientation recovery coordinates', () => {
  it('maps an upside-down OCR box back without swapping the image axes', async () => {
    const { uprightOcrBox } = await import('./ocrGeometry');
    const box = uprightOcrBox({ x0: 20, y0: 40, x1: 120, y1: 80 }, 600, 400, 'upsideDown');
    expect(box).toEqual({ x0: 480, y0: 320, x1: 580, y1: 360 });
    expect(originalPixelBox(box, 1200, 800, 600, 400)).toEqual({ x: 960, y: 640, width: 200, height: 80 });
  });
  it('maps quarter-turn boxes using the rotated surface dimensions', async () => {
    const { uprightOcrBox } = await import('./ocrGeometry');
    expect(uprightOcrBox({ x0: 20, y0: 40, x1: 120, y1: 80 }, 400, 600, 'clockwise'))
      .toEqual({ x0: 40, y0: 280, x1: 80, y1: 380 });
    expect(uprightOcrBox({ x0: 20, y0: 40, x1: 120, y1: 80 }, 400, 600, 'counterclockwise'))
      .toEqual({ x0: 520, y0: 20, x1: 560, y1: 120 });
  });
});
