import { expect, test } from '@playwright/test';

type Case = { name: string; width: number; height: number; font: string; color: string;
  rotated?: boolean; lines: { text: string; value?: string; type?: string; x: number; y: number }[] };
const cases: Case[] = [
  { name: 'dense_table', width: 1250, height: 600, font: '18px Arial', color: '#293344', lines: [
    { text: 'Customer Name: Ada Example', value: 'Ada Example', type: 'person_name', x: 35, y: 80 },
    { text: 'Date of Birth: 2001-02-28', value: '2001-02-28', type: 'date_of_birth', x: 35, y: 130 },
    { text: 'Transaction Ref: TXN-482913', value: 'TXN-482913', type: 'transaction_reference', x: 625, y: 80 },
    { text: 'Booking Reference: BK-778899', value: 'BK-778899', type: 'booking_reference', x: 625, y: 130 },
    { text: 'Reference: 1234567890', x: 35, y: 210 },
  ] },
  { name: 'configuration', width: 1350, height: 560, font: '26px Arial', color: '#222222', lines: [
    { text: 'Device ID: DV-99887766', value: 'DV-99887766', type: 'device_identifier', x: 40, y: 90 },
    { text: 'Server IP: 192.168.1.25', value: '192.168.1.25', type: 'server_address', x: 40, y: 155 },
    { text: 'API Key: sk_test_123456789ABC', value: 'sk_test_123456789ABC', type: 'api_key', x: 40, y: 220 },
    { text: 'Unlabeled: 987654321987', x: 40, y: 290 },
  ] },
  { name: 'rotated_booking', width: 900, height: 450, font: '32px Arial', color: '#161616', rotated: true, lines: [
    { text: 'Booking Reference: BK-778899', value: 'BK-778899', type: 'booking_reference', x: 45, y: 95 },
    { text: 'Transaction Ref: TXN-482913', value: 'TXN-482913', type: 'transaction_reference', x: 45, y: 170 },
  ] },
  { name: 'negative_unknown', width: 1100, height: 450, font: '28px Arial', color: '#333333', lines: [
    { text: 'Name: Ada Example', x: 40, y: 85 },
    { text: 'Reference 999988887777', x: 40, y: 145 },
    { text: 'Meeting: 2001-02-28', x: 40, y: 205 },
    { text: 'Server IP: 999.999.999.999', x: 40, y: 265 },
  ] },
];

