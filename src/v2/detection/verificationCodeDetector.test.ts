import { describe, expect, it } from 'vitest';
import type { DetectionInput } from '../contracts';
import { detectUniversalPrivacy } from './detectUniversalPrivacy';
import { verificationCodeDetector } from './verificationCodeDetector';
import { universalPolicyRecommendations, toReducerRecommendations } from '../integration/policyAdapter';
import { initialSharingContext } from '../integration/temporaryPolicy';

function input(text: string): DetectionInput {
  let x = 10;
  return { imageId: 'synthetic', imageWidth: 1600, imageHeight: 900,
    ocr: { imageId: 'synthetic', width: 1600, height: 900, language: 'eng', text,
      words: text.split(' ').map((text, index) => {
        const width = text.length * 8;
        const word = { id: `word-${index}`, lineId: 'line', text, confidence: 0.9,
          box: { x, y: 20, width, height: 20 } };
        x += width + 8;
        return word;
      }) } };
}

describe('label-backed access code recognition', () => {
  it.each(['Verification code: 573921', 'OTP: 8274', '验证码：573921',
    '验 证 码 ：573921', 'Recovery code: A3BC-9DEF', 'Backup code: C8DE-4FGH'])
  ('recognizes %s with original word geometry and uncertain classification', async text => {
    const source = input(text);
    const findings = await verificationCodeDetector.detect(source);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ status: 'UNKNOWN_POTENTIALLY_SENSITIVE',
      categoryIds: [], source: { kind: 'image', id: 'synthetic' } });
    expect(findings[0]?.typeId).toBeUndefined();
    expect(findings[0]?.boxes).toEqual([source.ocr!.words.at(-1)!.box]);
    expect(findings[0]?.evidence[0]?.source).toBe('ocr');
  });

  it.each(['573921', 'Order number: 573921', 'Verification code: 123456789',
    'OTP: 000000', 'OTP: 1234abc', 'OTP: 1234-5678', 'Recovery code: XXXX-XXXX',
    'Recovery code: A3BC-9DEF-12345', 'OTP: ******', 'OTP: expired'])
  ('rejects unlabeled or unsupported values: %s', async text => {
    expect(await verificationCodeDetector.detect(input(text))).toEqual([]);
  });

  it('recognizes multiple labels, independent of OCR array ordering, without mutating OCR', async () => {
    const source = input('OTP: 573921 Recovery code: A3BC-9DEF');
    const reversed = { ...source, ocr: { ...source.ocr!, words: [...source.ocr!.words].reverse() } };
    const original = JSON.stringify(reversed);
    const result = await verificationCodeDetector.detect(reversed);
    expect(result.map(item => item.value)).toEqual(['573921', 'A3BC-9DEF']);
    expect(new Set(result.map(item => item.id)).size).toBe(2);
    expect(JSON.stringify(reversed)).toBe(original);
  });

  it('returns no findings without OCR and preserves low recognition confidence', async () => {
    expect(await verificationCodeDetector.detect({ imageId: 'synthetic', imageWidth: 50, imageHeight: 50 })).toEqual([]);
    const source = input('OTP: 573921');
    const result = await verificationCodeDetector.detect({ ...source,
      ocr: { ...source.ocr!, words: source.ocr!.words.map(word => ({ ...word, confidence: 0.2 })) } });
    expect(result[0]?.ocrRecognitionConfidence).toBeCloseTo(0.2);
    expect(result[0]?.status).toBe('UNKNOWN_POTENTIALLY_SENSITIVE');
  });

  it('runs in the application pipeline without inventing a taxonomy type or hiding coverage warnings', async () => {
    const result = await detectUniversalPrivacy(input('Verification code: 573921'));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.label).toBe('Verification code');
    expect(result.coverage.warnings.length).toBeGreaterThan(0);
    const recommendations = universalPolicyRecommendations(result, initialSharingContext);
    expect(recommendations[0]?.action).toBe('REVIEW');
    expect(toReducerRecommendations(result, recommendations)[0]).toMatchObject({
      fieldId: result.findings[0]!.id, imageId: 'synthetic', action: 'REVIEW',
    });
  });
});
