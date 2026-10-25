import type { OcrWord } from '../../types';
import { extractLayoutFields } from './extractLayoutFields';
import type { DetectionInput, PrivacyDetector, UniversalFinding } from '../contracts';
import { privacyKnowledgeBase } from '../privacyKnowledgeBase';
import { adaptV1Fields } from './v1FieldAdapter';

export const v1OcrDetector: PrivacyDetector = {
  capability: {
    id: 'v1_ocr_fields', family: 'pattern', name: 'Layout-aware OCR field detection',
    status: 'implemented', verified: true,
    supportedTypeIds: ['bank_account_number', 'student_id', 'payment_amount',
      'order_number', 'email', 'home_address', 'phone'],
    limitation: 'OCR can miss text; seven conservative field patterns are supported.',
  },
  async detect(input) {
    return input.ocr ? adaptV1Fields(extractLayoutFields(input.ocr)) : [];
  },
};

type Candidate = { typeId?: 'api_key' | 'password'; label: string; regex: RegExp; minimum: number };
const candidates: readonly Candidate[] = [
  { typeId: 'api_key', label: 'API Key', regex: /\bapi[\s_-]*key\s*[:=]\s*([A-Za-z0-9_-]+(?:\s+(?:[_-][A-Za-z0-9]+|[A-Za-z0-9_-]*\d[A-Za-z0-9_-]*)){0,3})\b/ig, minimum: 12 },
  { typeId: 'password', label: 'Password', regex: /\bpassword\s*[:=]\s*(\S{8,})/ig, minimum: 8 },
  { label: 'Unclassified confidential code', regex: /\bconfidential\s+code\s*[:#=-]\s*([A-Z0-9-]{8,})\b/ig, minimum: 8 },
];

function plausibleSecret(value: string, minimum: number): boolean {
  return value.length >= minimum && new Set(value.toLowerCase()).size >= 3 &&
    !/^(?:x+|\*+|•+|0+|redacted|placeholder|example)$/i.test(value) &&
    !/(?:example|placeholder|redacted)/i.test(value);
}

function lineText(words: readonly OcrWord[]) {
  const offsets: { word: OcrWord; start: number; end: number }[] = [];
  let text = '';
  for (const word of words) {
    if (text) text += ' ';
    const start = text.length;
    text += word.text;
    offsets.push({ word, start, end: text.length });
  }
  return { text, offsets };
}

/** Conservative label-backed secrets and one explicit open-world candidate. */
export const labeledSecretDetector: PrivacyDetector = {
  capability: {
    id: 'labeled_ocr_secrets', family: 'label_context', name: 'Labeled credentials and confidential codes',
    status: 'implemented', verified: true, supportedTypeIds: ['api_key', 'password'],
    limitation: 'Requires a readable explicit label and plausible value; does not inspect arbitrary text.',
  },
  async detect(input: DetectionInput): Promise<readonly UniversalFinding[]> {
    if (!input.ocr) return [];
    const lines = new Map<string, OcrWord[]>();
    for (const word of input.ocr.words) {
      const line = lines.get(word.lineId) ?? [];
      line.push(word);
      lines.set(word.lineId, line);
    }
    const findings: UniversalFinding[] = [];
    for (const [lineId, words] of lines) {
      const { text, offsets } = lineText(words);
      for (const candidate of candidates) {
        for (const match of text.matchAll(candidate.regex)) {
          const rawValue = match[1];
          const value = candidate.typeId === 'api_key' ? rawValue?.replace(/\s/g, '') : rawValue;
          if (!rawValue || !value || !plausibleSecret(value, candidate.minimum)) continue;
          const relative = match[0].lastIndexOf(rawValue);
          const start = (match.index ?? 0) + relative;
          const selected = offsets.filter(offset => offset.start < start + rawValue.length && offset.end > start)
            .map(offset => offset.word);
          if (!selected.length) continue;
          const confidence = selected.reduce((sum, word) => sum + word.confidence, 0) / selected.length;
          const type = candidate.typeId ? privacyKnowledgeBase.type(candidate.typeId) : undefined;
          const id = `${lineId}:${candidate.typeId ?? 'unknown'}:${start}`;
          const boxes = selected.map(word => word.box);
          findings.push({
            id, source: { kind: 'image', id: input.imageId },
            status: !type ? 'UNKNOWN_POTENTIALLY_SENSITIVE' : confidence < 0.7 ? 'UNCERTAIN' : 'KNOWN',
            ...(type ? { typeId: type.id } : {}), categoryIds: type?.categoryIds ?? [],
            label: candidate.label, value,
            evidence: [{ id: `${id}:label`, detectorId: 'labeled_ocr_secrets', method: 'label_context',
              source: 'ocr', explanation: `Explicit ${candidate.label.toLowerCase()} label with a plausible value.`,
              text: value, wordIds: selected.map(word => word.id), boxes }],
            ocrRecognitionConfidence: confidence,
            ...(type && confidence >= 0.7 ? { classificationEvidence: {
              kind: 'validated_rule', typeId: type.id, detectorId: 'labeled_ocr_secrets',
              evidenceId: `${id}:label` } as const } : {}),
            ...((!type || confidence < 0.7) ? {
              uncertaintyReason: !type ? 'The label suggests confidential information, but its type is not confirmed.'
                : 'OCR text may be inaccurate; inspect the original image.',
            } : {}),
            boxes,
          });
        }
      }
    }
    return findings;
  },
};
