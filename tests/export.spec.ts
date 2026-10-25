import { test, expect } from '@playwright/test';

for (const [width, height] of [[17, 11], [600, 1000], [2048, 1024]]) {
  test(`real PNG pixels at ${width} × ${height}`, async ({ page }) => {
    await page.goto('/?review=advanced'); await page.getByRole('button', { name: 'Classic review', exact: true }).click();
    const result = await page.evaluate(async ({ width, height }) => {
      // Vite serves the real module; no mocked Canvas or encoder.
      // @ts-expect-error Browser-only module URL.
      const { redactImage } = await import('/src/features/export/redactImage.ts');
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ee6633'; ctx.fillRect(0, 0, width, height);
      ctx.clearRect(width - 1, 0, 1, 1); // Preserve unmasked transparency.
      const input = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
      const file = new File([input], 'fictional.png', { type: 'image/png' });
      const before = Array.from(new Uint8Array(await file.arrayBuffer()));
      const image = Object.freeze({ id: 'image', file, previewUrl: 'unused', width, height, mimeType: 'image/png' });
      const masks = Object.freeze([
        Object.freeze({ id: 'one', imageId: 'image', source: 'manual', shouldRedact: true, x: 1.2, y: 2.2, width: 3.1, height: 2.1 }),
        Object.freeze({ id: 'overlap', imageId: 'image', source: 'recommendation', fieldId: 'field', shouldRedact: true, x: 3, y: 3, width: 3, height: 3 }),
        Object.freeze({ id: 'edge', imageId: 'image', source: 'manual', shouldRedact: true, x: width - 0.5, y: height - 0.5, width: 20, height: 20 }),
        Object.freeze({ id: 'inactive', imageId: 'image', source: 'manual', shouldRedact: false, x: 7, y: 7, width: 2, height: 2 }),
        Object.freeze({ id: 'outside', imageId: 'image', source: 'manual', shouldRedact: true, x: -0.8, y: -0.8, width: 0.2, height: 0.2 }),
      ]);
      const blob = await redactImage(image, masks);
      const bitmap = await createImageBitmap(blob);
      ctx.clearRect(0, 0, width, height); ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, width, height).data;
      let mismatches = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const masked = (x >= 1 && x < 5 && y >= 2 && y < 5) ||
          (x >= 3 && x < 6 && y >= 3 && y < 6) || (x === width - 1 && y === height - 1);
        const expected = masked ? [0, 0, 0, 255] : x === width - 1 && y === 0 ? [0, 0, 0, 0] : [238, 102, 51, 255];
        const offset = (y * width + x) * 4;
        if (expected.some((value, channel) => pixels[offset + channel] !== value)) mismatches++;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const chunks: string[] = [];
      const view = new DataView(bytes.buffer);
      for (let i = 8; i < bytes.length;) {
        const size = view.getUint32(i); chunks.push(String.fromCharCode(...bytes.slice(i + 4, i + 8))); i += size + 12;
      }
      const unchanged = JSON.stringify(before) === JSON.stringify(Array.from(new Uint8Array(await file.arrayBuffer())));
      const dimensions = [bitmap.width, bitmap.height]; bitmap.close();
      return { mismatches, dimensions, unchanged, type: blob.type, chunks };
    }, { width, height });
    expect(result.dimensions).toEqual([width, height]);
    expect(result.type).toBe('image/png');
    expect(result.mismatches).toBe(0);
    expect(result.unchanged).toBe(true);
    expect(result.chunks).not.toContain('eXIf');
    expect(result.chunks).not.toContain('tEXt');
    expect(result.chunks).not.toContain('iTXt');
  });
}

