import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const qr = readFileSync(new URL('./fixtures/fictional-qr-email.png', import.meta.url));
const credentialQr = readFileSync(new URL('./fixtures/fictional-qr-api-key.png', import.meta.url));
const unknownQr = readFileSync(new URL('./fixtures/fictional-qr-unknown.png', import.meta.url));

test('browser-local QR decoding keeps original coordinates and exports opaque pixels', async ({ page, context }) => {
  test.setTimeout(90_000);
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  await page.goto('/?review=advanced');
  await page.getByRole('button', { name: 'Universal review (v2)' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional-qr-email.png',
    mimeType: 'image/png', buffer: qr });
  await page.getByRole('button', { name: 'Scan for Sensitive Information' }).click();
  const card = page.getByRole('region', { name: 'Universal information review' })
    .getByRole('article', { name: /QR code containing email/i });
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toContainText('mailto:fictional@example.test');
  await expect(page.getByRole('complementary', { name: 'Inspection coverage' })).toContainText('OCR may miss');
  await card.getByRole('button', { name: 'Mask information' }).click();
  const mask = page.locator('.px-mask').first();
  await expect(mask).toBeVisible();
  const geometry = await mask.evaluate(element => ({ x: Number(element.getAttribute('x')),
    y: Number(element.getAttribute('y')), width: Number(element.getAttribute('width')),
    height: Number(element.getAttribute('height')) }));
  expect(geometry.x).toBeGreaterThanOrEqual(0);
  expect(geometry.y).toBeGreaterThanOrEqual(0);
  expect(geometry.x + geometry.width).toBeLessThanOrEqual(260);
  expect(geometry.y + geometry.height).toBeLessThanOrEqual(260);
  await page.getByRole('button', { name: 'Generate final PNG preview' }).click();
  const preview = page.getByRole('img', { name: 'Final redacted PNG for v2 review' });
  await expect(preview).toBeVisible();
  const opaque = await page.evaluate(({ x, y, width, height }) => {
    const img = document.querySelector<HTMLImageElement>('img[alt="Final redacted PNG for v2 review"]')!;
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
    const pixel = ctx.getImageData(Math.floor(x + width / 2), Math.floor(y + height / 2), 1, 1).data;
    return { dimensions: [canvas.width, canvas.height], pixel: Array.from(pixel) };
  }, geometry);
  expect(opaque).toEqual({ dimensions: [260, 260], pixel: [0, 0, 0, 255] });
  expect(requests.filter(request => /^https?:/.test(request.url) &&
    (request.method !== 'GET' || request.body || !request.url.startsWith('http://127.0.0.1:4173/')))).toEqual([]);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, databases: 0 });
  expect(await context.cookies()).toEqual([]);
});

test('a locally decoded QR credential receives an active policy mask', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?review=advanced');
  await page.getByRole('button', { name: 'Universal review (v2)' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional-qr-api-key.png',
    mimeType: 'image/png', buffer: credentialQr });
  await page.getByRole('button', { name: 'Scan for Sensitive Information' }).click();
  const card = page.getByRole('region', { name: 'Universal information review' })
    .getByRole('article', { name: /QR code containing API key/i });
  await expect(card).toContainText('Suggested: MASK', { timeout: 60_000 });
  await expect(page.locator('.px-mask')).toHaveCount(1);
  await expect(page.getByRole('complementary', { name: 'Inspection coverage' })).toBeVisible();
});

test('unknown QR content remains REVIEW and its decoded URL is never visited', async ({ page }) => {
  test.setTimeout(90_000);
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/?review=advanced');
  await page.getByRole('button', { name: 'Universal review (v2)' }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional-qr-unknown.png',
    mimeType: 'image/png', buffer: unknownQr });
  await page.getByRole('button', { name: 'Scan for Sensitive Information' }).click();
  const card = page.getByRole('region', { name: 'Universal information review' })
    .getByRole('article', { name: 'QR code' });
  await expect(card).toContainText('Suggested: REVIEW', { timeout: 60_000 });
  await expect(page.locator('.px-mask')).toHaveCount(0);
  expect(requests.some(url => url.includes('example.test'))).toBe(false);
});
