import { describe, expect, it, vi } from 'vitest';
import type { OcrWord, PixelRect } from '../../types';
import type { DetectionInput } from '../contracts';
import { barcodeDetector } from './barcodeDetector';

function fixture(width = 800, height = 350) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  const paint = (box: PixelRect, value = 0, alpha = 255) => {
    for (let y = box.y; y < box.y + box.height; y++) for (let x = box.x; x < box.x + box.width; x++) {
      const at = (y * width + x) * 4;
      pixels[at] = pixels[at + 1] = pixels[at + 2] = value; pixels[at + 3] = alpha;
    }
  };
  const readPixels = vi.fn(async (rect: PixelRect) => {
    expect(rect.width * rect.height).toBeLessThanOrEqual(4_000_000);
    expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    const data = new Uint8ClampedArray(rect.width * rect.height * 4);
    for (let row = 0; row < rect.height; row++) data.set(pixels.subarray(
      ((rect.y + row) * width + rect.x) * 4, ((rect.y + row) * width + rect.x + rect.width) * 4), row * rect.width * 4);
    return { width: rect.width, height: rect.height, data } as ImageData;
  });
  const input: DetectionInput = { imageId: 'fictional-barcode', imageWidth: width, imageHeight: height,
    imagePixels: { imageId: 'fictional-barcode', width, height, readPixels } };
  return { input, paint, readPixels };
}

function bars(paint: ReturnType<typeof fixture>['paint'], x = 60, y = 80, height = 90,
  options: { vertical?: boolean; regular?: boolean; value?: number; alpha?: number; skew?: boolean } = {}) {
  let position = x;
  for (let index = 0; index < 70; index++) {
    const width = options.regular ? 3 : index % 5 === 0 || index % 7 === 0 ? 6 : 3;
    for (let row = 0; row < height; row++) {
      const start = position + (options.skew ? Math.floor(row / 8) : 0);
      paint(options.vertical ? { x: y + row, y: start, width: 1, height: width } :
        { x: start, y: y + row, width, height: 1 }, options.value, options.alpha);
    }
    position += width + (options.regular ? 3 : index % 4 === 0 ? 4 : 2);
  }
  return options.vertical ? { x: y, y: x, width: height, height: position - x - 2 } :
    { x, y, width: position - x - 2, height };
}

function word(text: string, box: PixelRect, id = 'caption', confidence = 0.95): OcrWord {
  return { id, lineId: id, text, box, confidence };
}
function withWords(input: DetectionInput, words: OcrWord[]): DetectionInput {
  return { ...input, ocr: { imageId: input.imageId, width: input.imageWidth, height: input.imageHeight,
    language: 'eng', text: words.map(item => item.text).join('\n'), words } };
}
function covers(outer: PixelRect, inner: PixelRect) {
  expect(outer.x).toBeLessThanOrEqual(inner.x); expect(outer.y).toBeLessThanOrEqual(inner.y);
  expect(outer.x + outer.width).toBeGreaterThanOrEqual(inner.x + inner.width);
  expect(outer.y + outer.height).toBeGreaterThanOrEqual(inner.y + inner.height);
}

