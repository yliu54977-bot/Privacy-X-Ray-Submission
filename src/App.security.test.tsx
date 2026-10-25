// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { OcrResult } from './types';
const mocks = vi.hoisted(() => ({ load: vi.fn(), scan: vi.fn(), detect: vi.fn(), dispose: vi.fn() }));
vi.mock('./features/image/loadImage', () => ({ loadImage: mocks.load }));
vi.mock('./features/recognition/scanContent', () => ({ scanContent: mocks.scan }));
vi.mock('./v2/detection/detectUniversalPrivacy', () => ({ detectUniversalPrivacy: mocks.detect }));
vi.mock('./v2/detection/imagePixels', () => ({ openBrowserImagePixels: async () => ({ dispose: mocks.dispose }) }));
vi.mock('./features/editor', () => ({ RedactionEditor: () => <div>Local editor</div> }));
vi.mock('./features/export/redactImage', () => ({ redactImage: async () => new Blob(['masked pixels'], { type: 'image/png' }) }));
import App from './App';
import { downloadPng } from './features/export/downloadPng';
let root: Root, host: HTMLDivElement;
const ocr: OcrResult = { imageId: 'private', width: 100, height: 100, language: 'eng', words: [], text: '' };
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:temporary-export'), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  mocks.load.mockResolvedValue({ id: 'private', width: 100, height: 100, previewUrl: 'blob:private-original',
    mimeType: 'image/png', file: new File(['fixture'], 'private.png', { type: 'image/png' }) });
  mocks.scan.mockResolvedValue(ocr);
  mocks.detect.mockResolvedValue({ source: { kind: 'image', id: 'private' }, findings: [],
    coverage: { source: { kind: 'image', id: 'private' }, areas: [], warnings: [] } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<App />));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function choose() {
  const input = host.querySelector('input[type=file]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['fixture'], 'private.png', { type: 'image/png' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
async function click(label: string) {
  const target = [...host.querySelectorAll('button')].find(b => b.textContent === label)!;
  expect(target).toBeTruthy(); await act(async () => target.click());
}
it('clears a running scan, releases the original URL, and ignores late results', async () => {
  let finish!: (result: OcrResult) => void;
  mocks.scan.mockImplementation(() => new Promise<OcrResult>(resolve => { finish = resolve; }));
  await choose();
  const signal = mocks.scan.mock.calls[0][2] as AbortSignal;
  await click('Clear file');
  expect(signal.aborted).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-original');
  expect(host.textContent).toContain('Start with an image or PDF');
  await act(async () => finish(ocr));
  expect(mocks.detect).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('Local editor');
});
it('renders code payloads as text and clears findings, masks, previews and temporary download URLs', async () => {
  const payload = '<img src=x onerror="alert(1)">';
  mocks.detect.mockResolvedValue({ source: { kind: 'image', id: 'private' }, findings: [{
    id: 'code', source: { kind: 'image', id: 'private' }, status: 'KNOWN', typeId: 'barcode',
    categoryIds: ['machine_readable_metadata'], label: 'Barcode', value: payload,
    evidence: [], boxes: [{ x: 10, y: 10, width: 20, height: 20 }],
  }], coverage: { source: { kind: 'image', id: 'private' }, areas: [], warnings: [] } });
  await choose();
  expect(host.textContent).toContain(payload);
  expect(host.querySelector('img[onerror]')).toBeNull();
  await click('Select all'); await click('Preview covered image');
  expect(host.querySelector('img[alt="Covered PNG preview"]')).not.toBeNull();
  downloadPng(new Blob(['masked pixels'], { type: 'image/png' }));
  await click('Clear file');
  expect(host.textContent).not.toContain(payload);
  expect(host.querySelector('img[alt="Covered PNG preview"]')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-original');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:temporary-export');
  expect(mocks.dispose).toHaveBeenCalledOnce();
  await choose(); // A new upload still starts an independent session.
  expect(mocks.scan).toHaveBeenCalledTimes(2);
});
