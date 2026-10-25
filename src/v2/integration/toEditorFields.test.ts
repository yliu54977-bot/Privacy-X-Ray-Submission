import type { OcrResult } from '../../types';
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

const protectedOcr: OcrResult = {imageId:'img',width:200,height:100,language:'eng',text:'fictional',
  words:[{id:'w1',lineId:'line',text:'fictional',confidence:.9,box,coverageBox:{...box,x:5,width:90}}]};
it('uses the same text edge protection for linked fields while preserving source and decision identity',()=>{
 const input=result([finding('field','KNOWN','email')]);const field=toEditorFields(input,protectedOcr)[0]!;
 expect(field.id).toBe('field');expect(field.boxes[0]!.x).toBeLessThan(5);
 expect(field.boxes[0]!.x+field.boxes[0]!.width).toBeGreaterThan(95);
 expect(input.findings[0]!.boxes).toEqual([box]);
});
it('does not manufacture unlocated boxes, alter visual regions, or use stale OCR',()=>{
 const visual={...finding('face','KNOWN'),evidence:[{...evidence,source:'image' as const}]};
 expect(toEditorFields(result([visual]),protectedOcr)[0]!.boxes).toEqual([box]);
 expect(toEditorFields(result([{...finding('unlocated','KNOWN'),boxes:undefined}]),protectedOcr)[0]!.boxes).toEqual([]);
 expect(toEditorFields(result([finding('field','KNOWN')]),{...protectedOcr,imageId:'old'})[0]!.boxes).toEqual([box]);
});
it('never expands into another column merely because evidence lists the same word',()=>{
 const remote={x:120,y:20,width:30,height:18};
 expect(toEditorFields(result([{...finding('field','KNOWN'),boxes:[remote]}]),protectedOcr)[0]!.boxes).toEqual([remote]);
});
