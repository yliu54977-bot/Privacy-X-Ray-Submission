import { expect, test } from '@playwright/test';

const materials = [
  { name: 'identity document', lines: ['PASSPORT', 'Name: ALEX MORGAN', 'Passport number: P8273649', 'DOB: 1990-03-12'], finding: /passport number/i },
  { name: 'banking statement', lines: ['BANK STATEMENT', 'Credit card number: 4111 1111 1111 1111', 'IBAN: DE89370400440532013000', 'Salary: $6500.00'], finding: /payment card number/i },
  { name: 'shipping invoice', lines: ['INVOICE', 'Tracking number: TRK8273649', 'Address: 81 Fictional Road', 'customer@fictional.test'], finding: /tracking or shipping identifier/i },
  { name: 'travel booking', lines: ['BOARDING PASS', 'PNR: ABC731', 'Ticket number: 1234567890123', 'Destination: Fictional City'], finding: /travel booking or ticket identifier/i },
  { name: 'medical record', lines: ['MEDICAL RECORD', 'Patient ID: MED8273649', 'Diagnosis: Fictional example condition', 'Medication: Fictional example medicine'], finding: /patient or health identifier/i },
  { name: 'payroll', lines: ['PAYROLL', 'Employee ID: EMP8273649', 'Salary: $6500.00', 'employee@fictional.test'], finding: /employee identifier/i },
  { name: 'legal and insurance', lines: ['INSURANCE CONTRACT', 'Policy number: POL8273649', 'Case number: CASE8273649', 'Contract number: CNT8273649'], finding: /insurance policy identifier/i },
  { name: 'communication screenshot', lines: ['MESSAGES', 'Username: fictional_morgan', 'Subject: Fictional private message', 'contact@fictional.test'], finding: /account or messaging handle/i },
  { name: 'credentials and terminal', lines: ['TERMINAL', 'Access token: abcdef1234567890token', 'WiFi password: fictional-network-pass', 'Host 192.168.10.3'], finding: /access secret/i },
  { name: 'business research', lines: ['CONFIDENTIAL RESEARCH', 'Participant ID: STUDY8273649', 'Revenue: $950000', 'Budget: $65000'], finding: /research participant identifier/i },
];

for (const material of materials) test(`real local OCR reviews ${material.name}`, async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?review=advanced');
  const bytes = await page.evaluate(async lines => {
    const canvas = document.createElement('canvas'); canvas.width = 1500; canvas.height = 650;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1500, 650); ctx.fillStyle = '#111'; ctx.font = '34px Arial';
    lines.forEach((line, i) => ctx.fillText(line, 50, 80 + i * 85));
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  }, material.lines);
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional-material.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
  await page.getByRole('button', { name: 'Scan for Sensitive Information', exact: true }).click();
  const review = page.getByRole('region', { name: 'Universal information review', exact: true });
  await expect(review.getByRole('article', { name: material.finding }).first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('region', { name: 'Material recognition coverage', exact: true })).toContainText('Possible material');
  await review.getByRole('button', { name: /Mask matching located findings/ }).click();
  await expect(page.locator('.px-mask').first()).toBeVisible();
  await page.getByRole('button', { name: 'Generate final PNG preview', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Final redacted PNG for v2 review', exact: true })).toBeVisible();
});

