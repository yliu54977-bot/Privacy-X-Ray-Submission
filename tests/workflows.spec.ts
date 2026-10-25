import { expect, test, type Page } from '@playwright/test';

function card(page: Page, label: string) {
  return page.locator('.px-field').filter({ has: page.getByRole('button', { name: label, exact: true }) });
}

async function selectedBox(page: Page, label: string) {
  await card(page, label).getByRole('button', { name: label, exact: true }).click();
  return page.locator('.px-highlight.px-field-selected').first().evaluate((element) => ({
    x: Number(element.getAttribute('x')),
    y: Number(element.getAttribute('y')),
    width: Number(element.getAttribute('width')),
    height: Number(element.getAttribute('height')),
  }));
}

async function compareRegion(page: Page, box: { x: number; y: number; width: number; height: number }) {
  return page.evaluate(({ x, y, width, height }) => {
    const source = document.querySelector<HTMLImageElement>('img[alt="Original screenshot for privacy review"]')!;
    const output = document.querySelector<HTMLImageElement>('img[alt="Final redacted PNG"]')!;
    const imageData = (image: HTMLImageElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return context.getImageData(Math.ceil(x), Math.ceil(y), Math.max(1, Math.floor(width - 1)), Math.max(1, Math.floor(height - 1))).data;
    };
    const original = imageData(source), redacted = imageData(output);
    let identical = true, allOpaqueBlack = true;
    for (let i = 0; i < redacted.length; i += 4) {
      for (let channel = 0; channel < 4; channel++)
        if (redacted[i + channel] !== original[i + channel]) identical = false;
      if (redacted[i] !== 0 || redacted[i + 1] !== 0 || redacted[i + 2] !== 0 || redacted[i + 3] !== 255)
        allOpaqueBlack = false;
    }
    return { identical, allOpaqueBlack, dimensions: [output.naturalWidth, output.naturalHeight] };
  }, box);
}

async function resolveReviews(page: Page) {
  const unresolved = page.locator('.px-field').filter({ has: page.locator('.px-action-REVIEW') });
  while (await unresolved.count())
    await unresolved.first().getByRole('button', { name: 'Keep visible' }).click();
}

async function reviewedDownload(page: Page) {
  await page.getByRole('checkbox', { name: /I reviewed the final PNG/ }).check();
  const preview = page.getByRole('img', { name: 'Final redacted PNG' });
  const url = await preview.getAttribute('src');
  const expected = await page.evaluate(async (blobUrl) =>
    Array.from(new Uint8Array(await (await fetch(blobUrl!)).arrayBuffer())), url);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(download.suggestedFilename()).toBe('redacted.png');
  expect(Array.from(Buffer.concat(chunks))).toEqual(expected);
}

