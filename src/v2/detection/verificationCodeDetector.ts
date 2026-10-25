import type { OcrWord } from '../../types';
import type { PrivacyDetector, UniversalFinding } from '../contracts';

const rules = [
  { label: 'Verification code', pattern: /(?:\b(?:verification|authentication|one[- ]time|security)\s+code|\bOTP|验\s*证\s*码)\s*[:：=]\s*(\d{4,8})(?![\p{L}\p{N}_-])/giu },
  { label: 'Recovery code', pattern: /(?:\b(?:recovery|backup)\s+code|恢\s*复\s*码)\s*[:：=]\s*([A-Z0-9]{4}(?:-[A-Z0-9]{4}){1,3})(?![\p{L}\p{N}_-])/giu },
] as const;

/** Label-backed candidates, deliberately unclassified until a taxonomy/policy review. */
export const verificationCodeDetector: PrivacyDetector = {
  capability: {
    id: 'labeled_verification_codes', family: 'label_context',
    name: 'Labeled verification and recovery codes', status: 'implemented', verified: true,
    supportedTypeIds: [],
    limitation: 'Checks explicit English or Chinese labels on one OCR line. Unlabeled, split-digit and expired codes are not assessed.',
  },
  async detect(input) {
    if (!input.ocr) return [];
    const lines = new Map<string, OcrWord[]>();
    for (const word of input.ocr.words) {
      const words = lines.get(word.lineId) ?? [];
      words.push(word);
      lines.set(word.lineId, words);
    }
    const findings: UniversalFinding[] = [];
    for (const [lineId, words] of lines) {
      let text = '';
      const offsets = [...words].sort((a, b) => a.box.x - b.box.x).map(word => {
        if (text) text += ' ';
        const start = text.length;
        text += word.text;
        return { word, start, end: text.length };
      });
      for (const rule of rules) {
        for (const match of text.matchAll(rule.pattern)) {
          const value = match[1]!;
          if (/^(?:0+|X+(?:-X+)*)$/i.test(value)) continue;
          const start = match.index! + match[0].lastIndexOf(value);
          const selected = offsets.filter(item => item.start < start + value.length && item.end > start)
            .map(item => item.word);
          if (!selected.length) continue;
          const id = `verification:${input.imageId}:${lineId}:${start}`;
          const boxes = selected.map(word => word.box);
          findings.push({
            id, source: { kind: 'image', id: input.imageId },
            status: 'UNKNOWN_POTENTIALLY_SENSITIVE', categoryIds: [], label: rule.label, value,
            ocrRecognitionConfidence: selected.reduce((sum, word) => sum + word.confidence, 0) / selected.length,
            uncertaintyReason: 'An explicit label suggests an access code. Its validity and classification are not confirmed; review before sharing.',
            evidence: [{ id: `${id}:label`, detectorId: 'labeled_verification_codes',
              method: 'label_context', source: 'ocr', text: value,
              explanation: 'A readable verification or recovery label precedes a code-shaped value.',
              wordIds: selected.map(word => word.id), boxes }],
            boxes,
          });
        }
      }
    }
    return findings;
  },
};
