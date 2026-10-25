import { describe, expect, it } from 'vitest';
import type { UniversalDetectionResult, UniversalFinding } from '../contracts';
import { toEditorFields } from './toEditorFields';

const box = { x: 10, y: 20, width: 80, height: 18 };
const evidence = { id: 'e1', detectorId: 'test', method: 'label_context' as const,
  source: 'ocr' as const, explanation: 'Fictional label.', wordIds: ['w1'], boxes: [box] };
function finding(id: string, status: UniversalFinding['status'], typeId?: string): UniversalFinding {
  return { id, source: { kind: 'image', id: 'img' }, status, ...(typeId ? { typeId } : {}),
    categoryIds: [], label: id, value: 'fictional', evidence: [evidence], boxes: [box],
    ocrRecognitionConfidence: 0.92 };
}
function result(findings: UniversalFinding[]): UniversalDetectionResult {
  return { source: { kind: 'image', id: 'img' }, findings,
    coverage: { source: { kind: 'image', id: 'img' }, areas: [], warnings: [] } };
}

describe('v2 finding bridge to the existing editor', () => {
  it('preserves original boxes and stable finding IDs for supported fields', () => {
    expect(toEditorFields(result([finding('order-1', 'KNOWN', 'order_number')]))[0])
      .toMatchObject({ id: 'order-1', imageId: 'img', type: 'order_number', boxes: [box],
        wordIds: ['w1'], confidence: 0.92 });
  });
  it('routes unknown and uncertain findings to explicit review without fake boxes', () => {
    const unlocated = { ...finding('shipping', 'UNKNOWN_POTENTIALLY_SENSITIVE'),
      label: 'Shipping Address', boxes: undefined };
    const fields = toEditorFields(result([unlocated, finding('order-uncertain', 'UNCERTAIN', 'order_number'),
      finding('secret', 'KNOWN', 'api_key')]));
    expect(fields.map(field => field.type)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(fields[0]?.boxes).toEqual([]);
    expect(fields[1]?.confidence).toBe(0);
  });
});
