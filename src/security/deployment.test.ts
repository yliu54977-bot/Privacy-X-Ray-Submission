/// <reference types="node" />
import { expect, it } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import config from '../../vercel.json';

const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key.toLowerCase(), value]));
const csp = new Map(headers['content-security-policy'].split(';').map(d => { const [name, ...values] = d.trim().split(/\s+/); return [name, values]; }));
it('limits scripts and workers to the app without enabling inline scripts or JavaScript evaluation', () => {
  expect(csp.get('default-src')).toEqual(["'none'"]);
  expect(csp.get('script-src')).toContain("'wasm-unsafe-eval'");
  for (const directive of ['script-src', 'worker-src', 'connect-src', 'img-src']) {
    expect(csp.get(directive)?.some(value => value === '*' || value === 'https:' || value === 'http:')).toBe(false);
  }
  expect(csp.get('script-src')).not.toContain("'unsafe-eval'");
  expect(csp.get('script-src')).not.toContain("'unsafe-inline'");
  expect(csp.get('script-src-attr')).toEqual(["'none'"]);
  expect(csp.get('connect-src')).toEqual(["'self'", 'blob:']);
  for (const directive of ['form-action', 'frame-ancestors', 'frame-src', 'object-src', 'base-uri'])
    expect(csp.get(directive)).toEqual(["'none'"]);
});
it('protects all responses including OCR workers, and denies unused permissions and referrers', () => {
  expect(config.headers[0].source).toBe('/(.*)');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  for (const permission of ['camera', 'microphone', 'geolocation', 'payment', 'usb'])
    expect(headers['permissions-policy']).toContain(`${permission}=()`);
});
it('preserves security headers when generating a standalone drag-and-drop deployment', () => {
  const root = mkdtempSync(join(tmpdir(), 'privacy-xray-config-'));
  try {
    mkdirSync(join(root, 'scripts')); mkdirSync(join(root, 'dist'));
    copyFileSync('vercel.json', join(root, 'vercel.json'));
    copyFileSync('scripts/prepare-deployment.mjs', join(root, 'scripts/prepare-deployment.mjs'));
    execFileSync(process.execPath, [join(root, 'scripts/prepare-deployment.mjs')]);
    const actual = JSON.parse(readFileSync(join(root, 'dist/vercel.json'), 'utf8'));
    expect(actual.headers).toEqual(config.headers);
    expect(actual).toMatchObject({ framework: null, buildCommand: '', installCommand: '', outputDirectory: '.' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
