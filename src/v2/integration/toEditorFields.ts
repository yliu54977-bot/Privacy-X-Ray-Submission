import type { DetectedField, PrivacyFieldType } from '../../types';
import type { UniversalDetectionResult } from '../contracts';

const legacyTypes = new Set<PrivacyFieldType>([
  'bank_account_number', 'student_id', 'payment_amount', 'order_number',
  'email', 'home_address', 'phone',
]);

/** A-owned bridge to the existing editor/reducer until B's universal review UI is integrated. */
export function toEditorFields(result: UniversalDetectionResult): readonly DetectedField[] {
  if (result.source.kind !== 'image') return [];
  return result.findings.filter(finding => finding.source.kind === 'image' &&
    finding.source.id === result.source.id).map(finding => {
    const type = finding.status === 'KNOWN' && finding.typeId &&
      legacyTypes.has(finding.typeId as PrivacyFieldType)
      ? finding.typeId as PrivacyFieldType : 'unknown';
    return {
      id: finding.id,
      imageId: result.source.id,
      type,
      label: finding.label,
      value: finding.value ?? '',
      wordIds: [...new Set(finding.evidence.flatMap(item => item.wordIds ?? []))],
      boxes: finding.boxes ?? [],
      confidence: finding.status === 'KNOWN' ? finding.ocrRecognitionConfidence ?? 0
        : 0,
    };
  });
}
