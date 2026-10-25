import { describe, expect, it } from 'vitest';
import type { LocalImage, OcrResult, RedactionRect } from '../../types';
import type { SharingContextV2, UniversalDetectionResult, UniversalFinding } from '../contracts';
import { detectUniversalPrivacy } from '../detection/detectUniversalPrivacy';
import { toEditorFields } from './toEditorFields';
import { canonicalPolicyContext, universalPolicyRecommendations } from './policyAdapter';
import { initialState, sessionReducer } from '../../state/sessionReducer';
import { initialSharingContext } from './temporaryPolicy';

const source = { kind: 'image' as const, id: 'fictional' };
const box = { x: 20, y: 30, width: 120, height: 24 };
const image = { id: source.id, width: 900, height: 600 } as LocalImage;
const ocr: OcrResult = { imageId: image.id, width: image.width, height: image.height,
  language: 'eng', text: '', words: [] };
const publicContext: SharingContextV2 = { id: 'public-test', presetId: 'public_sharing',
  recipient: { name: 'Public audience', kind: 'public' }, purpose: 'Share a screenshot publicly',
  audience: 'public', informationOwner: 'self', requirements: [] };
const finding = (typeId: string | undefined, id: string, confidence = 1,
  method: 'label_context' | 'visual_object' = 'label_context'): UniversalFinding => ({
  id, source, status: typeId ? 'KNOWN' : 'UNKNOWN_POTENTIALLY_SENSITIVE',
  ...(typeId ? { typeId } : {}),
  categoryIds: typeId === 'api_key' ? ['authentication_credentials', 'technical_infrastructure']
    : typeId === 'password' ? ['authentication_credentials', 'internet_identities']
      : typeId === 'qr_code' ? ['machine_readable_metadata'] : [],
  label: typeId ?? 'Unclassified code', value: 'FICTIONAL_TOKEN_12345',
  evidence: [{ id: `${id}:e`, detectorId: 'fictional_verified_detector', method,
    source: method === 'visual_object' ? 'image' : 'ocr',
    explanation: 'Explicit fictional test evidence.', boxes: [box] }],
  ...(typeId ? { entityClassificationConfidence: confidence } : {}),
  ...(method === 'label_context' ? { ocrRecognitionConfidence: 0.94 } : {}), boxes: [box],
});
const result = (findings: readonly UniversalFinding[]): UniversalDetectionResult => ({
  source, findings, coverage: { source, areas: [{ family: 'label_context', status: 'partial',
    explanation: 'Only supported patterns were inspected.' }], warnings: ['Inspect manually.'] },
});

