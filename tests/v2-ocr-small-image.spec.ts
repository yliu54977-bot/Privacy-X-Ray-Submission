import { expect, test } from '@playwright/test';

test('small fictional screenshot OCR keeps findings in original-image pixels', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  const bytes = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/samples/tuition-payment.png';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 425;
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      result => result ? resolve(result) : reject(new Error('PNG creation failed')), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'fictional-small.png', mimeType: 'image/png', buffer: Buffer.from(bytes),
  });
  await page.getByRole('button', { name: 'Scan for Sensitive Information' }).click();
  await expect(page.getByRole('region', { name: 'Privacy recommendations' })
    .getByRole('button', { name: 'Bank Account Number' })).toBeVisible({ timeout: 60000 });
  const boxes = await page.locator('.px-editor svg .px-highlight').evaluateAll(nodes => nodes.map(node => ({
    x: Number(node.getAttribute('x')), y: Number(node.getAttribute('y')),
    width: Number(node.getAttribute('width')), height: Number(node.getAttribute('height')),
  })));
  expect(boxes.length).toBeGreaterThan(0);
  expect(boxes.every(box => box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 &&
    box.x + box.width <= 600 && box.y + box.height <= 425)).toBe(true);
});