test('decoder, dimension, Canvas and encoding errors reject export and release owned URLs', async ({ page }) => {
  await page.goto('/?review=advanced'); await page.getByRole('button', { name: 'Classic review', exact: true }).click();
  const results = await page.evaluate(async () => {
    // @ts-expect-error Browser-only module URL.
    const { redactImage } = await import('/src/features/export/redactImage.ts');
    const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 10;
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    const image = { id: 'image', file: new File([blob], 'fictional.png', { type: 'image/png' }), previewUrl: 'A-owned', width: 20, height: 10, mimeType: 'image/png' };
    const originalRevoke = URL.revokeObjectURL, originalContext = HTMLCanvasElement.prototype.getContext, originalEncode = HTMLCanvasElement.prototype.toBlob;
    const revoked: string[] = [];
    URL.revokeObjectURL = (url) => { revoked.push(url); originalRevoke(url); };
    const rejected: boolean[] = [];
    async function run(input = image) { try { await redactImage(input, []); rejected.push(false); } catch { rejected.push(true); } }
    try {
      await run({ ...image, file: new File(['invalid'], 'bad.png', { type: 'image/png' }) });
      await run({ ...image, width: 19 });
      HTMLCanvasElement.prototype.getContext = (() => null) as typeof originalContext;
      await run(); HTMLCanvasElement.prototype.getContext = originalContext;
      HTMLCanvasElement.prototype.toBlob = (cb) => cb(null);
      await run();
      HTMLCanvasElement.prototype.toBlob = () => { throw new Error('encoder failed'); };
      await run();
    } finally {
      URL.revokeObjectURL = originalRevoke; HTMLCanvasElement.prototype.getContext = originalContext; HTMLCanvasElement.prototype.toBlob = originalEncode;
    }
    return { rejected, revokedCount: revoked.length, revokedOriginal: revoked.includes('A-owned') };
  });
  expect(results).toEqual({ rejected: [true, true, true, true, true], revokedCount: 5, revokedOriginal: false });
});

test('manual workflow downloads the exact reviewed PNG and invalidates it after editing', async ({ page }) => {
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await page.goto('/?review=advanced'); await page.getByRole('button', { name: 'Classic review', exact: true }).click();
  await page.getByRole('button', { name: 'Try tuition sample' }).click();
  // This is a real local File selection, using a fictional browser-generated fixture.
  const fixture = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 500; c.height = 300;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#ee6633'; ctx.fillRect(0, 0, 500, 300);
    const b = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  });
  await page.getByRole('button', { name: 'New Image', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional.png', mimeType: 'image/png', buffer: Buffer.from(fixture) });
  // Editor's SVG is the exact original-image content viewport.
  const svg = page.locator('.px-editor svg').first();
  const box = await svg.boundingBox(); expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * .1, box!.y + box!.height * .1);
  await page.mouse.down(); await page.mouse.move(box!.x + box!.width * .4, box!.y + box!.height * .4); await page.mouse.up();
  await page.getByRole('button', { name: 'Review redacted image' }).click();
  const preview = page.getByRole('img', { name: 'Final redacted PNG' });
  await expect(preview).toBeVisible();
  const reviewedUrl = await preview.getAttribute('src');
  const reviewedBytes = await page.evaluate(async (url) => Array.from(new Uint8Array(await (await fetch(url!)).arrayBuffer())), reviewedUrl);
  await expect(page.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /I reviewed the final PNG/ }).check();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('redacted.png');
  const stream = await download.createReadStream(); const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Array.from(Buffer.concat(chunks))).toEqual(reviewedBytes);
  const pixel = await preview.evaluate(async (img: HTMLImageElement) => {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
    return { size: [c.width, c.height], masked: Array.from(ctx.getImageData(100, 60, 1, 1).data), visible: Array.from(ctx.getImageData(450, 250, 1, 1).data) };
  });
  expect(pixel).toEqual({ size: [500, 300], masked: [0, 0, 0, 255], visible: [238, 102, 51, 255] });
  // Adding a second independent mask invalidates both the preview and confirmation.
  await page.getByRole('button', { name: 'Add Mask', exact: true }).click();
  await svg.scrollIntoViewIfNeeded();
  const nextBox = (await svg.boundingBox())!;
  await page.mouse.move(nextBox.x + nextBox.width * .7, nextBox.y + nextBox.height * .7);
  await page.mouse.down(); await page.mouse.move(nextBox.x + nextBox.width * .9, nextBox.y + nextBox.height * .9); await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download PNG' })).toHaveCount(0);
  expect(requests.filter((r) => /^https?:/.test(r.url) && (r.method !== 'GET' || r.body))).toEqual([]);
  expect(requests.filter((r) => /^https?:/.test(r.url) && !r.url.startsWith('http://127.0.0.1:4173/'))).toEqual([]);
});

