import { expect, test } from '@playwright/test';

// Only generated, fictional records are used here. Never copy real identity documents
// into test fixtures or CI artifacts. Playwright's Ubuntu browser dependencies include
// fonts-wqy-zenhei; the glyph check below fails clearly if CJK rendering is unavailable.
for (const language of ['Chinese', 'English'] as const) {
  test(`one ${language} address selection covers every line and every character gap in the exported PNG`, async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('/');
    const fixture = await page.evaluate(async language => {
      const canvas = document.createElement('canvas');
      canvas.width = 1600; canvas.height = 1000;
      const ctx = canvas.getContext('2d')!;
      const font = language === 'Chinese'
        ? '44px "WenQuanYi Zen Hei", "Noto Sans CJK SC", "PingFang SC", sans-serif'
        : '44px Arial';
      let cjkRendered = true;
      if (language === 'Chinese') {
        const glyph = document.createElement('canvas'); glyph.width = 70; glyph.height = 70;
        const glyphContext = glyph.getContext('2d')!; glyphContext.font = font;
        const signatures = ['住', '址', '路', '区'].map(character => {
          glyphContext.clearRect(0, 0, 70, 70); glyphContext.fillText(character, 5, 52);
          return Array.from(glyphContext.getImageData(0, 0, 70, 70).data).join(',');
        });
        cjkRendered = new Set(signatures).size === signatures.length;
        glyph.width = glyph.height = 0;
      }
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#111'; ctx.font = font;
      const draw = (text: string, x: number, y: number) => {
        ctx.fillText(text, x, y);
        const measured = ctx.measureText(text);
        return { x: Math.floor(x - measured.actualBoundingBoxLeft - 2),
          y: Math.floor(y - measured.actualBoundingBoxAscent - 2),
          width: Math.ceil(measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight + 4),
          height: Math.ceil(measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent + 4) };
      };
      let addressLines: ReturnType<typeof draw>[];
      let neighbor: ReturnType<typeof draw>;
      if (language === 'Chinese') {
        draw('虚构身份资料', 90, 100);
        draw('姓名：示例甲', 90, 180);
        draw('出生日期：1990年03月12日', 90, 260);
        draw('住 址：', 90, 360);
        addressLines = [draw('广东省示例市示例区', 360, 360),
          draw('虚构路170号2号楼604室', 360, 420)];
        neighbor = draw('电话：555-010-2345', 90, 540);
      } else {
        draw('FICTIONAL CUSTOMER RECORD', 90, 100);
        draw('Name: Alex Morgan', 90, 180);
        draw('Postal address:', 90, 300);
        addressLines = [draw('81 Fictional Road', 90, 360),
          draw('Unit 604, Building 2', 90, 420),
          draw('Example City, ON K1A 0B1', 90, 480)];
        neighbor = draw('Phone: 555-010-2345', 90, 600);
      }
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      canvas.width = canvas.height = 0;
      return { bytes, addressLines, neighbor, cjkRendered };
    }, language);

    expect(fixture.cjkRendered, 'The browser must render distinct Chinese glyphs, not missing-font boxes.').toBe(true);
    await page.locator('input[type=file]').setInputFiles({ name: `fictional-${language.toLowerCase()}-address.png`,
      mimeType: 'image/png', buffer: Buffer.from(fixture.bytes) });
    const selections = page.getByRole('complementary', { name: 'Choose information to hide', exact: true });
    const address = selections.getByRole('checkbox', { name: /postal address/i }).first();
    await expect(address).toBeVisible({ timeout: 90000 });
    await expect(address).not.toBeChecked();
    await expect(page.locator('.px-mask')).toHaveCount(0);
    await address.check();
    await expect(address).toBeChecked();
    await expect(page.locator('.px-mask')).not.toHaveCount(0);

    // This must inspect the actual export pixels: SVG/CSS overlays cannot satisfy it.
    await page.getByRole('button', { name: 'Preview covered image', exact: true }).click();
    const preview = page.getByRole('img', { name: 'Covered PNG preview', exact: true });
    await expect(preview).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download PNG', exact: true })).toBeEnabled();
    const pixels = await preview.evaluate((image: HTMLImageElement, regions) => {
      const original = document.querySelector<HTMLImageElement>('img[alt="Original screenshot for privacy review"]')!;
      const source = document.createElement('canvas'); const result = document.createElement('canvas');
      source.width = result.width = image.naturalWidth; source.height = result.height = image.naturalHeight;
      const sourceContext = source.getContext('2d')!; const resultContext = result.getContext('2d')!;
      sourceContext.drawImage(original, 0, 0); resultContext.drawImage(image, 0, 0);
      const rows = regions.addressLines.map(region => {
        const before = sourceContext.getImageData(region.x, region.y, region.width, region.height).data;
        const after = resultContext.getImageData(region.x, region.y, region.width, region.height).data;
        let ink = 0, maskedInk = 0, minX = region.width, maxX = -1, minY = region.height, maxY = -1;
        for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) {
          const offset = (y * region.width + x) * 4;
          if (before[offset]! < 128 && before[offset + 1]! < 128 && before[offset + 2]! < 128) {
            ink++; minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            if (after[offset] === 0 && after[offset + 1] === 0 && after[offset + 2] === 0 && after[offset + 3] === 255) maskedInk++;
          }
        }
        let gapsCovered = true;
        const middle = Math.floor((minY + maxY) / 2);
        for (let x = minX; x <= maxX; x++) {
          const offset = (middle * region.width + x) * 4;
          if (after[offset] !== 0 || after[offset + 1] !== 0 || after[offset + 2] !== 0 || after[offset + 3] !== 255) gapsCovered = false;
        }
        return { ink, maskedInk, gapsCovered };
      });
      const neighbor = regions.neighbor;
      const before = sourceContext.getImageData(neighbor.x, neighbor.y, neighbor.width, neighbor.height).data;
      const after = resultContext.getImageData(neighbor.x, neighbor.y, neighbor.width, neighbor.height).data;
      const neighborUnchanged = before.every((value, index) => value === after[index]);
      const dimensions = [image.naturalWidth, image.naturalHeight];
      source.width = source.height = result.width = result.height = 0;
      return { rows, neighborUnchanged, dimensions };
    }, { addressLines: fixture.addressLines, neighbor: fixture.neighbor });
    await test.info().attach(`fictional-${language.toLowerCase()}-address-pixels.json`, {
      contentType: 'application/json', body: JSON.stringify(pixels),
    });
    expect(pixels.dimensions).toEqual([1600, 1000]);
    pixels.rows.forEach((row, index) => {
      expect(row.ink, `Fixture address line ${index + 1} must contain actual text.`).toBeGreaterThan(100);
      expect(row.maskedInk, `Every text pixel on address line ${index + 1} must be covered.`).toBe(row.ink);
      expect(row.gapsCovered, `Address line ${index + 1} must use continuous coverage, including spaces.`).toBe(true);
    });
    expect(pixels.neighborUnchanged, 'Selecting an address must not cover the neighboring phone field.').toBe(true);
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PNG', exact: true }).click();
    expect((await downloading).suggestedFilename()).toMatch(/\.png$/);
    await page.screenshot({ path: test.info().outputPath(`fictional-${language.toLowerCase()}-multiline-address.png`), fullPage: true });
    await address.uncheck();
    await expect(page.locator('.px-mask')).toHaveCount(0);
    await expect(preview).toHaveCount(0);
  });
}