test('fictional advanced benchmark separates OCR and field extraction outcomes', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  const measures = [];
  for (const fixture of cases) {
    const result = await page.evaluate(async fixture => {
      const source = document.createElement('canvas');
      source.width = fixture.width; source.height = fixture.height;
      const ctx = source.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, source.width, source.height);
      ctx.font = fixture.font; ctx.fillStyle = fixture.color;
      const expected: { type: string; x: number; y: number; width: number; height: number }[] = [];
      for (const line of fixture.lines) {
        ctx.fillText(line.text, line.x, line.y);
        if (!line.value || !line.type) continue;
        const size = Number.parseInt(fixture.font, 10);
        const before = ctx.measureText(line.text.slice(0, line.text.indexOf(line.value))).width;
        const x = line.x + before - 4, y = line.y - size - 6;
        const width = ctx.measureText(line.value).width + 8, height = size + 16;
        expected.push(fixture.rotated ? { type: line.type, x: fixture.height - y - height,
          y: x, width: height, height: width } : { type: line.type, x, y, width, height });
      }
      const canvas = fixture.rotated ? document.createElement('canvas') : source;
      if (fixture.rotated) {
        canvas.width = fixture.height; canvas.height = fixture.width;
        const rotated = canvas.getContext('2d')!;
        rotated.translate(fixture.height, 0); rotated.rotate(Math.PI / 2);
        rotated.drawImage(source, 0, 0);
      }
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        value => value ? resolve(value) : reject(new Error('Fixture failed')), 'image/png'));
      const file = new File([blob], `${fixture.name}.png`, { type: 'image/png' });
      const url = URL.createObjectURL(file);
      try {
        const { scanImage } = await import(/* @vite-ignore */ '/src/features/ocr/scanImage.ts');
        const { scanImageV2 } = await import(/* @vite-ignore */ '/src/v2/detection/scanImageV2.ts');
        const { detectUniversalPrivacy } = await import(/* @vite-ignore */ '/src/v2/detection/detectUniversalPrivacy.ts');
        const { v1OcrDetector, labeledSecretDetector } = await import(/* @vite-ignore */ '/src/v2/detection/ocrDetectors.ts');
        const { summarizeOcrDiagnostics } = await import(/* @vite-ignore */ '/src/v2/detection/diagnostics.ts');
        const image = { id: fixture.name, file, previewUrl: url, width: canvas.width,
          height: canvas.height, mimeType: 'image/png' as const };
        const baseOptions = { mixedChineseEnglish: true, enhanceLowContrast: true, upscaleSmallText: true };
        const startBaseline = performance.now();
        const baselineOcr = await scanImage(image, () => {}, new AbortController().signal, baseOptions);
        const baselineRuntime = performance.now() - startBaseline;
        const startCurrent = performance.now();
        const currentOcr = await scanImageV2(image, () => {}, new AbortController().signal);
        const currentRuntime = performance.now() - startCurrent;
        const input = (ocr: typeof baselineOcr) => ({ imageId: image.id, imageWidth: image.width,
          imageHeight: image.height, ocr });
        const before = await detectUniversalPrivacy(input(baselineOcr), [v1OcrDetector, labeledSecretDetector]);
        const after = await detectUniversalPrivacy(input(currentOcr));
        const annotated = { visibleText: fixture.lines.map(line => line.text).join(' '),
          annotations: fixture.lines.filter(line => line.value).map(line => ({ text: line.value!, typeId: line.type })) };
        const baselineOcrMetrics = summarizeOcrDiagnostics(baselineOcr, before, annotated);
        const currentOcrMetrics = summarizeOcrDiagnostics(currentOcr, after, annotated);
        return { expected,
          baseline: before.findings.map(f => ({ type: f.typeId, boxes: f.boxes ?? [] })),
          current: after.findings.map(f => ({ type: f.typeId, boxes: f.boxes ?? [] })),
          baselineOcrMetrics, currentOcrMetrics, baselineRuntime, currentRuntime,
          dimensions: [canvas.width, canvas.height],
          wordCounts: { baseline: baselineOcr.words.length, current: currentOcr.words.length },
          averageConfidence: baselineOcr.words.reduce((sum, word) => sum + word.confidence, 0) /
            Math.max(1, baselineOcr.words.length),
          heapBytes: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null };
      } finally { URL.revokeObjectURL(url); }
    }, fixture);
    function score(findings: typeof result.current) {
      const used = new Set<number>();
      for (const target of result.expected) {
        const found = findings.findIndex((finding, i) => !used.has(i) && finding.type === target.type &&
          finding.boxes.some(box => {
            const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
            return cx >= target.x - 20 && cx <= target.x + target.width + 20 &&
              cy >= target.y - 20 && cy <= target.y + target.height + 20;
          }));
        if (found >= 0) used.add(found);
      }
      return { tp: used.size, fp: findings.length - used.size, fn: result.expected.length - used.size };
    }
    measures.push({ name: fixture.name, baseline: score(result.baseline), current: score(result.current),
      ocr: { baselineCharacterAccuracy: result.baselineOcrMetrics.characterAccuracy,
        currentCharacterAccuracy: result.currentOcrMetrics.characterAccuracy,
        baselineWordAccuracy: result.baselineOcrMetrics.wordAccuracy,
        currentWordAccuracy: result.currentOcrMetrics.wordAccuracy,
        recognitionMisses: result.currentOcrMetrics.recognitionMisses,
        classificationMisses: result.currentOcrMetrics.classificationMisses },
      runtimeMs: { baseline: Math.round(result.baselineRuntime), current: Math.round(result.currentRuntime) },
      wordCounts: result.wordCounts, averageConfidence: result.averageConfidence,
      heapBytes: result.heapBytes });
    expect(result.current.every(f => f.boxes.every(box => box.x >= 0 && box.y >= 0 &&
      box.x + box.width <= result.dimensions[0]! && box.y + box.height <= result.dimensions[1]!))).toBe(true);
  }
  console.log('Fictional advanced benchmark aggregates:', JSON.stringify(measures));
  const positive = measures.filter(item => item.name !== 'negative_unknown');
  expect(positive.reduce((sum, item) => sum + item.current.tp, 0))
    .toBeGreaterThan(positive.reduce((sum, item) => sum + item.baseline.tp, 0));
  expect(measures.find(item => item.name === 'negative_unknown')?.current.fp).toBe(0);
});