test('zero-mask download requires explicit warning confirmation', async ({ page }) => {
  await page.goto('/?review=advanced'); await page.getByRole('button', { name: 'Classic review', exact: true }).click(); await page.getByRole('button', { name: 'Try order sample' }).click();
  await page.getByRole('button', { name: 'Review redacted image' }).click();
  await page.getByRole('checkbox', { name: /I reviewed the final PNG/ }).check();
  let downloads = 0; page.on('download', () => downloads++);
  await page.getByRole('button', { name: 'Download PNG' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No Redactions Selected' })).toBeVisible();
  await page.getByRole('button', { name: 'Go Back' }).click();
  expect(downloads).toBe(0);
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Without Redactions' }).click();
  expect((await promise).suggestedFilename()).toBe('redacted.png');
});

test('JPEG orientation matches A loader and PNG drops source EXIF', async ({ page }) => {
  await page.goto('/?review=advanced'); await page.getByRole('button', { name: 'Classic review', exact: true }).click();
  const result = await page.evaluate(async () => {
    // @ts-expect-error Browser-only module URL.
    const { loadImage } = await import('/src/features/image/loadImage.ts');
    // @ts-expect-error Browser-only module URL.
    const { redactImage } = await import('/src/features/export/redactImage.ts');
    const c = document.createElement('canvas'); c.width = 20; c.height = 10;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#ee6633'; ctx.fillRect(0, 0, 20, 10);
    const jpeg = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 1));
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    // Fictional EXIF orientation 6 (90 degrees clockwise), little-endian TIFF.
    const exif = new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
    const file = new File([bytes.slice(0,2), exif, bytes.slice(2)], 'fictional.jpg', { type: 'image/jpeg' });
    const image = await loadImage(file);
    try {
      const output = await redactImage(image, [{ id: 'mask', imageId: image.id, source: 'manual', shouldRedact: true, x: 0, y: 0, width: 2, height: 2 }]);
      const bitmap = await createImageBitmap(output);
      c.width = bitmap.width; c.height = bitmap.height; ctx.drawImage(bitmap, 0, 0);
      const result = { loaded: [image.width, image.height], exported: [bitmap.width, bitmap.height], masked: Array.from(ctx.getImageData(0, 0, 1, 1).data), exif: new TextDecoder().decode(await output.arrayBuffer()).includes('eXIf') };
      bitmap.close(); return result;
    } finally { URL.revokeObjectURL(image.previewUrl); }
  });
  expect(result).toEqual({ loaded: [10,20], exported: [10,20], masked: [0,0,0,255], exif: false });
});

test('review guards block PNG during OCR and after linked-mask deletion', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/?review=advanced'); await page.getByRole('button', { name: 'Classic review', exact: true }).click(); await page.getByRole('button', { name: 'Try tuition sample' }).click();
  await page.getByRole('button', { name: 'Review redacted image' }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toBeVisible();
  await page.getByRole('button', { name: 'Scan for Sensitive Information' }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review redacted image' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Scan for Sensitive Information' })).toBeEnabled({ timeout: 45000 });
  await expect(page.getByRole('button', { name: 'Review redacted image' })).toBeDisabled();
  const masks = page.getByRole('button', { name: 'Mask information', exact: true });
  const count = await masks.count(); expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) await masks.nth(i).click();
  await page.getByRole('button', { name: 'Review redacted image' }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toBeVisible();
  await page.getByRole('button', { name: 'Select / Edit', exact: true }).click();
  // B's mask region list is the accessible selection route; select the first linked region.
  const regions = page.getByLabel('Mask regions');
  await regions.getByRole('button').first().click();
  await page.getByRole('button', { name: 'Delete Selected', exact: true }).click();
  await expect(page.getByText('Suggested mask removed. Choose whether to keep this information visible or mask it.', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review redacted image' })).toBeDisabled();
});

test('in-flight PNG is discarded after context revision changes', async ({ page }) => {
  await page.goto('/?review=advanced'); await page.getByRole('button', { name: 'Classic review', exact: true }).click(); await page.getByRole('button', { name: 'Try order sample' }).click();
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      original.call(this, (blob) => window.setTimeout(() => callback(blob), 1500), type, quality);
    };
  });
  await page.getByRole('button', { name: 'Review redacted image' }).click();
  await expect(page.getByRole('button', { name: 'Creating PNG…' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Sharing context' }).selectOption('public_sharing');
  await page.waitForTimeout(1700); // Wait for the deliberately delayed old encoder callback.
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download PNG' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review redacted image' }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /I reviewed the final PNG/ })).not.toBeChecked();
});
