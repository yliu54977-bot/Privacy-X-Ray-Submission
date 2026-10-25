import { describe, expect, it, vi } from 'vitest';
import type { OcrResult, OcrWord } from '../../types';
import type { DetectionInput, PrivacyDetector, UniversalFinding } from '../contracts';
import { detectUniversalPrivacy, detectorCapabilities } from './detectUniversalPrivacy';

function ocr(lines: string[], confidence = 0.91): OcrResult {
  let wordIndex = 0;
  const words: OcrWord[] = lines.flatMap((line, lineIndex) => {
    let x = 10;
    return line.split(' ').map(text => {
      const width = Math.max(10, text.length * 8);
      const word = { id: `w-${wordIndex++}`, lineId: `line-${lineIndex}`, text,
        box: { x, y: lineIndex * 40 + 10, width, height: 22 }, confidence };
      x += width + 8;
      return word;
    });
  });
  return { imageId: 'fictional', width: 1200, height: 850, language: 'eng',
    text: lines.join('\n'), words };
}

const input = (lines: string[], confidence?: number): DetectionInput => ({
  imageId: 'fictional', imageWidth: 1200, imageHeight: 850, ocr: ocr(lines, confidence),
});

describe('universal local detection', () => {
  it('adapts all seven v1 fields and adds only label-backed secret candidates', async () => {
    const result = await detectUniversalPrivacy(input([
      'Bank Account Number: 1234 5678 9012',
      'Student ID: S1234567',
      'Payment Amount: $1,234.56',
      'Order Number: ORD-482913',
      'Email: student@example.test',
      'Home Address: 123 Fictional Lane',
      'Phone Number: 416-555-0142',
      'API Key: sk_test_123456789ABC',
      'Password: fictionalP@ssword42',
      'Confidential Code: ABC12345',
    ]));
    expect(new Set(result.findings.map(finding => finding.typeId))).toEqual(new Set([
      'bank_account_number', 'student_id', 'payment_amount', 'order_number',
      'email', 'home_address', 'phone', 'api_key', 'password', undefined,
    ]));
    expect(result.findings.find(finding => finding.label === 'Unclassified confidential code'))
      .toMatchObject({ status: 'UNKNOWN_POTENTIALLY_SENSITIVE', categoryIds: [] });
    expect(result.findings.every(finding => finding.source.kind === 'image' &&
      finding.source.id === 'fictional' && !!finding.boxes?.length)).toBe(true);
    expect(result.coverage.areas.find(area => area.family === 'visual_object')?.status)
      .toBe('uninspected');
    expect(result.coverage.warnings.join(' ')).toMatch(/OCR may miss|Not inspected/);
  });

  it('does not mark ordinary words, arbitrary numbers, or placeholder secrets as findings', async () => {
    const result = await detectUniversalPrivacy(input([
      'Meeting begins at 13:30', 'Reference 123456789012',
      'API Key: placeholder', 'Password: ********',
    ]));
    expect(result.findings).toEqual([]);
    expect(result.coverage.warnings.length).toBeGreaterThan(0);
  });

  it('recognizes an OCR-split labeled API key without absorbing the next label', async () => {
    const result = await detectUniversalPrivacy(input([
      'API Key: sk _test 123456789ABC Password: FictionalPass42',
    ]));
    expect(result.findings.map(finding => finding.typeId)).toEqual(['api_key', 'password']);
    expect(result.findings[0]?.value).toBe('sk_test123456789ABC');
    expect(result.findings[0]?.boxes?.length).toBeGreaterThan(0);
  });

  it('marks low OCR confidence as uncertain without treating it as policy confidence', async () => {
    const result = await detectUniversalPrivacy(input(['Password: fictionalP@ssword42'], 0.42));
    expect(result.findings[0]).toMatchObject({ status: 'UNCERTAIN',
      ocrRecognitionConfidence: 0.42 });
    expect(result.findings[0]?.entityClassificationConfidence).toBeUndefined();
  });

  it('requires meaningful source identity and prevents OCR-only detectors from seeing pixels', async () => {
    const ocrOnly = vi.fn(async (_input: DetectionInput) => [] as readonly UniversalFinding[]);
    const pixelDetector = vi.fn(async (_input: DetectionInput) => [] as readonly UniversalFinding[]);
    const detectors: PrivacyDetector[] = [
      { capability: { id: 'ocr_only', family: 'pattern', name: 'OCR only', status: 'implemented',
        verified: true, supportedTypeIds: [], limitation: '' }, detect: ocrOnly },
      { capability: { id: 'pixels', family: 'visual_object', name: 'Pixel reader', status: 'implemented',
        verified: true, supportedTypeIds: [], limitation: '', requiresImagePixels: true }, detect: pixelDetector },
    ];
    const imagePixels = { imageId: 'fictional', width: 1200, height: 850,
      readPixels: vi.fn(async () => new ImageData(1, 1)) };
    await detectUniversalPrivacy({ ...input(['Hello there']), imagePixels }, detectors);
    expect(ocrOnly.mock.calls).toHaveLength(1);
    expect(ocrOnly.mock.calls[0]?.[0].imagePixels).toBeUndefined();
    expect(pixelDetector.mock.calls[0]?.[0].imagePixels).toBe(imagePixels);
    await expect(detectUniversalPrivacy({ ...input(['Hello']), imageId: 'other' }))
      .rejects.toThrow('does not match');
    await expect(detectUniversalPrivacy({ ...input(['Hello']), imagePixels: { ...imagePixels, imageId: 'other' } }, detectors))
      .rejects.toThrow('does not match');
  });

  it('contains detector failure and rejects false source/geometry claims', async () => {
    const bad: PrivacyDetector = { capability: { id: 'bad', family: 'pattern', name: 'Bad detector',
      status: 'implemented', verified: true, supportedTypeIds: [], limitation: '' },
    detect: async () => { throw new Error('private OCR text must not appear in logs'); } };
    const result = await detectUniversalPrivacy(input(['Hello']), [bad]);
    expect(result.findings).toEqual([]);
    expect(result.coverage.warnings.join(' ')).toContain('Bad detector could not complete');
    expect(result.coverage.warnings.join(' ')).not.toContain('private OCR text');
    const wrongBox: UniversalFinding = { id: 'f', source: { kind: 'image', id: 'fictional' },
      status: 'KNOWN', typeId: 'email', categoryIds: ['contact_information'], label: 'Email',
      evidence: [{ id: 'e', detectorId: 'wrong_box', method: 'pattern', source: 'ocr', explanation: 'Test' }],
      boxes: [{ x: 2000, y: 1, width: 10, height: 10 }] };
    const detector: PrivacyDetector = { capability: { id: 'wrong_box', family: 'pattern',
      name: 'Box', status: 'implemented', verified: true, supportedTypeIds: ['email'], limitation: '' },
      detect: async () => [wrongBox] };
    const sanitized = await detectUniversalPrivacy(input(['Hello']), [detector]);
    expect(sanitized.findings[0]).toMatchObject({ status: 'UNCERTAIN', boxes: undefined });
  });

  it('drops classification assertions not tied to the registered detector evidence', async () => {
    const candidate: UniversalFinding = { id: 'fake', source: { kind: 'image', id: 'fictional' },
      status: 'KNOWN', typeId: 'api_key', categoryIds: ['authentication_credentials', 'technical_infrastructure'],
      label: 'API Key', evidence: [{ id: 'e', detectorId: 'other_detector', method: 'label_context',
        source: 'ocr', explanation: 'A claimed label.' }],
      classificationEvidence: { kind: 'validated_rule', typeId: 'api_key',
        detectorId: 'other_detector', evidenceId: 'e' } };
    const detector: PrivacyDetector = { capability: { id: 'registered_detector', family: 'label_context',
      name: 'Registered detector', status: 'implemented', verified: true,
      supportedTypeIds: ['api_key'], limitation: '' }, detect: async () => [candidate] };
    const result = await detectUniversalPrivacy(input(['Hello']), [detector]);
    expect(result.findings[0]?.classificationEvidence).toBeUndefined();
  });

  it('represents future PDF/DOCX findings without fabricated image boxes', () => {
    const common = { id: 'future', status: 'UNKNOWN_POTENTIALLY_SENSITIVE' as const,
      categoryIds: [], label: 'Unclassified item', evidence: [] };
    const pdf = { ...common, source: { kind: 'pdf' as const, id: 'pdf-1', pageIndex: 0 } } satisfies UniversalFinding;
    const docx = { ...common, source: { kind: 'docx' as const, id: 'docx-1' } } satisfies UniversalFinding;
    expect(pdf).not.toHaveProperty('boxes');
    expect(docx).not.toHaveProperty('boxes');
    expect(detectorCapabilities().some(capability => capability.family === 'metadata' &&
      capability.status === 'unsupported')).toBe(true);
  });
});
