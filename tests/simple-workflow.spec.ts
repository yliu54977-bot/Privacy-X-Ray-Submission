import { expect, test } from '@playwright/test';

test('simple flow automatically scans, selects masks, invalidates previews and downloads pixels', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Choose what to hide.', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sharing context configuration' })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Review mode' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  const selections = page.getByRole('complementary', { name: 'Choose information to hide', exact: true });
  const bank = selections.getByRole('checkbox', { name: /Bank Account Number/i });
  await expect(bank).toBeVisible({ timeout: 60000 });
  await expect(bank).not.toBeChecked();
  await expect(page.locator('.px-mask')).toHaveCount(0);
  await bank.check();
  await expect(page.locator('.px-mask')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Preview covered image', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Covered PNG preview', exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Scan again', exact: true }).click();
  await expect(bank).toBeChecked();
  await expect(page.getByRole('img', { name: 'Covered PNG preview', exact: true })).toBeVisible();
  await page.getByLabel('Mask regions').getByRole('button').first().click();
  await page.getByRole('button', { name: 'Delete Selected', exact: true }).click();
  await expect(bank).not.toBeChecked();
  await bank.check();
  await bank.uncheck();
  await expect(page.getByRole('img', { name: 'Covered PNG preview', exact: true })).toHaveCount(0);
  await selections.getByRole('button', { name: 'Select all', exact: true }).click();
  await expect(bank).toBeChecked();
  await page.getByRole('button', { name: 'Preview covered image', exact: true }).click();
  const preview = page.getByRole('img', { name: 'Covered PNG preview', exact: true });
  await expect(preview).toBeVisible();
  const mask = await page.locator('.px-mask').first().evaluate(el => ({x: Number(el.getAttribute('x')), y: Number(el.getAttribute('y')),
    width: Number(el.getAttribute('width')), height: Number(el.getAttribute('height'))}));
  const pixel = await preview.evaluate((img: HTMLImageElement, box) => {
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(Math.floor(box.x + box.width / 2), Math.floor(box.y + box.height / 2), 1, 1).data);
  }, mask);
  expect(pixel).toEqual([0, 0, 0, 255]);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
  expect((await downloading).suggestedFilename()).toMatch(/\.png$/);
  await selections.getByRole('button', { name: 'Clear selection', exact: true }).click();
  await expect(page.locator('.px-mask')).toHaveCount(0);
  await expect(bank).not.toBeChecked();
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) test(`simple flow keyboard and layout ${viewport.width}`, async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize(viewport);
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  const bank = page.getByRole('checkbox', { name: /Bank Account Number/i });
  await expect(bank).toBeVisible({ timeout: 60000 });
  await bank.focus(); await bank.press('Space'); await expect(bank).toBeChecked();
  await expect(page.locator('.px-mask')).not.toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`simple-review-${viewport.width}.png`), fullPage: true });
});

test('an unsupported replacement does not leave the original automatic scan stuck', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/'); await page.getByRole('button', { name: 'Try a sample', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Recognition progress' })).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({ name: 'unsupported.txt', mimeType: 'text/plain', buffer: Buffer.from('fictional unsupported document') });
  await expect(page.getByRole('alert')).toContainText('Choose PNG');
  await expect(page.getByRole('checkbox', { name: /Bank Account Number/i })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Scan again', exact: true })).toBeEnabled();
});
