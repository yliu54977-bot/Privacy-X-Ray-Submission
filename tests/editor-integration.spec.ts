import { test, expect, type Page } from '@playwright/test';

async function drag(page: Page, a: [number, number], b: [number, number]) {
  const bounds = (await page.locator('.px-overlay').boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * a[0], bounds.y + bounds.height * a[1]);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * b[0], bounds.y + bounds.height * b[1], { steps: 5 });
  await page.mouse.up();
}
async function geometry(page: Page) {
  return page.locator('.px-mask').first().evaluate((e) =>
    ['x', 'y', 'width', 'height'].map((name) => Number(e.getAttribute(name))));
}
for (const width of [1440, 768, 390]) {
  test(`integrated editor geometry, selection and preview invalidation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1100 });
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') warnings.push(message.text());
    });
    await page.goto('/?review=advanced'); await page.getByRole('button', { name: 'Classic review', exact: true }).click();
    await page.getByRole('button', { name: 'Try tuition sample' }).click();
    await expect(page.locator('.px-overlay')).toBeVisible();
    await page.locator('.px-overlay').scrollIntoViewIfNeeded();
    await drag(page, [.1, .1], [.3, .3]);
    const created = await geometry(page);
    [120, 85, 240, 170].forEach((n, i) => expect(created[i]).toBeCloseTo(n, 0));
    await page.getByRole('button', { name: 'Select / Edit', exact: true }).click();
    await page.locator('.px-overlay').scrollIntoViewIfNeeded();
    await drag(page, [.2, .2], [.3, .3]);
    await expect(page.locator('.px-handle')).toHaveCount(4);
    const moved = await geometry(page);
    [240, 170, 240, 170].forEach((n, i) => expect(moved[i]).toBeCloseTo(n, 0));
    await drag(page, [.4, .4], [.5, .5]);
    const resized = await geometry(page);
    [240, 170, 360, 255].forEach((n, i) => expect(resized[i]).toBeCloseTo(n, 0));
    await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 1100 });
    expect(await geometry(page)).toEqual(resized);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const attrs = await page.locator('.px-mask').first().evaluate((e) =>
      ['imageId', 'shouldRedact', 'source', 'fieldId', 'id'].map((name) => e.getAttribute(name)));
    expect(attrs).toEqual([null, null, null, null, null]);
    await page.getByRole('button', { name: 'Review redacted image', exact: true }).click();
    await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete Selected', exact: true }).click();
    await expect(page.locator('.px-mask')).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toHaveCount(0);
    expect(warnings.filter((m) => /does not recognize|non-boolean attribute/i.test(m))).toEqual([]);
  });
}

test('real OCR linked-mask deletion shows REVIEW and image replacement discards pending context', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?review=advanced'); await page.getByRole('button', { name: 'Classic review', exact: true }).click();
  await page.getByRole('button', { name: 'Try tuition sample' }).click();
  await page.getByRole('button', { name: 'Scan for Sensitive Information' }).click();
  await expect(page.getByRole('button', { name: 'Scan for Sensitive Information' })).toBeEnabled({ timeout: 60000 });
  expect(await page.locator('.px-highlight').count()).toBeGreaterThan(0);
  const maskChoices = page.getByRole('button', { name: 'Mask information', exact: true });
  expect(await maskChoices.count()).toBeGreaterThan(0);
  for (const choice of await maskChoices.all()) await choice.click();
  await page.getByRole('button', { name: 'Review redacted image', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toBeVisible();
  await page.getByLabel('Mask regions').getByRole('button').first().click();
  await page.getByRole('button', { name: 'Delete Selected', exact: true }).click();
  await expect(page.getByText('Suggested mask removed. Choose whether to keep this information visible or mask it.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review redacted image', exact: true })).toBeDisabled();
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Sharing context' }).selectOption('public_sharing');
  await expect(page.getByRole('region', { name: 'Change Sharing Context?' })).toBeVisible();
  // Replace directly through the existing file-input handler, without unmounting the whole workspace.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 60; canvas.height = 40;
    return canvas.toDataURL('image/png').split(',')[1];
  });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('input[type=file]').setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByText(/60 × 40 original pixels/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Change Sharing Context?' })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Sharing context' })).toHaveValue('university');
});