describe('browser-local possible barcode regions', () => {
  it.each([false, true])('detects and deduplicates original-pixel stripe geometry (vertical: %s)', async vertical => {
    const image = fixture(vertical ? 350 : 800, vertical ? 800 : 350);
    const expected = bars(image.paint, 60, 80, 90, { vertical });
    const findings = await barcodeDetector.detect(image.input);
    expect(findings).toHaveLength(1);
    covers(findings[0]!.boxes![0]!, expected);
    expect(findings[0]!.boxes).toHaveLength(1);
    expect(findings[0]!.status).toBe('UNKNOWN_POTENTIALLY_SENSITIVE');
    expect(findings[0]!.value).toBeUndefined();
    expect(findings[0]!.typeId).toBeUndefined();
    expect(findings[0]!.uncertaintyReason).toMatch(/not been decoded/);
  });

  it('keeps separate codes and follows mild photographed skew', async () => {
    const image = fixture(1200, 400);
    const left = bars(image.paint, 20, 80, 90, { skew: true });
    const right = bars(image.paint, 650, 240, 80);
    const findings = await barcodeDetector.detect(image.input);
    expect(findings).toHaveLength(2);
    expect(findings.some(finding => finding.boxes![0]!.x < 30)).toBe(true);
    covers(findings.find(finding => finding.boxes![0]!.x < 30)!.boxes![0]!, { ...left, width: left.width + 11 });
    covers(findings.find(finding => finding.boxes![0]!.x > 600)!.boxes![0]!, right);
  });

  it('covers a complete EAN-style symbol including its longer guard bars', async () => {
    const image = fixture();
    const left = ['0001101', '0011001', '0010011', '0111101', '0100011',
      '0110001', '0101111', '0111011', '0110111', '0001011'];
    const right = left.map(pattern => pattern.replace(/[01]/g, bit => bit === '0' ? '1' : '0'));
    const bits = `101${'123456'.split('').map(digit => left[Number(digit)]).join('')}01010${
      '789012'.split('').map(digit => right[Number(digit)]).join('')}101`;
    expect(bits).toHaveLength(95);
    for (let index = 0; index < bits.length; index++) if (bits[index] === '1') {
      const guard = index < 3 || index >= 92 || index >= 45 && index < 50;
      image.paint({ x: 60 + index * 3, y: 80, width: 3, height: guard ? 82 : 72 });
    }
    const findings = await barcodeDetector.detect(image.input);
    expect(findings).toHaveLength(1);
    covers(findings[0]!.boxes![0]!, { x: 60, y: 80, width: 285, height: 82 });
  });

  it.each([false, true])('includes the adjacent numeric caption in original coordinates (vertical: %s)', async vertical => {
    const image = fixture(vertical ? 350 : 800, vertical ? 800 : 350);
    bars(image.paint, 60, 80, 90, { vertical });
    const caption = vertical ? { x: 180, y: 160, width: 20, height: 230 } : { x: 160, y: 180, width: 230, height: 20 };
    const findings = await barcodeDetector.detect(withWords(image.input, [word('20467913582046', caption)]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.boxes).toHaveLength(2);
    covers(findings[0]!.boxes![1]!, caption);
    expect(findings[0]!.evidence.some(evidence => evidence.wordIds?.includes('caption'))).toBe(true);
  });

  it.each([false, true])('includes a printed caption across a 22-pixel gap (vertical: %s)', async vertical => {
    const image = fixture(vertical ? 900 : 1400, vertical ? 1400 : 900);
    let x = 130;
    for (let index = 0; index < 90; index++) {
      const width = index % 7 === 0 || index % 5 === 0 ? 7 : 3;
      image.paint(vertical ? { x: 900 - 610 - 104, y: x, width: 104, height: width } : { x, y: 610, width, height: 104 });
      x += width + (index % 4 === 0 ? 6 : 3);
    }
    // Matches the real browser regression: visible glyph bounds, not CSS font
    // height, leave 22px between the barcode proposal and a 23px-high caption.
    const caption = vertical ? { x: 900 - 760, y: 240, width: 23, height: 249 } :
      { x: 240, y: 737, width: 249, height: 23 };
    const findings = await barcodeDetector.detect(withWords(image.input, [word('20467913582046', caption)]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.boxes).toHaveLength(2);
    const code = findings[0]!.boxes![0]!;
    expect(vertical ? code.x - caption.x - caption.width : caption.y - code.y - code.height).toBe(22);
    covers(findings[0]!.boxes![1]!, caption);
    expect(findings[0]!.evidence.at(-1)?.wordIds).toEqual(['caption']);

    const distant = vertical ? { ...caption, x: caption.x - 11 } : { ...caption, y: 748 };
    const separate = await barcodeDetector.detect(withWords(image.input, [word('20467913582046', distant)]));
    expect(separate).toHaveLength(1);
    expect(separate[0]!.boxes).toHaveLength(1);
  });

  it('does not attach distant, weak, side-by-side or interrupted numeric fields', async () => {
    const image = fixture(); bars(image.paint);
    const words = [word('7654321', { x: 120, y: 245, width: 160, height: 20 }, 'distant'),
      word('12345678', { x: 140, y: 45, width: 180, height: 20 }, 'weak', 0.3),
      word('87654321', { x: 600, y: 180, width: 180, height: 20 }, 'side'),
      word('20467913582046', { x: 160, y: 190, width: 230, height: 24 }, 'interrupted'),
      word('Account', { x: 160, y: 174, width: 85, height: 12 }, 'interruption')];
    const findings = await barcodeDetector.detect(withWords(image.input, words));
    expect(findings).toHaveLength(1); expect(findings[0]!.boxes).toHaveLength(1);
  });

  it('joins a caption split into several OCR words without collecting another number on that line', async () => {
    const image = fixture(); bars(image.paint);
    const words = [word('2046791', { x: 150, y: 180, width: 90, height: 20 }, 'first'),
      { ...word('3582046', { x: 245, y: 180, width: 90, height: 20 }, 'second'), lineId: 'first' }];
    const findings = await barcodeDetector.detect(withWords(image.input, words));
    expect(findings[0]!.boxes).toHaveLength(2);
    expect(findings[0]!.evidence.at(-1)?.wordIds).toEqual(['first', 'second']);
    const unrelated = { ...word('1234567', { x: 650, y: 180, width: 130, height: 20 }, 'unrelated'), lineId: 'first' };
    const extra = await barcodeDetector.detect(withWords(image.input, [...words, unrelated]));
    expect(extra[0]!.boxes).toHaveLength(2);
    expect(extra[0]!.evidence.at(-1)?.wordIds).toEqual(['first', 'second']);
    const splitLines = await barcodeDetector.detect(withWords(image.input, [words[0]!, { ...words[1]!, lineId: 'other-line' }]));
    expect(splitLines[0]!.evidence.at(-1)?.wordIds).toEqual(['first', 'second']);
  });

  it('clips edge padding and rejects malformed OCR boxes', async () => {
    const image = fixture(800, 190); bars(image.paint, 0, 0, 90);
    const caption = { x: 0, y: 95, width: 200, height: 20 };
    const findings = await barcodeDetector.detect(withWords(image.input, [word('1234567890', caption),
      word('7654321', { x: NaN, y: 95, width: 150, height: 20 }, 'invalid'),
      word('7654321', { x: 220, y: 95, width: -1, height: 20 }, 'negative')]));
    expect(findings).toHaveLength(1); expect(findings[0]!.boxes).toHaveLength(2);
    covers(findings[0]!.boxes![1]!, caption);
    expect(findings[0]!.boxes!.every(box => box.x >= 0 && box.y >= 0 && box.x + box.width <= 800 && box.y + box.height <= 190)).toBe(true);
  });

  it.each(['uniform stripes', 'grid', 'text-like fragments', 'transparent stripes', 'blank', 'low contrast'])(
    'rejects %s', async kind => {
      const image = fixture();
      if (kind === 'uniform stripes' || kind === 'grid') {
        bars(image.paint, 60, 80, 90, { regular: true });
        if (kind === 'grid') for (let y = 80; y < 170; y += 10) image.paint({ x: 60, y, width: 420, height: 2 });
      } else if (kind === 'text-like fragments') {
        for (let line = 0; line < 7; line++) for (let letter = 0; letter < 40; letter++) {
          image.paint({ x: 60 + letter * 12 + line % 3, y: 60 + line * 30, width: letter % 5 + 2, height: 10 });
          image.paint({ x: 60 + letter * 12 + line % 3, y: 60 + line * 30 + 10, width: 8, height: 2 });
        }
      } else if (kind === 'transparent stripes') bars(image.paint, 60, 80, 90, { alpha: 0 });
      else if (kind === 'low contrast') { image.paint({ x: 0, y: 0, width: 800, height: 350 }, 195); bars(image.paint, 60, 80, 90, { value: 175 }); }
      expect(await barcodeDetector.detect(image.input)).toHaveLength(0);
    });

  it('clips padding at image edges and finds a barcode crossing bounded read tiles', async () => {
    const image = fixture(2300, 1900);
    const expected = bars(image.paint, 1850, 1810, 90);
    const findings = await barcodeDetector.detect(image.input);
    expect(image.readPixels.mock.calls.length).toBeGreaterThan(1);
    expect(findings).toHaveLength(1); covers(findings[0]!.boxes![0]!, expected);
    expect(findings[0]!.boxes![0]!.y + findings[0]!.boxes![0]!.height).toBe(1900);
  });

  it('does not invent a region when pixel access is missing', async () => {
    expect(await barcodeDetector.detect({ imageId: 'no-pixels', imageWidth: 800, imageHeight: 350 })).toEqual([]);
  });

  it.each([[0, 350], [800, -1], [NaN, 350], [800.5, 350], [4001, 4000]])(
    'rejects invalid dimensions %s by %s before reading pixels', async (width, height) => {
      const image = fixture();
      await expect(barcodeDetector.detect({ ...image.input, imageWidth: width, imageHeight: height })).rejects.toThrow(RangeError);
      expect(image.readPixels).not.toHaveBeenCalled();
    });

  it('propagates invalid pixel results and cancellation rather than reporting complete inspection', async () => {
    const image = fixture();
    image.readPixels.mockResolvedValueOnce({ width: 1, height: 1, data: new Uint8ClampedArray(4) } as ImageData);
    await expect(barcodeDetector.detect(image.input)).rejects.toThrow(/invalid dimensions/);
    image.readPixels.mockRejectedValueOnce(new Error('Cancelled image session'));
    await expect(barcodeDetector.detect(image.input)).rejects.toThrow(/Cancelled image session/);
  });
});
