import { describe, expect, it } from 'vitest';
import type { OcrResult } from '../../types';
import type { UniversalDetectionResult } from '../contracts';
import { summarizeOcrDiagnostics } from './diagnostics';

describe('development-only aggregate OCR diagnostics', () => {
  it('separates recognition misses from classification misses without returning text', () => {
    const ocr: OcrResult = { imageId: 'fictional', width: 100, height: 100, language: 'eng',
      text: 'Student ID S12345 Booking BK-12345', words: [
        { id: 'one', lineId: 'l1', text: 'S12345', confidence: .9,
          box: { x: 1, y: 1, width: 20, height: 10 } },
        { id: 'two', lineId: 'l2', text: 'BK-12345', confidence: .9,
          box: { x: 1, y: 30, width: 20, height: 10 } },
      ] };
    const result: UniversalDetectionResult = { source: { kind: 'image', id: 'fictional' },
      coverage: { source: { kind: 'image', id: 'fictional' }, warnings: [], areas: [] },
      findings: [{ id: 'f1', source: { kind: 'image', id: 'fictional' }, status: 'KNOWN',
        typeId: 'student_id', categoryIds: [], label: 'Student ID', value: 'S12345',
        evidence: [{ id: 'e', detectorId: 'test', method: 'label_context', source: 'ocr',
          explanation: 'Fictional', wordIds: ['one'] }] }] };
    const diagnostic = summarizeOcrDiagnostics(ocr, result, { visibleText:
      'Student ID S12345 Booking BK-12345 DOB 2000-01-01',
      annotations: [{ text: 'S12345', typeId: 'student_id' },
        { text: 'BK-12345', typeId: 'booking_reference' },
        { text: '2000-01-01', typeId: 'date_of_birth' }] });
    expect(diagnostic).toMatchObject({ visibleItems: 3, recognizedItems: 2,
      recognitionMisses: 1, classificationMisses: 1, detectedFindings: 1,
      unclassifiedFindings: 0, unassignedOcrWords: 1 });
    expect(JSON.stringify(diagnostic)).not.toContain('S12345');
    expect(summarizeOcrDiagnostics(ocr, result)).toMatchObject({
      visibleItems: null, recognitionMisses: null, classificationMisses: null,
      characterAccuracy: null, wordAccuracy: null });
  });
});