test('University tuition: local OCR, recommendations, overrides, permanent PNG', async ({ page, context }) => {
  test.setTimeout(90000);
  const network: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (request) => network.push({ url: request.url(), method: request.method(), body: request.postData() }));
  await page.goto('/'); await page.getByRole('button', { name: 'Classic review', exact: true }).click();
  await page.getByRole('button', { name: 'Try tuition sample' }).click();
  await page.getByRole('button', { name: 'Scan for Sensitive Information' }).click();
  await expect(card(page, 'Bank Account Number').locator('.px-action')).toHaveText('MASK', { timeout: 60000 });
  await expect(card(page, 'Home Address').locator('.px-action')).toHaveText('MASK');
  await expect(card(page, 'Phone Number').locator('.px-action')).toHaveText('MASK');
  await expect(card(page, 'Payment Amount').locator('.px-action')).toHaveText('KEEP');
  await expect(card(page, 'Student ID').locator('.px-action')).toHaveText('REVIEW');
  await expect(card(page, 'Email Address').locator('.px-action')).toHaveText('REVIEW');
  await expect(page.locator('.px-mask').count()).resolves.toBeGreaterThanOrEqual(3);
  await expect(page.getByRole('button', { name: 'Review redacted image' })).toBeDisabled();
  const bankBox = await selectedBox(page, 'Bank Account Number');
  const amountBox = await selectedBox(page, 'Payment Amount');
  await card(page, 'Student ID').getByRole('button', { name: 'Keep visible' }).click();
  await card(page, 'Email Address').getByRole('button', { name: 'Mask information' }).click();
  await card(page, 'Payment Amount').getByRole('button', { name: 'Mask information' }).click();
  await expect(card(page, 'Payment Amount').locator('.px-action')).toHaveText('MASK');
  await card(page, 'Payment Amount').getByRole('button', { name: 'Keep visible' }).click();
  await expect(card(page, 'Payment Amount').locator('.px-action')).toHaveText('KEEP');
  await page.getByRole('button', { name: 'Review redacted image' }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toBeVisible();
  expect(await compareRegion(page, bankBox)).toMatchObject({ allOpaqueBlack: true, dimensions: [1200, 850] });
  expect(await compareRegion(page, amountBox)).toMatchObject({ identical: true });
  await reviewedDownload(page);
  expect(network.filter((request) => /^https?:/.test(request.url) &&
    (request.method !== 'GET' || request.body || !request.url.startsWith('http://127.0.0.1:4173/')))).toEqual([]);
  expect(await page.evaluate(async () => ({
    local: localStorage.length, session: sessionStorage.length,
    databases: (await indexedDB.databases()).length,
  }))).toEqual({ local: 0, session: 0, databases: 0 });
  expect(await context.cookies()).toEqual([]);
});

test('Customer Support order: KEEP becomes Public MASK without rescanning or losing manual mask', async ({ page }) => {
  test.setTimeout(90000);
  const ocrRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/ocr/')) ocrRequests.push(request.url());
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Classic review', exact: true }).click();
  await page.getByRole('button', { name: 'Try order sample' }).click();
  await page.getByRole('combobox', { name: 'Sharing context' }).selectOption('customer_support');
  const editor = page.locator('.px-overlay');
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: 'Add Mask', exact: true }).click();
  await editor.scrollIntoViewIfNeeded();
  const bounds = (await editor.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .8, bounds.y + bounds.height * .8);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .9, bounds.y + bounds.height * .9);
  await page.mouse.up();
  await expect(page.locator('.px-mask')).toHaveCount(1);
  const manualId = await page.locator('.px-mask').first().getAttribute('data-mask');
  await page.getByRole('button', { name: 'Scan for Sensitive Information' }).click();
  await expect(card(page, 'Order Number').locator('.px-action')).toHaveText('KEEP', { timeout: 60000 });
  await expect(card(page, 'Home Address').locator('.px-action')).toHaveText('MASK');
  expect(await page.locator(`[data-mask="${manualId}"]`).count()).toBe(1);
  const orderBox = await selectedBox(page, 'Order Number');
  await resolveReviews(page);
  await page.getByRole('button', { name: 'Review redacted image' }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toBeVisible();
  expect(await compareRegion(page, orderBox)).toMatchObject({ identical: true });
  const requestCount = ocrRequests.length;

  await page.getByRole('combobox', { name: 'Sharing context' }).selectOption('public_sharing');
  await expect(page.getByRole('region', { name: 'Change Sharing Context?' })).toBeVisible();
  await page.getByRole('button', { name: 'Change Context' }).click();
  await expect(card(page, 'Order Number').locator('.px-action')).toHaveText('MASK');
  expect(await page.locator(`[data-mask="${manualId}"]`).count()).toBe(1);
  expect(ocrRequests).toHaveLength(requestCount);
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download PNG' })).toHaveCount(0);
  await resolveReviews(page);
  await page.getByRole('button', { name: 'Review redacted image' }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toBeVisible();
  expect(await compareRegion(page, orderBox)).toMatchObject({ allOpaqueBlack: true, dimensions: [1200, 850] });
  await reviewedDownload(page);
});