test('real local model locates a public test portrait and redacts actual face pixels', async ({ page }) => {
  test.setTimeout(90000);
  const outgoing: { url: string; method: string }[] = [];
  page.on('request', request => outgoing.push({ url: request.url(), method: request.method() }));
  await page.goto('/?review=advanced');
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/public-face-portrait.jpg');
  await page.getByRole('button', { name: 'Scan for Sensitive Information', exact: true }).click();
  const review = page.getByRole('region', { name: 'Universal information review', exact: true });
  await expect(review.getByRole('article', { name: 'Possible face region', exact: true }).first()).toBeVisible({ timeout: 60000 });
  await review.getByRole('button', { name: /Mask matching located findings/ }).click();
  const box = await page.locator('.px-mask').first().evaluate(element => ({ x: Number(element.getAttribute('x')),
    y: Number(element.getAttribute('y')), width: Number(element.getAttribute('width')), height: Number(element.getAttribute('height')) }));
  await page.getByRole('button', { name: 'Generate final PNG preview', exact: true }).click();
  const preview = page.getByRole('img', { name: 'Final redacted PNG for v2 review', exact: true });
  await expect(preview).toBeVisible();
  const pixel = await preview.evaluate((img: HTMLImageElement, box) => {
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(Math.floor(box.x + box.width / 2), Math.floor(box.y + box.height / 2), 1, 1).data);
  }, box);
  expect(pixel).toEqual([0, 0, 0, 255]);
  expect(outgoing.filter(request => /^https?:/.test(request.url) &&
    (!request.url.startsWith('http://127.0.0.1:4173/') || request.method !== 'GET'))).toEqual([]);
  await page.getByRole('slider', { name: 'Reveal redacted image', exact: true }).press('End');
  await page.getByRole('region', { name: 'Final image review', exact: true }).screenshot({ path: test.info().outputPath('local-face-redaction.png') });
});

function fictionalPdf() {
  const pages = ['Name: Alex Morgan', 'Patient ID: MED8273649'];
  const objects: string[] = [ '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>' ];
  for (let i = 0; i < 2; i++) {
    const content = `BT /F1 28 Tf 40 250 Td (${pages[i]}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 7 0 R >> >> /Contents ${4 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let output = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(output)); output += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  return Buffer.from(output + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
}

test('PDF imports selected pages locally and never presents the whole source PDF as redacted', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/?review=advanced');
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional-two-pages.pdf', mimeType: 'application/pdf', buffer: fictionalPdf() });
  const pageControl = page.getByRole('region', { name: 'PDF page selection', exact: true });
  await expect(pageControl).toContainText('PDF page 1 of 2', { timeout: 20000 });
  await expect(pageControl).toContainText('Other pages and the original PDF have not been redacted');
  await page.getByRole('button', { name: 'Scan for Sensitive Information', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Possible person name', exact: true })).toBeVisible({ timeout: 60000 });
  await pageControl.getByRole('spinbutton', { name: 'Page number', exact: true }).fill('2');
  page.once('dialog', dialog => dialog.accept());
  await pageControl.getByRole('button', { name: 'Open selected page', exact: true }).click();
  await expect(pageControl).toContainText('PDF page 2 of 2');
  await expect(page.getByRole('article', { name: 'Possible person name', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Scan for Sensitive Information', exact: true }).click();
  await expect(page.getByRole('article', { name: /patient or health identifier/i })).toBeVisible({ timeout: 60000 });
});

test('WebP is frozen into a PNG image with stable original coordinates', async ({ page }) => {
  await page.goto('/?review=advanced');
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 640, 360);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/webp'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('input[type=file]').setInputFiles({ name: 'fictional.webp', mimeType: 'image/webp', buffer: Buffer.from(bytes) });
  const image = page.getByRole('img', { name: 'Original screenshot for privacy review', exact: true });
  await expect(image).toBeVisible();
  expect(await image.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([640, 360]);
});

test('visual model failure preserves text findings and reports incomplete inspection', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/vision/blaze_face_short_range.tflite', route => route.abort());
  await page.route('**/vision/face-cpu/**', route => route.abort());
  await page.goto('/?review=advanced'); await page.getByRole('button', { name: 'Try tuition sample', exact: true }).click();
  await page.getByRole('button', { name: 'Scan for Sensitive Information', exact: true }).click();
  await expect(page.getByRole('article', { name: /Bank Account Number/i }).first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('complementary', { name: 'Inspection coverage', exact: true })).toContainText('Browser-local face regions could not complete');
});
