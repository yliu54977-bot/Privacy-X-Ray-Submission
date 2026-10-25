import { expect, test } from '@playwright/test';

test('default enhanced scan finds unlabeled student-card information and masks it', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?review=advanced');
  await expect(page.getByRole('button', { name: 'Universal review (v2)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 650;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1000, 650);
    ctx.fillStyle = '#111'; ctx.font = 'bold 34px Arial';
    ctx.fillText('EASTVALE UNIVERSITY', 60, 80);
    ctx.font = '32px Arial';
    ctx.fillText('Morgan', 440, 250);
    ctx.fillText('Alex', 440, 300);
    ctx.fillText('7654321 ACTIVE', 440, 350);
    ctx.fillText('UNDERGRADUATE', 440, 400);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional-student-card.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
  await page.getByRole('button', { name: 'Scan for Sensitive Information', exact: true }).click();
  const number = page.getByRole('article', { name: 'Possible student card number', exact: true });
  const name = page.getByRole('article', { name: 'Possible cardholder name', exact: true });
  await expect(number).toBeVisible({ timeout: 60000 });
  await expect(name).toBeVisible();
  await expect(number).toContainText('7654321');
  await expect(name).toContainText(/Morgan Alex/i);
  await expect(name).toContainText('portrait manually');
  await number.getByRole('button', { name: 'Mask information', exact: true }).click();
  await name.getByRole('button', { name: 'Mask information', exact: true }).click();
  await expect(page.locator('.px-mask')).toHaveCount(3);
  await page.getByRole('button', { name: 'Generate final PNG preview', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG for v2 review', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('fictional-card-redaction.png'), fullPage: true });
});

test('switching from Classic after upload retains the image and manual masks', async ({ page }) => {
  await page.goto('/?review=advanced');
  await page.getByRole('button', { name: 'Classic review', exact: true }).click();
  await page.getByRole('button', { name: 'Try tuition sample', exact: true }).click();
  const overlay = page.locator('.px-overlay');
  await overlay.scrollIntoViewIfNeeded();
  const bounds = (await overlay.boundingBox())!;
  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down(); await page.mouse.move(bounds.x + 80, bounds.y + 80); await page.mouse.up();
  await page.getByRole('button', { name: 'Universal review (v2)', exact: true }).click();
  await expect(page.locator('.px-mask')).toHaveCount(1);
  await expect(page.getByRole('img', { name: 'Original screenshot for privacy review', exact: true })).toBeVisible();
  await expect(page.getByText('Universal review · local English and Chinese OCR', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan for Sensitive Information', exact: true })).toBeEnabled();
});

test('default enhanced mode supports manual masking and final preview before any scan', async ({ page }) => {
  await page.goto('/?review=advanced');
  await page.getByRole('button', { name: 'Try tuition sample', exact: true }).click();
  const overlay = page.locator('.px-overlay');
  await overlay.scrollIntoViewIfNeeded();
  const bounds = (await overlay.boundingBox())!;
  await page.mouse.move(bounds.x + 20, bounds.y + 20);
  await page.mouse.down(); await page.mouse.move(bounds.x + 80, bounds.y + 80); await page.mouse.up();
  await page.getByRole('button', { name: 'Generate final PNG preview', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG for v2 review', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /I checked the final image/ }).check();
  await expect(page.getByRole('button', { name: 'Download reviewed PNG', exact: true })).toBeEnabled();
});

test('unclassified OCR text can be searched and masked without an automatic finding', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?review=advanced');
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1000, 400);
    ctx.fillStyle = '#111'; ctx.font = '36px Arial';
    ctx.fillText('Member reference', 60, 110);
    ctx.fillText('MERCURY7319', 60, 200);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional-unclassified.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
  await page.getByRole('button', { name: 'Scan for Sensitive Information', exact: true }).click();
  const textReview = page.getByLabel('Recognized text review', { exact: true });
  await expect(textReview).toBeVisible({ timeout: 60000 });
  await textReview.getByRole('searchbox', { name: 'Search recognized text', exact: true }).fill('MERCURY');
  await expect(textReview.getByRole('article')).toHaveCount(1);
  await textReview.getByRole('button', { name: 'Mask this text', exact: true }).click();
  await expect(textReview.getByRole('button', { name: 'Text is covered', exact: true })).toBeDisabled();
  await expect(page.locator('.px-mask')).toHaveCount(1);
  await page.getByRole('button', { name: 'Generate final PNG preview', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG for v2 review', exact: true })).toBeVisible();
  await textReview.getByRole('searchbox', { name: 'Search recognized text', exact: true }).fill('Member');
  await textReview.getByRole('button', { name: 'Mask this text', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG for v2 review', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('recognized-text-review.png'), fullPage: true });
});
