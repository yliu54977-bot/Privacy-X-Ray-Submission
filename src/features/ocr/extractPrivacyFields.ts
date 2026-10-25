import type { DetectedField, OcrResult, OcrWord, PrivacyFieldType } from '../../types';

type Pattern = { type: PrivacyFieldType; label: string; regex: RegExp; accept?: (value: string) => boolean };

const patterns: readonly Pattern[] = [
  { type: 'bank_account_number', label: 'Bank Account Number', regex: /\b(?:bank\s+)?account(?:\s*(?:number|no\.?|#))?\s*[:#-]?\s*((?:\d[\s-]?){7,19}\d)\b/i,
    accept: value => value.replace(/\D/g, '').length >= 8 },
  { type: 'student_id', label: 'Student ID', regex: /\bstudent\s*(?:id|number|no\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,15})\b/i },
  { type: 'payment_amount', label: 'Payment Amount', regex: /\b(?:payment\s+|transaction\s+)?amount\s*[:#-]?\s*((?:[$£€]\s*)?\d[\d,]*(?:\.\d{2})?)\b/i,
    accept: value => Number.isFinite(Number(value.replace(/[^\d.]/g, ''))) },
  { type: 'order_number', label: 'Order Number', regex: /\border\s*(?:number|no\.?|id|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,24})\b/i },
  { type: 'email', label: 'Email Address', regex: /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i },
  { type: 'home_address', label: 'Home Address', regex: /\bhome\s+address\s*[:#-]?\s*(.{8,80})$/i,
    accept: value => /\d/.test(value) },
  { type: 'phone', label: 'Phone Number', regex: /\b(?:phone|mobile|telephone)(?:\s*(?:number|no\.?))?\s*[:#-]?\s*(\+?\d[\d\s().-]{8,20}\d)\b/i,
    accept: value => { const digits = value.replace(/\D/g, '').length; return digits >= 10 && digits <= 15; } },
];

/** Conservative, context-independent extraction from OCR lines. */
export function extractPrivacyFields(ocr: OcrResult): readonly DetectedField[] {
  const lines = new Map<string, OcrWord[]>();
  for (const word of ocr.words) {
    const line = lines.get(word.lineId) ?? [];
    line.push(word);
    lines.set(word.lineId, line);
  }

  const fields: DetectedField[] = [];
  for (const [lineId, words] of lines) {
    const offsets: { word: OcrWord; start: number; end: number }[] = [];
    let text = '';
    for (const word of words) {
      if (text) text += ' ';
      const start = text.length;
      text += word.text;
      offsets.push({ word, start, end: text.length });
    }
    for (const pattern of patterns) {
      const match = pattern.regex.exec(text);
      if (!match) continue;
      const value = match[1].trim();
      if (!value || (pattern.accept && !pattern.accept(value))) continue;
      const relative = match[0].lastIndexOf(match[1]);
      const start = match.index + relative;
      const end = start + match[1].length;
      const selected = offsets.filter(item => item.start < end && item.end > start).map(item => item.word);
      if (selected.length === 0) continue;
      fields.push({
        id: `${lineId}:${pattern.type}`,
        imageId: ocr.imageId,
        type: pattern.type,
        label: pattern.label,
        value,
        wordIds: selected.map(word => word.id),
        boxes: selected.map(word => word.box),
        confidence: selected.reduce((sum, word) => sum + word.confidence, 0) / selected.length,
      });
    }
  }
  return fields;
}
