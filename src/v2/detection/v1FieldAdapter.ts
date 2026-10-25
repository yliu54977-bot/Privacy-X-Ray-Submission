import type { DetectedField } from '../../types';
import type { UniversalFinding } from '../contracts';
import { privacyKnowledgeBase } from '../privacyKnowledgeBase';

/** Independent tested label/value predicate; no numerical classification score is invented. */
function classificationRuleMatched(field: DetectedField): boolean {
  switch (field.type) {
    case 'email': return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(field.value);
    case 'bank_account_number': return /bank|account|acct|账/iu.test(field.label) &&
      /^\d{8,19}$/.test(field.value.replace(/[\s-]/g, ''));
    case 'student_id': return /student|学/iu.test(field.label) && /^[A-Z0-9-]{5,16}$/i.test(field.value);
    case 'payment_amount': return /payment|amount|金\s*额/u.test(field.label.toLowerCase()) &&
      /^(?:[$£€¥￥]\s*)?\d[\d,]*(?:\.\d{1,2})?$/.test(field.value);
    case 'order_number': return /order|订/u.test(field.label.toLowerCase()) &&
      /^[A-Z0-9-]{5,24}$/i.test(field.value);
    case 'home_address': return /home|家/u.test(field.label.toLowerCase()) &&
      /\d/u.test(field.value) && /\p{L}/u.test(field.value);
    case 'phone': return /phone|mobile|tel|手|联/u.test(field.label.toLowerCase()) &&
      /^\d{10,15}$/.test(field.value.replace(/\D/g, ''));
    default: return false;
  }
}

/** Preserve the seven proven v1 candidates without changing the v1 OCR/editor contracts. */
export function adaptV1Fields(fields: readonly DetectedField[]): readonly UniversalFinding[] {
  return fields.map(field => {
    const type = privacyKnowledgeBase.type(field.type);
    const located = field.boxes.length > 0 ? { boxes: field.boxes } : {};
    return {
      id: `v1:${field.id}`,
      source: { kind: 'image' as const, id: field.imageId },
      status: type ? (field.confidence >= 0.7 ? 'KNOWN' as const : 'UNCERTAIN' as const)
        : 'UNKNOWN_POTENTIALLY_SENSITIVE' as const,
      ...(type ? { typeId: type.id } : {}),
      categoryIds: type?.categoryIds ?? [],
      label: field.label,
      value: field.value,
      evidence: [{
        id: `v1:${field.id}:ocr`, detectorId: 'v1_ocr_fields',
        method: field.type === 'email' ? 'pattern' as const : 'label_context' as const,
        source: 'ocr' as const,
        explanation: type ? type.evidenceRequirements[0]! : 'Plausible OCR field with an unclassified type.',
        text: field.value, wordIds: field.wordIds, ...located,
      }],
      ocrRecognitionConfidence: field.confidence,
      ...(type && field.confidence >= 0.7 && classificationRuleMatched(field)
        ? { classificationEvidence: { kind: 'validated_rule' as const,
          typeId: type.id, detectorId: 'v1_ocr_fields', evidenceId: `v1:${field.id}:ocr` } } : {}),
      ...(field.confidence < 0.7 ? { uncertaintyReason: 'OCR text may be inaccurate; inspect the original image.' } : {}),
      ...located,
    };
  });
}
