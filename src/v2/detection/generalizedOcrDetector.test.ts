import { describe, expect, it } from 'vitest';
import type { OcrResult, OcrWord } from '../../types';
import { detectUniversalPrivacy } from './detectUniversalPrivacy';

function makeOcr(lines: readonly string[], confidence = 0.92): OcrResult {
  let i = 0;
  const words: OcrWord[] = lines.flatMap((text, row) => {
    let x = 20;
    return text.split(' ').map(part => {
      const word: OcrWord = { id: `w${i++}`, lineId: `l${row}`, text: part,
        box: { x, y: 30 + row * 48, width: part.length * 12, height: 26 }, confidence };
      x += word.box.width + 12;
      return word;
    });
  });
  return { imageId: 'fictional', width: 1600, height: 1000,
    language: 'eng+chi_sim', text: lines.join('\n'), words };
}

describe('generalized evidence-backed OCR extraction', () => {
  it('identifies labeled reusable classes with original-image value boxes', async () => {
    const lines = [
      'Customer Name: Ada Example',
      'Date of Birth: 2001-02-28',
      'Institution: Example University',
      'Shipping Address: 45 Example Road',
      'Billing Address: 9 Sample Street',
      'Transaction Ref: TXN-482913',
      'Booking Reference: BK-778899',
      'Device ID: DV-99887766',
      'Server IP: 192.168.1.25',
    ];
    const result = await detectUniversalPrivacy({ imageId: 'fictional', imageWidth: 1600,
      imageHeight: 1000, ocr: makeOcr(lines) });
    const types = result.findings.map(finding => finding.typeId);
    expect(types).toEqual(expect.arrayContaining([
      'person_name', 'date_of_birth', 'organization_name', 'shipping_address',
      'billing_address', 'transaction_reference', 'booking_reference',
      'device_identifier', 'server_address',
    ]));
    expect(result.findings.filter(f => f.typeId === 'shipping_address')).toHaveLength(1);
    expect(result.findings.filter(f => f.typeId === 'billing_address')).toHaveLength(1);
    expect(result.findings.every(f => f.boxes?.every(b => b.x >= 0 && b.y >= 0 &&
      b.x + b.width <= 1600 && b.y + b.height <= 1000))).toBe(true);
  });

  it('does not assert unsupported guesses, invalid dates, or bare identifiers', async () => {
    const lines = [
      'Name: Ada Example', 'Date of Birth: 2001-02-30',
      'Transaction Ref: 00000000', 'Booking Reference: 12345678',
      'Server IP: 999.999.999.999', 'Unlabeled ABC-778899',
    ];
    const result = await detectUniversalPrivacy({ imageId: 'fictional', imageWidth: 1600,
      imageHeight: 1000, ocr: makeOcr(lines) });
    expect(result.findings.every(f => f.status === 'UNKNOWN_POTENTIALLY_SENSITIVE')).toBe(true);
    expect(result.findings.map(f => f.value).sort()).toEqual(['12345678', 'Ada Example']);
    expect(result.findings.some(f => f.value === '2001-02-30' || f.value === '999.999.999.999')).toBe(false);
  });

  it('supports values below labels and marks weak OCR as uncertain', async () => {
    const result = await detectUniversalPrivacy({ imageId: 'fictional', imageWidth: 1600,
      imageHeight: 1000, ocr: makeOcr(['Booking Reference', 'BK-778899'], 0.45) });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ typeId: 'booking_reference', status: 'UNCERTAIN',
      value: 'BK-778899' });
    expect(result.findings[0]?.boxes?.[0]?.y).toBeCloseTo(74.88);
    expect(result.findings[0]?.evidence[0]?.boxes?.[0]?.y).toBe(78);
  });

  it('keeps an ambiguous birth-date format in review', async () => {
    const result = await detectUniversalPrivacy({ imageId: 'fictional', imageWidth: 1600,
      imageHeight: 1000, ocr: makeOcr(['Date of Birth: 05/06/2001']) });
    expect(result.findings).toMatchObject([{ typeId: 'date_of_birth', status: 'UNCERTAIN' }]);
  });
});
