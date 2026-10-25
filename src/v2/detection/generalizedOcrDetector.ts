import type { OcrWord } from '../../types';
import type { PrivacyDetector, UniversalFinding } from '../contracts';
import { privacyKnowledgeBase } from '../privacyKnowledgeBase';

type Rule = { typeId: string; label: string; labelPattern: RegExp; valuePattern: RegExp;
  plausible(value: string): boolean };
const identifier = /^[A-Z0-9][A-Z0-9/_-]{5,31}\b/i;
const date = /^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/;
const address = /^\d{1,6}\s+[^:：]{5,75}/;
const readable = /^[\p{L}\p{N}][\p{L}\p{N} .,&'()-]{2,79}/u;
const rules: readonly Rule[] = [
  { typeId: 'person_name', label: 'Person name',
    labelPattern: /\b(?:customer|student|passenger|account\s+holder|full)\s+name\b|姓\s*名/gim,
    valuePattern: /^(?:[A-Z][a-z]+(?:[ -][A-Z][a-z]+){1,3}|[\u4e00-\u9fff]{2,4})/u,
    plausible: value => !/^(?:test|sample|unknown)$/i.test(value) },
  { typeId: 'date_of_birth', label: 'Date of birth',
    labelPattern: /\b(?:date\s+of\s+birth|birth\s*date|dob)\b|出\s*生\s*日\s*期/gim,
    valuePattern: date, plausible: validCalendarDate },
  { typeId: 'organization_name', label: 'Organization',
    labelPattern: /\b(?:institution|university|company|employer|organization)\s*(?:name)?\b|机\s*构\s*名\s*称/gim,
    valuePattern: readable, plausible: value => value.trim().length >= 4 },
  { typeId: 'shipping_address', label: 'Shipping address',
    labelPattern: /\b(?:shipping|delivery)\s+address\b|收\s*货\s*地\s*址/gim,
    valuePattern: address, plausible: value => /\p{L}/u.test(value) },
  { typeId: 'billing_address', label: 'Billing address',
    labelPattern: /\bbilling\s+address\b|账\s*单\s*地\s*址/gim,
    valuePattern: address, plausible: value => /\p{L}/u.test(value) },
  { typeId: 'transaction_reference', label: 'Transaction reference',
    labelPattern: /\b(?:transaction|payment|transfer)\s*(?:reference|ref(?:erence)?\.?|id|number)\b|交\s*易\s*流\s*水\s*号/gim,
    valuePattern: identifier, plausible: value => /\d/.test(value) && !/^0+$/.test(value) },
  { typeId: 'booking_reference', label: 'Booking reference',
    labelPattern: /\b(?:booking|reservation|flight)\s*(?:reference|ref\.?|number|code|id)\b|预\s*订\s*编\s*号/gim,
    valuePattern: identifier, plausible: value => /[A-Z]/i.test(value) && /\d/.test(value) },
  { typeId: 'device_identifier', label: 'Device identifier',
    labelPattern: /\b(?:device\s*(?:id|identifier)|serial\s*(?:number|no\.?|#)|mac\s*address)\b|设\s*备\s*序\s*列\s*号/gim,
    valuePattern: /^(?:[0-9A-F]{2}(?::[0-9A-F]{2}){5}|[A-Z0-9][A-Z0-9-]{7,31})\b/i,
    plausible: value => /\d/.test(value) && !/^0+$/.test(value) },
  { typeId: 'server_address', label: 'Server IP address',
    labelPattern: /\b(?:server|host|gateway)\s*(?:ip|address)\b/gim,
    valuePattern: /^(?:\d{1,3}\.){3}\d{1,3}\b/,
    plausible: value => value.split('.').every(part => Number(part) <= 255) },
];

function validCalendarDate(value: string): boolean {
  const parts = value.split(/[-/.]/).map(Number);
  const [year, month, day] = parts[0]! > 31
    ? [parts[0]!, parts[1]!, parts[2]!]
    : [parts[2]!, parts[0]!, parts[1]!];
  const d = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= new Date().getUTCFullYear() &&
    d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
}

function line(words: readonly OcrWord[]) {
  let text = '';
  const offsets = words.map(word => {
    if (text) text += ' ';
    const start = text.length;
    text += word.text;
    return { word, start, end: text.length };
  });
  return { text, offsets };
}

/** Explicit labels and original-pixel value words; never infer an identifier from bare digits. */
export const generalizedOcrDetector: PrivacyDetector = {
  capability: { id: 'generalized_labeled_fields', family: 'label_context',
    name: 'Labeled personal, travel, transaction, address and device fields',
    status: 'implemented', verified: true,
    supportedTypeIds: rules.map(rule => rule.typeId),
    limitation: 'Requires an explicit readable label and plausible value; unlabeled content is not classified.' },
  async detect(input): Promise<readonly UniversalFinding[]> {
    if (!input.ocr) return [];
    const grouped = new Map<string, OcrWord[]>();
    for (const word of input.ocr.words) grouped.set(word.lineId, [...(grouped.get(word.lineId) ?? []), word]);
    const rows = [...grouped.values()].map(words => words.sort((a, b) => a.box.x - b.box.x))
      .sort((a, b) => a[0]!.box.y - b[0]!.box.y);
    const findings: UniversalFinding[] = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const current = line(rows[rowIndex]!);
      const matches = rules.flatMap(rule => [...current.text.matchAll(rule.labelPattern)]
        .map(match => ({ rule, start: match.index, end: match.index + match[0].length })))
        .sort((a, b) => a.start - b.start);
      for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
        const hit = matches[matchIndex]!;
        const nextStart = matches[matchIndex + 1]?.start ?? current.text.length;
        let source = current;
        let start = hit.end;
        let raw = current.text.slice(start, nextStart);
        if (!raw.replace(/^[\s:：#=–—-]+/, '').trim()) {
          const next = rows[rowIndex + 1];
          const labelWord = current.offsets.find(offset => offset.start < hit.end && offset.end > hit.start)?.word;
          if (next && labelWord && next[0]!.box.y - labelWord.box.y <= labelWord.box.height * 2.8 &&
            Math.abs(next[0]!.box.x - labelWord.box.x) < 90 &&
            !rules.some(rule => new RegExp(rule.labelPattern.source, 'im').test(line(next).text))) {
            source = line(next); raw = source.text; start = 0;
          }
        }
        const prefix = /^[\s:：#=–—-]*/.exec(raw)?.[0].length ?? 0;
        const parsed = hit.rule.valuePattern.exec(raw.slice(prefix));
        if (!parsed || !hit.rule.plausible(parsed[0])) continue;
        const from = start + prefix;
        const selected = source.offsets.filter(offset => offset.start < from + parsed[0].length &&
          offset.end > from).map(offset => offset.word);
        if (!selected.length) continue;
        const value = parsed[0].trim();
        const type = privacyKnowledgeBase.type(hit.rule.typeId);
        const confidence = selected.reduce((sum, word) => sum + word.confidence, 0) / selected.length;
        const ambiguousDate = hit.rule.typeId === 'date_of_birth' &&
          /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(value) &&
          value.split(/[/.-]/).slice(0, 2).every(part => Number(part) <= 12);
        const uncertain = confidence < 0.7 || ambiguousDate;
        const id = `general:${hit.rule.typeId}:${selected.map(word => word.id).join(',')}`;
        const boxes = selected.map(word => word.box);
        findings.push({ id, source: { kind: 'image', id: input.imageId },
          status: uncertain ? 'UNCERTAIN' : 'KNOWN', typeId: hit.rule.typeId,
          categoryIds: type?.categoryIds ?? [], label: hit.rule.label, value,
          evidence: [{ id: `${id}:e`, detectorId: 'generalized_labeled_fields', method: 'label_context',
            source: 'ocr', explanation: `Explicit ${hit.rule.label.toLowerCase()} label and plausible value.`,
            wordIds: selected.map(word => word.id), boxes }], boxes,
          ocrRecognitionConfidence: confidence,
          ...(!uncertain ? { classificationEvidence: { kind: 'validated_rule' as const,
            typeId: hit.rule.typeId, detectorId: 'generalized_labeled_fields',
            evidenceId: `${id}:e` } } : {}),
          ...(uncertain ? { uncertaintyReason: ambiguousDate
            ? 'The date format could mean different calendar dates; review the image.'
            : 'OCR recognition may be inaccurate; review the image.' } : {}),
        });
      }
    }
    return findings;
  },
};
