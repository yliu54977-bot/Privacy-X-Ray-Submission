import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) test(`all-content selection exports original pixels and invalidates preview ${width}`, async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width, height: 900 });
  const unexpected: string[] = [], errors: string[] = [];
  page.on('pageerror', () => errors.push('page error'));
  await page.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173' || request.method() !== 'GET' || request.postData()) {
      unexpected.push('unexpected request'); return route.abort();
    }
    return route.continue();
  });
  await page.goto('/');
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 500;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1000, 500);
    ctx.fillStyle = '#111'; ctx.font = '32px Arial';
    ctx.fillText('Ordinary garden notebook', 60, 120);
    ctx.fillText('Lavender blossoms tomorrow', 60, 200);
    return Array.from(new Uint8Array(await (await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'))).arrayBuffer()));
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional-garden.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
  const panel = page.getByLabel('Recognized text review', { exact: true });
  await expect(panel.getByText(/All recognized text/)).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('region', { name: 'Sharing context configuration' })).toHaveCount(0);
  await panel.getByRole('radio', { name: 'Words', exact: true }).check();
  await panel.getByRole('searchbox').fill('Lavender');
  const maskWord = panel.getByRole('button', { name: 'Mask this word', exact: true });
  await maskWord.focus(); await maskWord.press('Enter');
  await expect(panel.getByRole('button', { name: 'Text is covered' })).toBeDisabled();
  await expect(page.locator('.px-mask')).toHaveCount(1);
  await page.getByRole('button', { name: 'Preview covered image', exact: true }).click();
  const preview = page.getByRole('img', { name: 'Covered PNG preview', exact: true });
  await expect(preview).toBeVisible();
  const imageCheck = await preview.evaluate((img: HTMLImageElement) => {
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
    const mask = document.querySelector('.px-mask')!;
    const x = Number(mask.getAttribute('x')), y = Number(mask.getAttribute('y'));
    const width = Number(mask.getAttribute('width')), height = Number(mask.getAttribute('height'));
    const pixels = ctx.getImageData(Math.ceil(x), Math.ceil(y), Math.floor(width - 1), Math.floor(height - 1)).data;
    let incorrect = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] || pixels[i + 1] || pixels[i + 2] || pixels[i + 3] !== 255) incorrect++;
    return { width: img.naturalWidth, height: img.naturalHeight, incorrect };
  });
  expect(imageCheck).toEqual({ width: 1000, height: 500, incorrect: 0 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  await panel.getByRole('radio', { name: 'Lines', exact: true }).check();
  await panel.getByRole('searchbox').fill('Ordinary');
  await panel.getByRole('button', { name: 'Mask this line', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toHaveCount(0);
  await panel.getByRole('radio', { name: 'Text groups', exact: true }).check();
  await panel.getByRole('searchbox').fill('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: (await indexedDB.databases()).length, cookies: document.cookie }))).toEqual({ local: 0, session: 0, databases: 0, cookies: '' });
  expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath(`all-content-${width}.png`), fullPage: true });
});
