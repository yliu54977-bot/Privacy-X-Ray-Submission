import { expect, test } from '@playwright/test';

type Expected = { type: string; x: number; y: number; width: number; height: number };
type Fixture = { name: string; width: number; height: number; lines: { text: string; x: number; y: number;
  font: string; color: string; expected?: { type: string; value: string }[] }[] };

const fixtures: Fixture[] = [
  { name: 'tuition with same-line fields', width: 1500, height: 800, lines: [
    { text: 'Student ID: S1234567     Bank Account No: 1234 5678 9012', x: 35, y: 95,
      font: '30px Arial', color: '#172033', expected: [
        { type: 'student_id', value: 'S1234567' }, { type: 'bank_account_number', value: '1234 5678 9012' }] },
    { text: 'Payment Amount: $1,234.56     Email: student@example.test', x: 35, y: 170,
      font: '30px Arial', color: '#172033', expected: [
        { type: 'payment_amount', value: '$1,234.56' }, { type: 'email', value: 'student@example.test' }] },
    { text: 'Home Address: 123 Fictional Lane', x: 35, y: 245, font: '30px Arial', color: '#172033',
      expected: [{ type: 'home_address', value: '123 Fictional Lane' }] },
    { text: 'Reference: 99238811888', x: 35, y: 320, font: '30px Arial', color: '#172033' },
  ] },
  { name: 'order with split labels and aliases', width: 1300, height: 850, lines: [
    { text: 'Order No.', x: 40, y: 90, font: '29px Arial', color: '#111827' },
    { text: 'ORD-482913', x: 40, y: 130, font: '29px Arial', color: '#111827',
      expected: [{ type: 'order_number', value: 'ORD-482913' }] },
    { text: 'Shipping Address', x: 40, y: 220, font: '29px Arial', color: '#111827' },
    { text: '45 Example Road', x: 40, y: 260, font: '29px Arial', color: '#111827',
      expected: [{ type: 'shipping_address', value: '45 Example Road' }] },
    { text: 'Mobile No.: 416-555-0142', x: 40, y: 350, font: '29px Arial', color: '#111827',
      expected: [{ type: 'phone', value: '416-555-0142' }] },
    { text: 'Total Amount: $42.50', x: 40, y: 440, font: '29px Arial', color: '#111827',
      expected: [{ type: 'unknown', value: '$42.50' }] },
  ] },
  { name: 'small low-contrast two-column mixed-language', width: 1500, height: 800, lines: [
    { text: '订单号: ORD-775531', x: 55, y: 90, font: '24px Arial, sans-serif', color: '#777777',
      expected: [{ type: 'order_number', value: 'ORD-775531' }] },
    { text: '支付金额: ¥88.00', x: 55, y: 150, font: '24px Arial, sans-serif', color: '#777777',
      expected: [{ type: 'payment_amount', value: '¥88.00' }] },
    { text: 'E mail: bilingual@example.test', x: 720, y: 90, font: '20px Arial', color: '#777777',
      expected: [{ type: 'email', value: 'bilingual@example.test' }] },
    { text: 'Tel: 416-555-0199', x: 720, y: 150, font: '20px Arial', color: '#777777',
      expected: [{ type: 'phone', value: '416-555-0199' }] },
    { text: 'Unlabeled: 123456789012', x: 55, y: 225, font: '20px Arial', color: '#777777' },
  ] },
  { name: 'two-column split values', width: 1400, height: 600, lines: [
    { text: 'Student ID', x: 40, y: 90, font: '27px Arial', color: '#172033' },
    { text: 'Order No.', x: 720, y: 90, font: '27px Arial', color: '#172033' },
    { text: 'S7654321', x: 40, y: 130, font: '27px Arial', color: '#172033',
      expected: [{ type: 'student_id', value: 'S7654321' }] },
    { text: 'ORD-339944', x: 720, y: 130, font: '27px Arial', color: '#172033',
      expected: [{ type: 'order_number', value: 'ORD-339944' }] },
  ] },
  { name: 'label variants and repeated fields', width: 1400, height: 600, lines: [
    { text: 'Acct #: 112233445566     Student I D: S9988776', x: 35, y: 90,
      font: '28px Arial', color: '#182332', expected: [
        { type: 'bank_account_number', value: '112233445566' },
        { type: 'student_id', value: 'S9988776' }] },
    { text: 'Order ID: ORD-551122     Order No.: ORD-551123', x: 35, y: 165,
      font: '28px Arial', color: '#182332', expected: [
        { type: 'order_number', value: 'ORD-551122' },
        { type: 'order_number', value: 'ORD-551123' }] },
    { text: 'Billing Address: 8 Sample Street', x: 35, y: 240,
      font: '28px Arial', color: '#182332',
      expected: [{ type: 'billing_address', value: '8 Sample Street' }] },
  ] },
  { name: 'negative unlabeled numbers and ordinary text', width: 1200, height: 500, lines: [
    { text: 'Reference 999988887777', x: 40, y: 95, font: '28px Arial', color: '#192334' },
    { text: 'Meeting at 416-555-0150', x: 40, y: 165, font: '28px Arial', color: '#192334' },
    { text: '45 Example Road', x: 40, y: 235, font: '28px Arial', color: '#192334' },
    { text: 'The total is 42.50', x: 40, y: 305, font: '28px Arial', color: '#192334' },
  ] },
];

