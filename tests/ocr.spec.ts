import { expect, test } from '@playwright/test';

for (const sample of [
  { button: 'Try tuition sample', expected: ['Student ID', 'Bank Account Number', 'Payment Amount', 'Email Address', 'Phone Number', 'Home Address'] },
  { button: 'Try order sample', expected: ['Order Number', 'Email Address', 'Phone Number', 'Home Address'] },
]) {
  test(`browser-local OCR identifies fictional fields in ${sample.button}`, async ({ page }) => {
    test.setTimeout(90000);
    const requests: { url: string; method: string; body: string | null }[] = [];
    page.on('request', (request) => requests.push({
      url: request.url(), method: request.method(), body: request.postData(),
    }));

    await page.goto('/?review=advanced'); await page.getByRole('button', { name: 'Classic review', exact: true }).click();
    await page.getByRole('button', { name: sample.button }).click();
    await page.getByRole('button', { name: 'Scan for Sensitive Information' }).click();
    const review = page.getByRole('region', { name: 'Privacy recommendations' });
    await expect(review.getByRole('button', { name: sample.expected[0] })).toBeVisible({ timeout: 60000 });
    for (const label of sample.expected) {
      await expect(review.getByRole('button', { name: label })).toBeVisible();
    }
    const boxes = await page.locator('.px-editor svg .px-highlight').evaluateAll((regions) =>
      regions.map((region) => ({
        x: Number(region.getAttribute('x')), y: Number(region.getAttribute('y')),
        width: Number(region.getAttribute('width')), height: Number(region.getAttribute('height')),
      })),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(sample.expected.length);
    expect(boxes.every((box) => box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 &&
      box.x + box.width <= 1200 && box.y + box.height <= 850)).toBe(true);
    expect(requests.some((request) => request.url.includes('/ocr/worker.min.js'))).toBe(true);
    expect(requests.some((request) => request.url.includes('/ocr/core/'))).toBe(true);
    expect(requests.some((request) => request.url.includes('/ocr/eng.traineddata.gz'))).toBe(true);
    const network = requests.filter((request) => /^https?:/.test(request.url));
    expect(network.filter((request) => request.method !== 'GET' || request.body)).toEqual([]);
    expect(network.filter((request) => !request.url.startsWith('http://127.0.0.1:4173/'))).toEqual([]);
  });
}
