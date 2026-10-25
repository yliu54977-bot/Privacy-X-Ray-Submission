import { expect, test } from '@playwright/test';

// Entirely fictional, generated locally. The barcode has varied bars resembling
// Code 39 but is not intended to encode a real credential or anyone's identity.
for (const sideways of [false, true]) {
  test(`${sideways ? 'mobile sideways' : 'desktop upright'} university card finds unlabeled details and permanently covers them`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize(sideways ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.goto('/');
    const fixture = await page.evaluate(async sideways => {
      const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 900;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#222';
      type Region = { name: string; x: number; y: number; width: number; height: number };
      const text = (value: string, x: number, y: number, name: string): Region => {
        context.fillText(value, x, y);
        const size = context.measureText(value);
        return { name, x: Math.floor(x - size.actualBoundingBoxLeft - 2),
          y: Math.floor(y - size.actualBoundingBoxAscent - 2),
          width: Math.ceil(size.actualBoundingBoxLeft + size.actualBoundingBoxRight + 4),
          height: Math.ceil(size.actualBoundingBoxAscent + size.actualBoundingBoxDescent + 4) };
      };
      context.font = 'bold 54px Arial';
      const institution = text('EASTVALE UNIVERSITY', 100, 145, 'institution heading');
      context.font = '42px Arial';
      const given = text('Alex', 130, 300, 'given name');
      context.font = 'bold 42px Arial';
      const surname = text('MORGAN', 130, 362, 'surname');
      context.font = '42px Arial';
      const number = text('7654321', 130, 424, 'institution card number');
      text('Expiry Date:', 130, 510, 'expiry label');
      const expiry = text('28/02/2029', 370, 510, 'complete expiry date');
      // A simple non-face logo and unrelated prose must stay visible.
      context.fillStyle = '#ab2933'; context.fillRect(1120, 95, 95, 95);
      const logo: Region = { name: 'logo', x: 1120, y: 95, width: 95, height: 95 };
      context.fillStyle = '#222'; context.font = '28px Arial';
      const prose = text('Fictional example for local privacy testing.', 130, 840, 'unrelated prose');
      let x = 130;
      for (let index = 0; index < 90; index++) {
        const width = index % 7 === 0 || index % 5 === 0 ? 7 : 3;
        context.fillRect(x, 610, width, 104);
        x += width + (index % 4 === 0 ? 6 : 3);
      }
      const bars: Region = { name: 'barcode bars', x: 130, y: 610, width: x - 133, height: 104 };
      context.font = '32px Arial';
      const caption = text('20467913582046', 240, 760, 'printed barcode identifier');
      const output = document.createElement('canvas');
      output.width = sideways ? canvas.height : canvas.width;
      output.height = sideways ? canvas.width : canvas.height;
      const outputContext = output.getContext('2d')!;
      if (sideways) { outputContext.translate(canvas.height, 0); outputContext.rotate(Math.PI / 2); }
      outputContext.drawImage(canvas, 0, 0);
      const inOriginalPixels = (region: Region): Region => sideways
        ? { ...region, x: canvas.height - region.y - region.height, y: region.x,
          width: region.height, height: region.width } : region;
      const covered = [given, surname, number, expiry, bars, caption].map(inOriginalPixels);
      const preserved = [institution, logo, prose].map(inOriginalPixels);
      const blob = await new Promise<Blob>(resolve => output.toBlob(value => resolve(value!), 'image/png'));
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      const dimensions = [output.width, output.height];
      canvas.width = canvas.height = output.width = output.height = 0;
      return { bytes, covered, preserved, dimensions };
    }, sideways);
    await page.locator('input[type=file]').setInputFiles({
      name: `fictional-university-card-${sideways ? 'sideways' : 'upright'}.png`,
      mimeType: 'image/png', buffer: Buffer.from(fixture.bytes),
    });
    const selections = page.getByRole('complementary', { name: 'Choose information to hide', exact: true });
    const name = selections.getByRole('checkbox', { name: /cardholder name/i });
    const number = selections.getByRole('checkbox', { name: /(?:institution|student) card number/i });
    const expiry = selections.getByRole('checkbox', { name: /expiry date/i });
    const barcode = selections.getByRole('checkbox', { name: /barcode region/i });
    await expect(name).toBeVisible({ timeout: 150000 });
    await expect(name).toHaveAccessibleName(/Alex\s+MORGAN/i);
    await expect(number).toHaveAccessibleName(/7654321/);
    await expect(expiry).toHaveAccessibleName(/28\s*\/\s*02\s*\/\s*2029/);
    await expect(barcode).toBeVisible();
    // None of these suggestions is a decision until the user selects it.
    await expect(page.locator('.px-mask')).toHaveCount(0);
    for (const checkbox of [name, number, expiry, barcode]) {
      await expect(checkbox).not.toBeChecked();
      await checkbox.check();
      await expect(checkbox).toBeChecked();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Preview covered image', exact: true }).click();
    const preview = page.getByRole('img', { name: 'Covered PNG preview', exact: true });
    await expect(preview).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
    const pixels = await preview.evaluate((image: HTMLImageElement, regions) => {
      const original = document.querySelector<HTMLImageElement>('img[alt="Original screenshot for privacy review"]')!;
      const source = document.createElement('canvas'); const result = document.createElement('canvas');
      source.width = result.width = image.naturalWidth; source.height = result.height = image.naturalHeight;
      const beforeContext = source.getContext('2d')!; const afterContext = result.getContext('2d')!;
      beforeContext.drawImage(original, 0, 0); afterContext.drawImage(image, 0, 0);
      const covered = regions.covered.map(region => {
        const before = beforeContext.getImageData(region.x, region.y, region.width, region.height).data;
        const after = afterContext.getImageData(region.x, region.y, region.width, region.height).data;
        let ink = 0, maskedInk = 0;
        for (let offset = 0; offset < before.length; offset += 4) {
          if (before[offset]! < 128 && before[offset + 1]! < 128 && before[offset + 2]! < 128) {
            ink++;
            if (after[offset] === 0 && after[offset + 1] === 0 && after[offset + 2] === 0 && after[offset + 3] === 255) maskedInk++;
          }
        }
        return { name: region.name, ink, maskedInk };
      });
      const preserved = regions.preserved.map(region => {
        const before = beforeContext.getImageData(region.x, region.y, region.width, region.height).data;
        const after = afterContext.getImageData(region.x, region.y, region.width, region.height).data;
        return { name: region.name, unchanged: before.every((value, index) => value === after[index]) };
      });
      const dimensions = [image.naturalWidth, image.naturalHeight];
      source.width = source.height = result.width = result.height = 0;
      return { covered, preserved, dimensions };
    }, { covered: fixture.covered, preserved: fixture.preserved });
    await test.info().attach('fictional-card-export-pixels.json', { contentType: 'application/json', body: JSON.stringify(pixels) });
    expect(pixels.dimensions).toEqual(fixture.dimensions);
    for (const region of pixels.covered) {
      expect(region.ink, `${region.name} must contain actual fixture pixels.`).toBeGreaterThan(100);
      expect(region.maskedInk, `Every ink pixel in ${region.name} must be permanently covered.`).toBe(region.ink);
    }
    for (const region of pixels.preserved) {
      expect(region.unchanged, `${region.name} must not be covered by another field's mask.`).toBe(true);
    }
    await page.screenshot({ path: test.info().outputPath(`fictional-card-${sideways ? 'sideways-mobile' : 'upright-desktop'}.png`), fullPage: true });
    await barcode.uncheck();
    await expect(preview).toHaveCount(0);
  });
}
