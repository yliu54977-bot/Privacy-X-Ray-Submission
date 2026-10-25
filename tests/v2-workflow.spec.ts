import { expect, test, type Page } from '@playwright/test';

const review = (page: Page) => page.getByRole('region', { name: 'Universal information review' });
const finding = (page: Page, name: RegExp) => review(page).getByRole('article', { name });

async function resolveReviews(page: Page) {
  const cards = review(page).getByRole('article');
  for (let i = 0; i < await cards.count(); i++) {
    const card = cards.nth(i);
    if (await card.getByRole('button', { name: 'Review later' }).getAttribute('aria-pressed') === 'true')
      await card.getByRole('button', { name: 'Keep visible' }).click();
  }
}

async function inspectBlackPixels(page: Page, box: { x: number; y: number; width: number; height: number },
  dimensions: [number, number]) {
  const pixels = await page.evaluate(({ x, y, width, height }) => {
    const img = document.querySelector<HTMLImageElement>('img[alt="Final redacted PNG for v2 review"]')!;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(Math.ceil(x), Math.ceil(y), Math.max(1, Math.floor(width - 1)),
      Math.max(1, Math.floor(height - 1))).data;
    return { dimensions: [canvas.width, canvas.height], opaqueBlack: Array.from(data).every((channel, i) =>
      channel === (i % 4 === 3 ? 255 : 0)) };
  }, box);
  expect(pixels).toEqual({ dimensions, opaqueBlack: true });
}

test('live Universal review scans, resolves, masks pixels and downloads a fictional image', async ({ page, context }) => {
  test.setTimeout(90_000);
  const requests: { url: string; method: string; body: string | null }[] = [];
  const consoleErrors: string[] = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  page.on('console', message => { if (message.type() === 'error' && message.text() !== 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.') consoleErrors.push(message.text()); });
  await page.goto('/?review=advanced');
  await page.getByRole('button', { name: 'Universal review (v2)' }).click();
  await page.getByRole('button', { name: 'Try tuition sample' }).click();
  await page.getByRole('button', { name: 'Scan for Sensitive Information' }).click();
  await expect(finding(page, /Bank account number/i)).toContainText('REVIEW', { timeout: 60_000 });
  await expect(page.getByRole('complementary', { name: 'Inspection coverage' })).toContainText('OCR may miss');
  await expect(finding(page, /Student ID/i)).toContainText('REVIEW');
  await finding(page, /Bank account number/i).getByRole('button', { name: 'Mask information' }).click();
  const bankMask = page.locator('.px-mask').first();
  await expect(bankMask).toBeVisible();
  const box = await bankMask.evaluate(element => ({
    x: Number(element.getAttribute('x')), y: Number(element.getAttribute('y')),
    width: Number(element.getAttribute('width')), height: Number(element.getAttribute('height')),
  }));
  await resolveReviews(page);
  await page.getByRole('button', { name: 'Generate final PNG preview' }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG for v2 review' })).toBeVisible();
  await inspectBlackPixels(page, box, [1200, 850]);
  await page.getByRole('checkbox', { name: /I checked the final image/ }).check();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download reviewed PNG' }).click();
  expect((await download).suggestedFilename()).toBe('redacted.png');
  expect(requests.some(request => request.url.endsWith('/ocr/chi_sim.traineddata.gz'))).toBe(true);
  expect(requests.filter(request => /^https?:/.test(request.url) &&
    (request.method !== 'GET' || request.body || !request.url.startsWith('http://127.0.0.1:4173/')))).toEqual([]);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, databases: 0 });
  expect(await context.cookies()).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('live Universal review retains manual masks and OCR across context changes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?review=advanced');
  await page.getByRole('button', { name: 'Universal review (v2)' }).click();
  const screenshot = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1100; canvas.height = 460;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111'; ctx.font = '32px Arial';
    ctx.fillText('Order No.: ORD-991122', 40, 90);
    ctx.fillText('Shipping Address: 45 Example Road', 40, 155);
    ctx.fillText('API Key: sk_test_123456789ABC', 40, 220);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('Sample failed')), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional-v2-order.png',
    mimeType: 'image/png', buffer: Buffer.from(screenshot) });
  await page.getByRole('combobox', { name: 'Start with a preset' }).selectOption('customer_support');
  await page.getByRole('checkbox', { name: /I reviewed the recipient, purpose/ }).check();
  await page.getByRole('button', { name: 'Apply sharing context' }).click();
  const editor = page.locator('.px-overlay');
  await expect(editor).toBeVisible();
  const bounds = (await editor.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * .75, bounds.y + bounds.height * .7);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * .85, bounds.y + bounds.height * .8);
  await page.mouse.up();
  const manual = await page.locator('.px-mask[data-mask]').first().getAttribute('data-mask');
  await page.getByRole('button', { name: 'Scan for Sensitive Information' }).click();
  await expect(finding(page, /Shipping Address/i)).toContainText('REVIEW', { timeout: 60_000 });
  // OCR read this synthetic token with weak confidence, so C's policy correctly defers it.
  await expect(finding(page, /API Key/i)).toContainText('REVIEW');
  await expect(finding(page, /Order Number/i)).toContainText('REVIEW');
  await finding(page, /API Key/i).getByRole('button', { name: 'Locate in image' }).click();
  const secretBox = await page.locator('.px-highlight.px-field-selected').first().evaluate(element => ({
    x: Number(element.getAttribute('x')), y: Number(element.getAttribute('y')),
    width: Number(element.getAttribute('width')), height: Number(element.getAttribute('height')),
  }));
  await finding(page, /API Key/i).getByRole('button', { name: 'Mask information' }).click();
  await finding(page, /Shipping Address/i).getByRole('button', { name: 'Mask information' }).click();
  await resolveReviews(page);
  await expect(page.locator(`[data-mask="${manual}"]`)).toHaveCount(1);
  await page.getByRole('button', { name: 'Generate final PNG preview' }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG for v2 review' })).toBeVisible();
  await inspectBlackPixels(page, secretBox, [1100, 460]);
  await page.getByRole('checkbox', { name: /I checked the final image/ }).check();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download reviewed PNG' }).click();
  expect((await download).suggestedFilename()).toBe('redacted.png');
  await page.getByRole('combobox', { name: 'Start with a preset' }).selectOption('public_sharing');
  await page.getByRole('combobox', { name: 'Whose information is this?' }).selectOption('self');
  await page.getByRole('checkbox', { name: /I reviewed the recipient, purpose/ }).check();
  await page.getByRole('button', { name: 'Apply sharing context' }).click();
  await page.getByRole('button', { name: 'Confirm context change' }).click();
  await expect(page.locator(`[data-mask="${manual}"]`)).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Final redacted PNG for v2 review' })).toHaveCount(0);
  await expect(finding(page, /Order Number/i)).toContainText('MASK');
  await expect(finding(page, /Shipping Address/i)).toContainText('MASK');
  await expect(page.getByRole('button', { name: 'Scan for Sensitive Information' })).toHaveText('Scan for Sensitive Information');
  await page.getByRole('textbox', { name: 'Who receives it?' }).fill('Fictional scholarship office');
  await page.getByRole('checkbox', { name: /I reviewed the recipient, purpose/ }).check();
  await page.getByRole('button', { name: 'Apply sharing context' }).click();
  await page.getByRole('button', { name: 'Confirm context change' }).click();
  await expect(finding(page, /Order Number/i)).toContainText('REVIEW');
  await expect(page.locator(`[data-mask="${manual}"]`)).toHaveCount(1);
});
