import { recognizeContent, selectionBoxes } from '../../features/recognition/content';
import type { DetectedField, OcrResult, PrivacyFieldType } from '../../types';
import type { UniversalDetectionResult } from '../contracts';

const legacyTypes = new Set<PrivacyFieldType>([
  'bank_account_number', 'student_id', 'payment_amount', 'order_number',
  'email', 'home_address', 'phone',
]);

/** Preserve finding identity; optionally protect located OCR text for linked masks.
 * Policy receives the original detection result, not these editor extents. */
export function toEditorFields(result: UniversalDetectionResult, ocr?: OcrResult): readonly DetectedField[] {
  if (result.source.kind !== 'image') return [];
  const content = ocr?.imageId === result.source.id ? recognizeContent(ocr) : undefined;
  return result.findings.filter(finding => finding.source.kind === 'image' &&
    finding.source.id === result.source.id).map(finding => {
    const type = finding.status === 'KNOWN' && finding.typeId &&
      legacyTypes.has(finding.typeId as PrivacyFieldType)
      ? finding.typeId as PrivacyFieldType : 'unknown';
    const boxes = finding.boxes ?? [];
    const textIds = new Set(finding.evidence.filter(e => e.source === 'ocr').flatMap(e => e.wordIds ?? []));
    // Never manufacture coordinates, enlarge visual detections, or use another source's words.
    const protectedBoxes = content && !finding.evidence.some(e => e.source === 'image') ? boxes.map(box => {
      const words = content.words.filter(word => word.originalWordIds.some(id => textIds.has(id)) &&
        Math.min(word.box.x + word.box.width, box.x + box.width) > Math.max(word.box.x, box.x) &&
        Math.min(word.box.y + word.box.height, box.y + box.height) > Math.max(word.box.y, box.y));
      const guards = selectionBoxes(content, words.map(w => ({kind: 'word' as const, id: w.id})), result.source.id);
      if (!guards.length) return box;
      const x = Math.min(box.x, ...guards.map(b => b.x)), y = Math.min(box.y, ...guards.map(b => b.y));
      return {x, y, width: Math.max(box.x + box.width, ...guards.map(b => b.x + b.width)) - x,
        height: Math.max(box.y + box.height, ...guards.map(b => b.y + b.height)) - y};
    }) : boxes;
    return {
      id: finding.id,
      imageId: result.source.id,
      type,
      label: finding.label,
      value: finding.value ?? '',
      wordIds: [...new Set(finding.evidence.flatMap(item => item.wordIds ?? []))],
      boxes: protectedBoxes,
      confidence: finding.status === 'KNOWN' ? finding.ocrRecognitionConfidence ?? 0
        : 0,
    };
  });
}
