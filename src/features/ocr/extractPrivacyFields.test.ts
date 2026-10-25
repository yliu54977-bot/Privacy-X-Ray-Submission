import { describe, expect, it } from 'vitest';
import type { OcrResult, OcrWord, PrivacyFieldType } from '../../types';
import { extractPrivacyFields } from './extractPrivacyFields';

function lineWords(line: string, lineNumber: number): OcrWord[] {
  let x = 10;
  return line.split(' ').map((text, index) => {
    const word = {
      id: `word-${lineNumber}-${index}`,
      lineId: `line-${lineNumber}`,
      text,
      box: { x, y: lineNumber * 30, width: Math.max(8, text.length * 9), height: 20 },
      confidence: 0.91,
    };
    x += word.box.width + 9;
    return word;
  });
}

function sample(lines: string[]): OcrResult {
  return {
    imageId: 'fictional-image', width: 1200, height: 900, language: 'eng',
    text: lines.join('\n'), words: lines.flatMap(lineWords),
  };
}

describe('conservative field detection', () => {
  it('finds the seven agreed types with original-image word boxes', () => {
    const result = extractPrivacyFields(sample([
      'Bank Account Number: 1234 5678 9012',
      'Student ID: S1234567',
      'Payment Amount: $1,234.56',
      'Order Number: ORD-482913',
      'Email: student@example.test',
      'Home Address: 123 Fictional Lane',
      'Phone Number: 416-555-0142',
    ]));
    expect(new Set(result.map(field => field.type))).toEqual(new Set<PrivacyFieldType>([
      'bank_account_number', 'student_id', 'payment_amount', 'order_number',
      'email', 'home_address', 'phone',
    ]));
    expect(result.every(field => field.imageId === 'fictional-image' && field.wordIds.length > 0 && field.boxes.length > 0)).toBe(true);
    expect(result.find(field => field.type === 'order_number')?.boxes[0].y).toBe(90);
  });

  it('does not classify arbitrary numbers or addresses without the required labels', () => {
    const result = extractPrivacyFields(sample([
      'Reference 123456789012',
      '123 Fictional Lane',
      '42 000 771',
    ]));
    expect(result).toEqual([]);
  });
});