test('annotated fictional OCR benchmark reports detection precision, recall and original geometry', async ({ page }) => {
  test.setTimeout(240_000);
  const requests: { url: string; method: string; body: string | null }[] = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method(), body: request.postData() }));
  await page.goto('/');
  const measures: { name: string; tp: number; fp: number; fn: number; ocrWords: number;
    expected: number; found: number; missedTypes: string[]; foundTypes: string[];
    baselineTp: number; baselineFp: number; baselineFn: number;
    legacyOcrTp?: number; legacyOcrFn?: number }[] = [];
  for (const fixture of fixtures) {
    const result = await page.evaluate(async fixture => {
      const canvas = document.createElement('canvas');
      canvas.width = fixture.width; canvas.height = fixture.height;
      const context = canvas.getContext('2d')!;
      context.fillStyle = fixture.name.includes('low-contrast') ? '#bcbcbc' : '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const expected: Expected[] = [];
      for (const line of fixture.lines) {
        context.font = line.font; context.fillStyle = line.color;
        context.fillText(line.text, line.x, line.y);
        for (const item of line.expected ?? []) {
          const start = line.text.indexOf(item.value);
          const before = context.measureText(line.text.slice(0, start)).width;
          expected.push({ type: item.type, x: line.x + before - 3,
            y: line.y - Number.parseInt(line.font, 10) - 6,
            width: context.measureText(item.value).width + 6,
            height: Number.parseInt(line.font, 10) + 15 });
        }
      }
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        value => value ? resolve(value) : reject(new Error('Fixture creation failed')), 'image/png'));
      const file = new File([blob], `${fixture.name}.png`, { type: 'image/png' });
      const url = URL.createObjectURL(file);
      try {
        const scanPath = '/src/v2/detection/scanImageV2.ts';
        const detectPath = '/src/v2/detection/detectUniversalPrivacy.ts';
        const baselinePath = '/src/features/ocr/extractPrivacyFields.ts';
        const { scanImageV2 } = await import(/* @vite-ignore */ scanPath);
        const { detectUniversalPrivacy } = await import(/* @vite-ignore */ detectPath);
        const { extractPrivacyFields } = await import(/* @vite-ignore */ baselinePath);
        const localImage = { id: fixture.name, file, previewUrl: url,
          width: canvas.width, height: canvas.height, mimeType: 'image/png' as const };
        const ocr = await scanImageV2(localImage,
        () => {}, new AbortController().signal);
        const output = await detectUniversalPrivacy({ imageId: fixture.name,
          imageWidth: canvas.width, imageHeight: canvas.height, ocr });
        let legacyOcrFindings: { type?: string; boxes: Expected[] }[] | undefined;
        if (fixture.name.includes('low-contrast')) {
          const legacyPath = '/src/features/ocr/scanImage.ts';
          const { scanImage } = await import(/* @vite-ignore */ legacyPath);
          const legacyOcr = await scanImage(localImage, () => {}, new AbortController().signal);
          const legacyOutput = await detectUniversalPrivacy({ imageId: fixture.name,
            imageWidth: canvas.width, imageHeight: canvas.height, ocr: legacyOcr });
          legacyOcrFindings = legacyOutput.findings.map((finding: { typeId?: string; boxes?: Expected[] }) =>
            ({ type: finding.typeId, boxes: finding.boxes ?? [] }));
        }
        return { expected, ocrWords: ocr.words.length,
          legacyOcrFindings,
          baseline: extractPrivacyFields(ocr).map((field: {type:string;boxes:Expected[]}) =>
            ({ type: field.type, boxes: field.boxes })),
          findings: output.findings.map((finding: { typeId?: string; boxes?: Expected[] }) =>
            ({ type: finding.typeId, boxes: finding.boxes ?? [] })) };
      } finally { URL.revokeObjectURL(url); }
    }, fixture);
    const score = (findings: { type?: string; boxes: Expected[] }[]) => {
      const used = new Set<number>();
      const missedTypes: string[] = [];
      for (const item of result.expected) {
        const index = findings.findIndex((finding, i) => !used.has(i) &&
          (finding.type ?? 'unknown') === item.type &&
          finding.boxes.some(box => {
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            return cx >= item.x - 25 && cx <= item.x + item.width + 25 &&
              cy >= item.y - 18 && cy <= item.y + item.height + 18;
          }));
        if (index >= 0) used.add(index);
        else missedTypes.push(item.type);
      }
      return { tp: used.size, fp: findings.length - used.size,
        fn: result.expected.length - used.size, missedTypes };
    };
    const current = score(result.findings);
    const baseline = score(result.baseline);
    const legacyOcr = result.legacyOcrFindings ? score(result.legacyOcrFindings) : undefined;
    measures.push({ name: fixture.name, ...current, ocrWords: result.ocrWords,
      expected: result.expected.length, found: result.findings.length,
      foundTypes: result.findings.map(finding => finding.type ?? 'unknown'),
      baselineTp: baseline.tp, baselineFp: baseline.fp, baselineFn: baseline.fn,
      ...(legacyOcr ? { legacyOcrTp: legacyOcr.tp, legacyOcrFn: legacyOcr.fn } : {}) });
    expect(result.findings.every(finding => finding.boxes.every(box => box.x >= 0 && box.y >= 0 &&
      box.x + box.width <= fixture.width && box.y + box.height <= fixture.height))).toBe(true);
  }
  const totals = measures.reduce((sum, measure) => ({ tp: sum.tp + measure.tp,
    fp: sum.fp + measure.fp, fn: sum.fn + measure.fn }), { tp: 0, fp: 0, fn: 0 });
  const baseline = measures.reduce((sum, measure) => ({ tp: sum.tp + measure.baselineTp,
    fp: sum.fp + measure.baselineFp, fn: sum.fn + measure.baselineFn }), { tp: 0, fp: 0, fn: 0 });
  console.log('Fictional OCR benchmark:', JSON.stringify({ fixtures: measures,
    baselinePrecision: baseline.tp / (baseline.tp + baseline.fp),
    baselineRecall: baseline.tp / (baseline.tp + baseline.fn),
    precision: totals.tp / (totals.tp + totals.fp), recall: totals.tp / (totals.tp + totals.fn) }));
  expect(requests.filter(request => /^https?:/.test(request.url) &&
    (request.method !== 'GET' || request.body || !request.url.startsWith('http://127.0.0.1:4173/')))).toEqual([]);
  expect(requests.some(request => request.url.endsWith('/ocr/chi_sim.traineddata.gz'))).toBe(true);
  expect(requests.some(request => request.url.endsWith('/ocr/eng.traineddata.gz'))).toBe(true);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: (await indexedDB.databases()).length }))).toEqual({ local: 0, session: 0, databases: 0 });
  expect(totals.tp / (totals.tp + totals.fp)).toBeGreaterThanOrEqual(0.9);
  expect(totals.tp / (totals.tp + totals.fn)).toBeGreaterThanOrEqual(0.8);
});
