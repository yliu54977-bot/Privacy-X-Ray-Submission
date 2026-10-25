// Native integration check; run on macOS/Windows after desktop:build.
// Uses only synthetic inputs and the separately prepared, public portrait fixture.
import { _electron as electron, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const require = createRequire(new URL('../package.json', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'privacy-xray-smoke-'));
let requests = 0;
const server = createServer((_req, res) => { requests++; res.end('unexpected network request'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const loopback = `http://127.0.0.1:${server.address().port}/`;
const app = await electron.launch({ executablePath: require('electron'), args: [resolve('desktop/stage')], timeout: 60000 });
try {
  console.log('Electron process launched.');
  console.log(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => ({ url: w.webContents.getURL(), loading: w.webContents.isLoading() }))));
  const page = await app.firstWindow({ timeout: 60000 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await expect(page.getByRole('heading', { name: 'Choose what to hide.', exact: true })).toBeVisible();
  assert.equal(new URL(page.url()).protocol, 'privacy-xray:');
  const isolation = await app.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents;
    const prefs = wc.getLastWebPreferences();
    return { sandbox: prefs.sandbox, node: prefs.nodeIntegration, isolated: prefs.contextIsolation, persistent: wc.session.isPersistent() };
  });
  assert.deepEqual(isolation, { sandbox: true, node: false, isolated: true, persistent: false });
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  // Exercise the installed session interceptor, independently of renderer CSP.
  const blocked = await app.evaluate(async ({ BrowserWindow }, loopback) => {
    const ses = BrowserWindow.getAllWindows()[0].webContents.session;
    return Promise.all(['https://example.invalid/', loopback, 'file:///not-a-bundled-file'].map(async url => {
      try { await ses.fetch(url, { signal: AbortSignal.timeout(5000) }); return false; } catch { return true; }
    }));
  }, loopback);
  assert.deepEqual(blocked, [true, true, true]);
  assert.equal(requests, 0, 'The installed request policy must block even a reachable loopback server.');
  console.log('Runtime isolation and request blocking passed.');
  await app.context().setOffline(true);
  await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /Bank Account Number/i })).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  const box = await page.locator('.px-mask').first().evaluate(el => Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, Number(el.getAttribute(k))])));
  await page.getByRole('button', { name: 'Preview covered image', exact: true }).click();
  const preview = page.getByRole('img', { name: 'Covered PNG preview', exact: true });
  await expect(preview).toBeVisible();
  const pixel = await preview.evaluate(async (img, box) => {
    await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(Math.floor(box.x + box.width / 2), Math.floor(box.y + box.height / 2), 1, 1).data);
  }, box);
  assert.deepEqual(pixel, [0, 0, 0, 255]);
  console.log('Offline OCR and opaque preview pixels passed.');
  const output = join(temp, 'redacted.png');
  await app.evaluate(({ BrowserWindow }, output) => {
    BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => item.setSavePath(output));
  }, output);
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  await expect.poll(async () => { try { return (await readFile(output)).subarray(0, 8).toString('hex'); } catch { return ''; } }, { timeout: 15000 }).toBe('89504e470d0a1a0a');
  await page.getByRole('button', { name: 'Clear file', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try a sample', exact: true })).toBeVisible();

  console.log('PNG file download and clear passed.');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/public-face-portrait.jpg');
  await expect(page.getByRole('checkbox', { name: /face region/i }).first()).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: 'Clear file', exact: true }).click();
  console.log('Offline face model passed.');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/fictional-qr-email.png');
  await expect(page.getByRole('checkbox', { name: /QR/i }).first()).toBeVisible({ timeout: 120000 });
  await page.getByRole('link', { name: 'Privacy X-Ray home', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Try a sample', exact: true })).toBeVisible();

  console.log('Offline QR detection and home navigation passed.');
  const content = 'BT /F1 28 Tf 40 250 Td (Email: sample@example.test) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await expect(page.getByRole('region', { name: 'PDF page selection', exact: true })).toContainText('PDF page 1 of 1', { timeout: 30000 });
  await expect(page.getByRole('checkbox', { name: /Email/i }).first()).toBeVisible({ timeout: 120000 });
  assert.deepEqual(errors, []);
  console.log('Native smoke passed: isolated session, request blocking, offline OCR/face/QR/PDF, opaque export, file download, clear and home. Native save dialog and OS-wide network capture remain manual checks.');
} finally {
  await app.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
