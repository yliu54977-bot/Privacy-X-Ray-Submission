import { expect, it } from 'vitest';
import type { OcrWord } from '../../types';
import { detectUniversalPrivacy } from './detectUniversalPrivacy';
import { documentPatternDetector } from './documentPatterns';
import type { DetectionInput } from '../contracts';

function fixture(rows: { text: string; x?: number; y?: number; glyphs?: boolean }[]): DetectionInput {
  return { imageId: 'fictional-address', imageWidth: 1800, imageHeight: 1200,
    ocr: { imageId: 'fictional-address', width: 1800, height: 1200, language: 'eng+chi_sim', text: rows.map(r => r.text).join('\n'),
      words: rows.flatMap((row, i) => {
        let x = row.x ?? 100;
        return (row.glyphs ? [...row.text] : row.text.split(' ')).filter(text => text.trim()).map((text, j): OcrWord => {
          const width = row.glyphs ? 24 : text.length * 13;
          const word = { id: `word-${i}-${j}`, lineId: `line-${i}`, text, confidence: .94,
            box: { x, y: row.y ?? 50 + i * 48, width, height: 28 } };
          x += width + 7; return word;
        });
      }) } };
}

it('includes every glyph of a wrapped Chinese address as two continuous mask regions', async () => {
  const input = fixture([{ text: '住址', x: 20, y: 100, glyphs: true },
    { text: '广东省示例市示例区', x: 130, y: 100, glyphs: true },
    { text: '虚构路170号2号楼604室', x: 130, y: 148, glyphs: true },
    { text: '公民身份号码：11010519491231002X', x: 20, y: 210 }]);
  const result = await detectUniversalPrivacy(input);
  const address = result.findings.find(f => /postal address/i.test(f.label))!;
  expect(address.value?.replace(/\s/g, '')).toBe('广东省示例市示例区虚构路170号2号楼604室');
  expect(address.boxes).toHaveLength(2);
  const ids = new Set(address.evidence.flatMap(e => e.wordIds ?? []));
  const expected = input.ocr!.words.filter(w => ['line-1', 'line-2'].includes(w.lineId));
  expect(ids.size).toBe(expected.length);
  for (const word of expected) expect(address.boxes!.some(b => b.x <= word.box.x && b.y <= word.box.y &&
    b.x + b.width >= word.box.x + word.box.width && b.y + b.height >= word.box.y + word.box.height)).toBe(true);
  expect(address.boxes!.every(b => b.x > 100 && b.y + b.height < 200)).toBe(true);
});

it('combines a labeled street, apartment and locality into one selectable address', async () => {
  const input = fixture([{ text: 'Postal address:' }, { text: '81 Fictional Road' },
    { text: 'Unit 604, Building 2' }, { text: 'Example City, ON K1A 0B1' }, { text: 'Phone: 555-010-2345' }]);
  const result = await detectUniversalPrivacy(input);
  const address = result.findings.filter(f => /address|postal code/i.test(f.label));
  expect(address).toHaveLength(1);
  expect(address[0]!.value).toBe('81 Fictional Road Unit 604, Building 2 Example City, ON K1A 0B1');
  expect(address[0]!.boxes).toHaveLength(3);
  expect(address[0]!.evidence.flatMap(e => e.wordIds).every(id => !id?.startsWith('word-4-'))).toBe(true);
});

it('does not absorb another labeled address, a distant column or unrelated prose', async () => {
  for (const next of [{ text: 'Billing Address: 91 Different Street' },
    { text: 'Unit 602', x: 1000 }, { text: 'Please keep this document for your records' },
    { text: 'Signature' }, { text: 'Example City', y: 900 }]) {
    const input = fixture([{ text: 'Address: 81 Fictional Road' }, next]);
    const findings = await documentPatternDetector.detect(input);
    const address = findings.find(f => /postal address/i.test(f.label));
    expect(address?.value).toBe('81 Fictional Road');
  }
});

it('keeps two same-text addresses in separate locations independently selectable', async () => {
  const result = await detectUniversalPrivacy(fixture([{ text: 'Shipping Address: 81 Fictional Road' },
    { text: 'Billing Address: 81 Fictional Road' }]));
  expect(result.findings.filter(f => /address/i.test(f.label))).toHaveLength(2);
});

it('includes a separate numeric postal-code line after a labeled address', async () => {
  const result = await detectUniversalPrivacy(fixture([{ text: 'Address: 81 Fictional Road' },
    { text: 'Example City' }, { text: '10001' }, { text: 'Phone: 555-010-2345' }]));
  const address = result.findings.find(f => /postal address/i.test(f.label));
  expect(address?.value).toBe('81 Fictional Road Example City 10001');
  expect(address?.boxes).toHaveLength(3);
});
