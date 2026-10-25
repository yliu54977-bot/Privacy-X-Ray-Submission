import { afterEach, expect, it, vi } from 'vitest';
import { isDesktop, localAssetUrl } from './localAssets';

afterEach(() => vi.unstubAllGlobals());
it.each([
  ['https://example.test/', 'https://example.test/ocr/worker.min.js'],
  ['privacy-xray://app/', 'privacy-xray://app/ocr/worker.min.js'],
  ['privacy-xray://app/index.html', 'privacy-xray://app/ocr/worker.min.js'],
])('resolves all runtime assets within %s', (href, expected) => {
  vi.stubGlobal('location', new URL(href));
  expect(localAssetUrl('ocr/worker.min.js')).toBe(expected);
  expect(isDesktop()).toBe(href.startsWith('privacy-xray:'));
});
