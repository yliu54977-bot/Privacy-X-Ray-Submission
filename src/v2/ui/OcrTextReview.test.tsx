// @vitest-environment jsdom
import { rememberOcrOrientation, originalLayoutBox } from '../../features/ocr/ocrOrientation';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OcrTextReview } from './OcrTextReview';
import type { OcrResult, RedactionRect } from '../../types';
import type { UniversalFinding } from '../contracts';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const ocr: OcrResult = { imageId: 'fixture', width: 1000, height: 600, language: 'eng', text: 'Fictional text',
  words: Array.from({ length: 12 }, (_, i) => ({ id: `w-${i}`, lineId: `l-${i}`, text: `Fictional-${i}`,
    confidence: i === 0 ? 0.4 : 0.9, box: { x: 20, y: 20 + i * 30, width: 100, height: 20 } })) };
it('pages unassigned words and emits their actual original-pixel boxes', () => {
  const onMask = vi.fn();
  act(() => root.render(<OcrTextReview ocr={ocr} findings={[]} masks={[]} onMask={onMask} />));
  expect(host.querySelector('details')?.open).toBe(true);
  expect(host.querySelectorAll('article')).toHaveLength(8);
  expect(host.textContent).toContain('Text may be misread');
  act(() => host.querySelector<HTMLButtonElement>('article button')!.click());
  const [region] = onMask.mock.calls[0]![0];
  expect(region.x).toBeCloseTo(17.6);
  expect(region.y).toBeCloseTo(17.6);
  expect(region.x + region.width).toBeCloseTo(122.4);
  expect(region.y + region.height).toBeCloseTo(42.4);
  const next = [...host.querySelectorAll('button')].find(b => b.textContent === 'Next text')!;
  act(() => next.click());
  expect(host.querySelectorAll('article')).toHaveLength(4);
});
it('excludes classified or invalid words and disables already covered text', () => {
  const finding = { evidence: [{ wordIds: ['w-0'] }] } as unknown as UniversalFinding;
  const invalid = { ...ocr.words[2]!, box: { ...ocr.words[2]!.box, x: -5 } };
  const altered = { ...ocr, words: [ocr.words[0]!, ocr.words[1]!, invalid] };
  const mask: RedactionRect = { ...ocr.words[1]!.box, id: 'm', imageId: ocr.imageId, source: 'manual', shouldRedact: true };
  act(() => root.render(<OcrTextReview ocr={altered} findings={[finding]} masks={[mask]} onMask={vi.fn()} />));
  expect(host.querySelectorAll('article')).toHaveLength(1);
  expect(host.querySelector<HTMLButtonElement>('article button')?.disabled).toBe(true);
  expect(host.textContent).toContain('Text is covered');
});
it('explains empty OCR and blocks changes during scanning', () => {
  const onMask = vi.fn();
  act(() => root.render(<OcrTextReview ocr={{ ...ocr, words: [] }} findings={[]} masks={[]} onMask={onMask} />));
  expect(host.textContent).toContain('No readable text was found');
  act(() => root.render(<OcrTextReview ocr={ocr} findings={[]} masks={[]} disabled onMask={onMask} />));
  act(() => host.querySelector<HTMLButtonElement>('article button')!.click());
  expect(onMask).not.toHaveBeenCalled();
});

it('fills gaps in unclassified text and restores rotated original-image coordinates', () => {
  const rotated = rememberOcrOrientation({ ...ocr, width: 600, height: 1000,
    words: [{ id: 'a', lineId: 'line', text: 'First', confidence: 0.9,
      box: originalLayoutBox({ x: 40, y: 50, width: 50, height: 20 }, 1000, 600, 'clockwise') },
    { id: 'b', lineId: 'line', text: 'Second', confidence: 0.9,
      box: originalLayoutBox({ x: 100, y: 50, width: 60, height: 20 }, 1000, 600, 'clockwise') }] }, 'clockwise');
  const onMask = vi.fn();
  act(() => root.render(<OcrTextReview ocr={rotated} findings={[]} masks={[]} onMask={onMask} />));
  expect(host.textContent).toContain('First Second');
  act(() => host.querySelector<HTMLButtonElement>('article button')!.click());
  const [region] = onMask.mock.calls[0]![0];
  expect(onMask.mock.calls[0]![0]).toHaveLength(1);
  for (const word of rotated.words) {
    expect(region.x).toBeLessThanOrEqual(word.box.x);
    expect(region.y).toBeLessThanOrEqual(word.box.y);
    expect(region.x + region.width).toBeGreaterThanOrEqual(word.box.x + word.box.width);
    expect(region.y + region.height).toBeGreaterThanOrEqual(word.box.y + word.box.height);
  }
});
