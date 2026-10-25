import type { DetectedField, OcrResult, OcrWord, PrivacyFieldType } from '../../types';

type Label = { type: PrivacyFieldType; name: string; pattern: RegExp; parseAs?: PrivacyFieldType };
const labels: readonly Label[] = [
  { type: 'bank_account_number', name: 'Bank Account Number', pattern: /(?:\bbank\s*)?\b(?:account|acct)\b(?:\s*(?:number|num(?:ber)?|no\b\.?|#))?|银\s*行?\s*账\s*号|银\s*行\s*账\s*户|账\s*户\s*号\s*码/gim },
  { type: 'student_id', name: 'Student ID', pattern: /\bstudent\s*(?:id|[i1|l]\s*d|number|num|no\b\.?|#)|学\s*号|学\s*生\s*编\s*号/gim },
  { type: 'payment_amount', name: 'Payment Amount', pattern: /\b(?:(?:payment|transaction)\s*)?amount\b|付\s*款\s*金\s*额|支\s*付\s*金\s*额|交\s*易\s*金\s*额/gim },
  { type: 'unknown', name: 'Total Amount', parseAs: 'payment_amount', pattern: /\btotal\s+amount\b/gim },
  { type: 'order_number', name: 'Order Number', pattern: /\border\s*(?:number|num|no\b\.?|id|#)|订\s*单\s*号(?:\s*码)?/gim },
  { type: 'home_address', name: 'Home Address', pattern: /\bhome\s+address\b|家\s*庭\s*住\s*址/gim },
  { type: 'unknown', name: 'Shipping Address', parseAs: 'home_address', pattern: /\bshipping\s+address\b|收\s*货\s*地\s*址/gim },
  { type: 'unknown', name: 'Billing Address', parseAs: 'home_address', pattern: /\bbilling\s+address\b|账\s*单\s*地\s*址/gim },
  { type: 'phone', name: 'Phone Number', pattern: /\b(?:phone|mobile|telephone|tel|cell)(?:\s*(?:number|num|no\b\.?))?|手\s*机\s*号(?:\s*码)?|联\s*系\s*电\s*话/gim },
  { type: 'email', name: 'Email Address', pattern: /\be[\s-]*mail(?:\s+address)?\b|电\s*子\s*邮\s*箱|邮\s*箱/gim },
];

type LocatedText = { text: string; offsets: { word: OcrWord; start: number; end: number }[] };
function locatedText(words: readonly OcrWord[]): LocatedText {
  let text = '';
  const offsets = words.map(word => {
    if (text) text += ' ';
    const start = text.length;
    text += word.text;
    return { word, start, end: text.length };
  });
  return { text, offsets };
}

function parseValue(type: PrivacyFieldType, raw: string): { value: string; start: number; end: number } | null {
  const prefix = /^[\s:：#=–—-]*/.exec(raw)?.[0].length ?? 0;
  const tail = raw.slice(prefix);
  let match: RegExpExecArray | null;
  switch (type) {
    case 'bank_account_number':
      match = /^(?:\d[\s-]?){7,18}\d/.exec(tail);
      if (!match || !/^\d{8,19}$/.test(match[0].replace(/\D/g, ''))) return null;
      break;
    case 'student_id':
      match = /^[A-Z0-9][A-Z0-9-]{4,15}\b/i.exec(tail) ??
        /^[A-Z0-9](?:[A-Z0-9\s-]{3,20})/i.exec(tail);
      if (!match || !/^[A-Z0-9-]{5,16}$/i.test(match[0].replace(/\s/g, '').replace(/-$/, ''))) return null;
      break;
    case 'payment_amount':
      match = /^(?:[$£€¥￥]\s*)?\d[\d,]*(?:\.\d{1,2})?/.exec(tail);
      if (!match) return null;
      break;
    case 'order_number':
      match = /^[A-Z0-9][A-Z0-9-]{4,23}\b/i.exec(tail) ??
        /^[A-Z0-9](?:[A-Z0-9\s-]{3,28})/i.exec(tail);
      if (!match || !/^[A-Z0-9-]{5,24}$/i.test(match[0].replace(/\s/g, '').replace(/-$/, ''))) return null;
      break;
    case 'home_address':
      match = /^.{8,80}/.exec(tail);
      if (!match || !/\d/.test(match[0])) return null;
      break;
    case 'phone':
      match = /^\+?\d[\d\s().-]{7,22}\d/.exec(tail);
      if (!match || !/^\d{10,15}$/.test(match[0].replace(/\D/g, ''))) return null;
      break;
    case 'email':
      match = /^[A-Z0-9._%+\s-]+\s*@\s*[A-Z0-9.\s-]+\s*\.\s*[A-Z]{2,}/i.exec(tail);
      if (!match) return null;
      break;
    default: return null;
  }
  const value = match[0].trim().replace(/\s+(?=[.@])|(?<=[.@])\s+/g, '');
  return { value, start: prefix, end: prefix + match[0].length };
}

/** v2 OCR extraction. Labels and values may share a line or occupy adjacent aligned lines. */
export function extractLayoutFields(ocr: OcrResult): readonly DetectedField[] {
  const grouped = new Map<string, OcrWord[]>();
  for (const word of ocr.words) {
    const row = grouped.get(word.lineId) ?? [];
    row.push(word);
    grouped.set(word.lineId, row);
  }
  const lines = [...grouped.values()].map(words => words.sort((a, b) => a.box.x - b.box.x))
    .sort((a, b) => a[0]!.box.y - b[0]!.box.y || a[0]!.box.x - b[0]!.box.x);
  const fields: DetectedField[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const words = lines[i]!;
    const current = locatedText(words);
    const hits = labels.flatMap(label => [...current.text.matchAll(label.pattern)]
      .map(match => ({ label, start: match.index, end: match.index + match[0].length })))
      .sort((a, b) => a.start - b.start || b.end - a.end);
    const nonoverlap = hits.filter((hit, index) => !hits.slice(0, index).some(other =>
      other.start <= hit.start && other.end > hit.start));
    for (let j = 0; j < nonoverlap.length; j++) {
      const hit = nonoverlap[j]!;
      const end = nonoverlap[j + 1]?.start ?? current.text.length;
      const labelX = current.offsets.find(item => item.start < hit.end && item.end > hit.start)?.word.box.x ?? words[0]!.box.x;
      const nextLabelX = nonoverlap[j + 1] ? current.offsets.find(item =>
        item.start < nonoverlap[j + 1]!.end && item.end > nonoverlap[j + 1]!.start)?.word.box.x : undefined;
      let source = current;
      let raw = current.text.slice(hit.end, end);
      let offset = hit.end;
      if (!raw.trim().replace(/^[:：#=–—-]/, '').trim()) {
        const next = lines.slice(i + 1).find(candidate => {
          const gap = candidate[0]!.box.y - words[0]!.box.y;
          const aligned = candidate.some(word => word.box.x >= labelX - 60 &&
            word.box.x < Math.min(labelX + 500, (nextLabelX ?? Infinity) - 60));
          return gap > 0 && gap <= Math.max(...words.map(word => word.box.height)) * 2.5 && aligned &&
            !labels.some(label => [...locatedText(candidate).text.matchAll(label.pattern)].length > 0);
        });
        if (next) {
          const nextText = locatedText(next.filter(word => word.box.x >= labelX - 60 &&
            word.box.x < Math.min(labelX + 500, (nextLabelX ?? Infinity) - 60)));
          source = nextText;
          raw = nextText.text;
          offset = 0;
        }
      }
      const parsed = parseValue(hit.label.parseAs ?? hit.label.type, raw);
      if (!parsed) continue;
      const start = offset + parsed.start;
      const finish = offset + parsed.end;
      const selected = source.offsets.filter(item => item.start < finish && item.end > start).map(item => item.word);
      if (!selected.length) continue;
      const key = `${hit.label.type}:${selected.map(word => word.id).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fields.push({ id: `v2:${key}`, imageId: ocr.imageId, type: hit.label.type,
        label: hit.label.name, value: parsed.value,
        wordIds: selected.map(word => word.id), boxes: selected.map(word => word.box),
        confidence: selected.reduce((sum, word) => sum + word.confidence, 0) / selected.length });
    }
    // Email addresses without labels remain recognizable but need a complete address pattern.
    for (const match of current.text.matchAll(/[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\s*\.\s*[A-Z]{2,}/ig)) {
      const selected = current.offsets.filter(item => item.start < match.index + match[0].length &&
        item.end > match.index).map(item => item.word);
      const key = `email:${selected.map(word => word.id).join(',')}`;
      if (!selected.length || seen.has(key)) continue;
      seen.add(key);
      fields.push({ id: `v2:${key}`, imageId: ocr.imageId, type: 'email', label: 'Email Address',
        value: match[0].replace(/\s/g, ''), wordIds: selected.map(word => word.id),
        boxes: selected.map(word => word.box),
        confidence: selected.reduce((sum, word) => sum + word.confidence, 0) / selected.length });
    }
  }
  return fields;
}
