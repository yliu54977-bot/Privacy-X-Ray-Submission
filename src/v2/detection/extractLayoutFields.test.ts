import { describe, expect, it } from 'vitest';
import type { OcrResult, OcrWord } from '../../types';
import { extractLayoutFields } from './extractLayoutFields';

function words(rows: { text: string; x: number; y: number; lineId: string }[]): OcrResult {
  const result: OcrWord[] = rows.map((row, index) => ({
    id: `w${index}`, lineId: row.lineId, text: row.text,
    box: { x: row.x, y: row.y, width: row.text.length * 10, height: 22 }, confidence: 0.92,
  }));
  return { imageId: 'fictional', width: 1400, height: 800, language: 'eng+chi_sim',
    text: rows.map(row => row.text).join(' '), words: result };
}

describe('v2 layout-aware field extraction', () => {
  it('extracts repeated labels on one line and preserves value-word geometry', () => {
    const ocr = words([
      { text: 'Order', x: 20, y: 20, lineId: 'l1' }, { text: 'No.:', x: 85, y: 20, lineId: 'l1' },
      { text: 'ORD-11111', x: 150, y: 20, lineId: 'l1' },
      { text: 'Order', x: 390, y: 20, lineId: 'l1' }, { text: 'No.:', x: 455, y: 20, lineId: 'l1' },
      { text: 'ORD-22222', x: 520, y: 20, lineId: 'l1' },
    ]);
    const fields = extractLayoutFields(ocr);
    expect(fields.map(field => field.value)).toEqual(['ORD-11111', 'ORD-22222']);
    expect(fields.map(field => field.boxes[0]?.x)).toEqual([150, 520]);
  });

  it('pairs split labels with the correct column without inventing boxes', () => {
    const ocr = words([
      { text: 'Student', x: 20, y: 20, lineId: 'l1' }, { text: 'ID', x: 110, y: 20, lineId: 'l1' },
      { text: 'Order', x: 710, y: 20, lineId: 'l1' }, { text: 'No.', x: 790, y: 20, lineId: 'l1' },
      { text: 'S7654321', x: 20, y: 60, lineId: 'l2' },
      { text: 'ORD-339944', x: 710, y: 60, lineId: 'l2' },
    ]);
    const fields = extractLayoutFields(ocr);
    expect(fields.map(field => [field.type, field.value])).toEqual([
      ['student_id', 'S7654321'], ['order_number', 'ORD-339944'],
    ]);
    expect(fields.map(field => field.boxes[0]?.x)).toEqual([20, 710]);
  });

  it('does not join distant or unlabeled numbers into sensitive fields', () => {
    const ocr = words([
      { text: 'Student', x: 20, y: 20, lineId: 'l1' }, { text: 'ID', x: 110, y: 20, lineId: 'l1' },
      { text: '123456789', x: 20, y: 250, lineId: 'l2' },
      { text: 'Reference', x: 20, y: 320, lineId: 'l3' },
      { text: '999999999999', x: 140, y: 320, lineId: 'l3' },
    ]);
    expect(extractLayoutFields(ocr)).toEqual([]);
  });

  it('does not claim a shipping or billing address is a home address', () => {
    const ocr = words([
      { text: 'Shipping', x: 20, y: 20, lineId: 'l1' }, { text: 'Address:', x: 135, y: 20, lineId: 'l1' },
      { text: '45', x: 250, y: 20, lineId: 'l1' }, { text: 'Example', x: 290, y: 20, lineId: 'l1' },
      { text: 'Road', x: 385, y: 20, lineId: 'l1' },
      { text: 'Billing', x: 20, y: 75, lineId: 'l2' }, { text: 'Address:', x: 105, y: 75, lineId: 'l2' },
      { text: '9', x: 220, y: 75, lineId: 'l2' }, { text: 'Sample', x: 250, y: 75, lineId: 'l2' },
      { text: 'Street', x: 335, y: 75, lineId: 'l2' },
    ]);
    const fields = extractLayoutFields(ocr);
    expect(fields.map(field => [field.type, field.label])).toEqual([
      ['unknown', 'Shipping Address'], ['unknown', 'Billing Address'],
    ]);
    expect(fields.every(field => field.boxes.length > 0)).toBe(true);
  });
});
