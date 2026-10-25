import { expect, test } from '@playwright/test';

test('v2 detectors run locally on fictional OCR text with explicit coverage limits', async ({ page }) => {
  test.setTimeout(90000);
  const requests: { url: string; method: string; body: string | null }[] = [];
  const consoleMessages: string[] = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  page.on('console', message => consoleMessages.push(message.text()));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 320;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'black'; context.font = '36px Arial';
    context.fillText('API Key: sk_test_123456789ABC', 40, 95);
    context.fillText('Password: FictionalPass42', 40, 165);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error('Sample generation failed')), 'image/png'));
    const file = new File([blob], 'fictional-credentials.png', { type: 'image/png' });
    const url = URL.createObjectURL(file);
    try {
      const scanPath = '/src/features/ocr/scanImage.ts';
      const detectPath = '/src/v2/detection/detectUniversalPrivacy.ts';
      const { scanImage } = await import(/* @vite-ignore */ scanPath);
      const { detectUniversalPrivacy } = await import(/* @vite-ignore */ detectPath);
      const ocr = await scanImage({ id: 'fictional-v2', file, previewUrl: url,
        width: canvas.width, height: canvas.height, mimeType: 'image/png' },
      () => {}, new AbortController().signal);
      const detection = await detectUniversalPrivacy({ imageId: 'fictional-v2',
        imageWidth: canvas.width, imageHeight: canvas.height, ocr });
      return { text: ocr.text, findings: detection.findings.map((finding: { typeId?: string; boxes?: { x: number; y: number; width: number; height: number }[] }) =>
        ({ typeId: finding.typeId, boxes: finding.boxes })), coverage: detection.coverage };
    } finally { URL.revokeObjectURL(url); }
  });
  expect(result.findings.map(finding => finding.typeId)).toContain('api_key');
  expect(result.findings.map(finding => finding.typeId)).toContain('password');
  expect(result.findings.every(finding => finding.boxes?.every(box => box.x >= 0 && box.y >= 0 &&
    box.x + box.width <= 1200 && box.y + box.height <= 320))).toBe(true);
  expect(result.coverage.areas.find((area: { family: string }) => area.family === 'visual_object').status)
    .toBe('uninspected');
  expect(requests.filter(request => /^https?:/.test(request.url) &&
    (request.method !== 'GET' || request.body || !request.url.startsWith('http://127.0.0.1:4173/')))).toEqual([]);
  expect(consoleMessages.join(' ')).not.toMatch(/sk_test_123456789ABC|FictionalPass42/);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, databases: 0 });
});