describe('real Universal policy integration', () => {
  it('maps only the exact three built-in purpose descriptions', () => {
    expect(canonicalPolicyContext(initialSharingContext).purpose).toBe('tuition_payment_verification');
    expect(canonicalPolicyContext(publicContext).purpose).toBe('sharing_screenshot_publicly');
    const support = { ...publicContext, presetId: 'customer_support' as const,
      recipient: { name: 'Customer support', kind: 'support' }, purpose: 'Order or refund inquiry',
      audience: 'named_recipient' as const };
    expect(canonicalPolicyContext(support).purpose).toBe('order_or_refund_inquiry');
    expect(canonicalPolicyContext({ ...publicContext, purpose: 'A custom note' }).purpose).toBe('A custom note');
    expect(canonicalPolicyContext({ ...publicContext, presetId: undefined }).purpose).toBe(publicContext.purpose);
    expect(canonicalPolicyContext({ ...publicContext, recipient: { name: 'Other recipient' },
      purpose: 'sharing_screenshot_publicly' }).presetId).toBeUndefined();
  });

  it('protects evidenced credentials and reviews unknown, weak, or unsupported cases', () => {
    const knownKey = finding('api_key', 'key');
    const knownPassword = finding('password', 'password');
    expect(universalPolicyRecommendations(result([knownKey]), initialSharingContext)[0]?.action).toBe('MASK');
    expect(universalPolicyRecommendations(result([knownPassword]), publicContext)[0]?.action).toBe('MASK');
    expect(universalPolicyRecommendations(result([finding(undefined, 'unknown')]), publicContext)[0]?.action).toBe('REVIEW');
    expect(universalPolicyRecommendations(result([{ ...knownKey, ocrRecognitionConfidence: 0.42 }]),
      initialSharingContext)[0]?.action).toBe('REVIEW');
    expect(universalPolicyRecommendations(result([{ ...knownKey, entityClassificationConfidence: undefined }]),
      initialSharingContext)[0]?.action).toBe('REVIEW');
    expect(universalPolicyRecommendations(result([knownKey]), { ...initialSharingContext,
      presetId: undefined, purpose: 'Custom payment help' })[0]?.action).toBe('REVIEW');
  });

  it('handles QR visual evidence and keeps opaque QR content under review', () => {
    expect(universalPolicyRecommendations(result([finding('api_key', 'qr-key', 1, 'visual_object')]),
      initialSharingContext)[0]?.action).toBe('MASK');
    expect(universalPolicyRecommendations(result([finding('qr_code', 'qr-unknown', 1, 'visual_object')]),
      publicContext)[0]?.action).toBe('REVIEW');
  });

  it('keeps manual masks, rebuilds linked masks and invalidates previews across decisions and contexts', () => {
    const detection = result([finding('api_key', 'key')]);
    const loaded = sessionReducer(sessionReducer(initialState, { type: 'SELECT_REVIEW_MODE', mode: 'universal' }),
      { type: 'IMAGE_LOADED', image });
    const running = sessionReducer(loaded, { type: 'SCAN_STARTED', imageId: image.id, requestId: 'scan' });
    const scanned = sessionReducer(running, { type: 'SCAN_COMPLETED', imageId: image.id,
      requestId: 'scan', ocr, fields: toEditorFields(detection), universalResult: detection });
    expect(scanned.decisions.key.action).toBe('MASK');
    expect(scanned.masks).toHaveLength(1);
    const manual: Extract<RedactionRect, { source: 'manual' }> = { id: 'manual', imageId: image.id,
      source: 'manual', shouldRedact: true, x: 300, y: 300, width: 50, height: 50 };
    const withManual = sessionReducer(scanned, { type: 'ADD_MANUAL_MASK', mask: manual });
    const previewed = sessionReducer(withManual, { type: 'PREVIEW_COMPLETED', imageId: image.id,
      revision: withManual.revision, blob: new Blob(['fictional']) });
    expect(previewed.preview).not.toBeNull();
    const switched = sessionReducer(previewed, { type: 'APPLY_UNIVERSAL_CONTEXT',
      imageId: image.id, context: publicContext });
    expect(switched.ocr).toBe(ocr);
    expect(switched.masks.some(mask => mask.id === manual.id)).toBe(true);
    expect(switched.masks.filter(mask => mask.source === 'recommendation')).toHaveLength(1);
    expect(switched.preview).toBeNull();
    const deleted = sessionReducer(switched, { type: 'DELETE_MASK', imageId: image.id,
      maskId: switched.masks.find(mask => mask.source === 'recommendation')!.id });
    expect(deleted.decisions.key).toMatchObject({ action: 'REVIEW', reviewReason: 'suggested_mask_removed' });
    expect(deleted.masks).toEqual([manual]);
    expect(sessionReducer(deleted, { type: 'PREVIEW_COMPLETED', imageId: image.id,
      revision: deleted.revision, blob: new Blob(['fictional']) })).toBe(deleted);
    const restored = sessionReducer(deleted, { type: 'UPDATE_FIELD_DECISION', imageId: image.id,
      fieldId: 'key', decision: 'MASK' });
    expect(restored.masks.filter(mask => mask.source === 'recommendation')).toHaveLength(1);
    const kept = sessionReducer(restored, { type: 'UPDATE_FIELD_DECISION', imageId: image.id,
      fieldId: 'key', decision: 'KEEP' });
    expect(kept.masks).toEqual([manual]);
  });

  it('supplies a linked rule assertion for supported matches without inventing a numeric score', async () => {
    const words = ['API', 'Key:', 'sk_test_123456789ABC'].map((text, i) => ({ id: `w${i}`,
      lineId: 'one', text, confidence: 0.91,
      box: { x: 20 + i * 90, y: 30, width: 86, height: 24 } }));
    const detected = await detectUniversalPrivacy({ imageId: image.id, imageWidth: image.width,
      imageHeight: image.height, ocr: { ...ocr, words } });
    const key = detected.findings.find(item => item.typeId === 'api_key');
    expect(key?.ocrRecognitionConfidence).toBeCloseTo(0.91);
    expect(key?.entityClassificationConfidence).toBeUndefined();
    expect(key?.classificationEvidence).toMatchObject({ kind: 'validated_rule',
      typeId: 'api_key', detectorId: 'labeled_ocr_secrets',
      evidenceId: key?.evidence[0]?.id });
    expect(universalPolicyRecommendations(detected, initialSharingContext)
      .find(item => item.findingId === key?.id)?.action).toBe('MASK');
    const passwordWords = ['Password:', 'fictionalP@ssword42'].map((text, i) => ({ id: `p${i}`,
      lineId: 'password-line', text, confidence: 0.93,
      box: { x: 30 + i * 130, y: 85, width: 125, height: 24 } }));
    const passwordResult = await detectUniversalPrivacy({ imageId: image.id, imageWidth: image.width,
      imageHeight: image.height, ocr: { ...ocr, words: passwordWords } });
    expect(passwordResult.findings[0]?.entityClassificationConfidence).toBeUndefined();
    expect(universalPolicyRecommendations(passwordResult, publicContext)[0]?.action).toBe('MASK');
  });
});
