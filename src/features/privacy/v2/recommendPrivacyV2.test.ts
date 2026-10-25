import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DetectedField, PrivacyContext } from '../../../types';
import type { ContentSourceRef, SharingContextV2, UniversalDetectionResult, UniversalFinding } from '../../../v2/contracts';
import { privacyTypes } from '../../../v2/privacyKnowledgeBase';
import { recommendPrivacy } from '../recommendPrivacy';
import { recommendPrivacyV1Compatibility } from './compatibility';
import { POLICY_DESCRIPTORS, POLICY_VERSION } from './policyDescriptors';
import type { PolicyDescriptor } from './policyDescriptors';
import { createPrivacyPolicy, recommendPrivacyV2 } from './recommendPrivacyV2';

const source: ContentSourceRef = { kind: 'image', id: 'fictional-image' };
const context = (patch: Partial<SharingContextV2> = {}): SharingContextV2 => ({
  id: 'fictional-context', presetId: 'public_sharing', recipient: { name: 'Public audience' },
  purpose: 'sharing_screenshot_publicly', audience: 'public', informationOwner: 'self', requirements: [], ...patch,
});
const support = (patch: Partial<SharingContextV2> = {}): SharingContextV2 => context({
  presetId: 'customer_support', recipient: { name: 'Fictional support' }, purpose: 'order_or_refund_inquiry',
  audience: 'named_recipient', ...patch,
});
function finding(typeId = 'email', patch: Partial<UniversalFinding> = {}): UniversalFinding {
  const d = POLICY_DESCRIPTORS.find(item => item.typeId === typeId);
  const method = d?.evidenceMethods[0] ?? 'label_context';
  return { id: 'f1', source, status: 'KNOWN', typeId, categoryIds: d?.categoryIds ?? ['new_category'],
    label: 'Fictional field', value: 'FICTIONAL_SECRET_CANARY', entityClassificationConfidence: 0.95,
    ocrRecognitionConfidence: 0.95,
    evidence: [{ id: 'e1', detectorId: 'fictional-detector', method,
      source: method === 'visual_object' ? 'image' : method === 'metadata' ? 'metadata' : method === 'relationship' ? 'derived' : 'ocr',
      explanation: 'Fictional direct detection evidence.' }], ...patch };
}
function detection(findings: readonly UniversalFinding[] = [finding()]): UniversalDetectionResult {
  return { source, findings, coverage: { source, areas: [{ family: 'pattern', status: 'inspected',
    explanation: 'Only the fictional test detector was inspected.' }], warnings: [] } };
}
const run = (f = finding(), c = context()) => recommendPrivacyV2(detection([f]), c)[0];
const needed = { id: 'r1', typeId: 'email', description: 'A stated request', importance: 'needed' as const, confirmedByUser: true };
const deepFreeze = <T,>(value: T): T => {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('explicit machine-readable policy classes', () => {
  it('maps exactly the checkpoint knowledge-base types and declared evidence methods', () => {
    expect(POLICY_DESCRIPTORS.map(d => d.typeId).sort()).toEqual(privacyTypes.map(t => t.id).sort());
    for (const d of POLICY_DESCRIPTORS) {
      const t = privacyTypes.find(t => t.id === d.typeId)!;
      expect(d.categoryIds).toEqual(t.categoryIds);
      expect(d.evidenceMethods).toEqual(t.detectionMethods);
    }
  });
  it.each(POLICY_DESCRIPTORS.filter(d => !d.classes.includes('relationship') && !d.classes.includes('opaque_content')))
    ('protects supported $typeId for public sharing', d => {
      const result = run(finding(d.typeId));
      expect(result.action).toBe('MASK');
      expect(result.factors).toEqual(expect.arrayContaining(d.classes.map(c => `class:${c}`)));
    });
  it.each(['family_relationship', 'behavioral_history', 'inferred_relationship'])('defers %s relationships', typeId => {
    expect(run(finding(typeId)).action).toBe('REVIEW');
  });
  it('requires content review for an opaque code', () => {
    expect(run(finding('qr_code')).uncertaintyCodes).toContain('encoded_content_unknown');
  });
  it('accepts a traceable detector rule without inventing classification confidence', () => {
    const validated = finding('api_key', { entityClassificationConfidence: undefined,
      classificationEvidence: { kind: 'validated_rule', typeId: 'api_key',
        detectorId: 'fictional-detector', evidenceId: 'e1' } });
    expect(run(validated, support()).action).toBe('MASK');
    expect(run({ ...validated, classificationEvidence: { ...validated.classificationEvidence!,
      evidenceId: 'not-the-evidence' } }, support()).action).toBe('REVIEW');
  });
  it.each(['future_access_token', '__proto__', 'constructor', 'password_extra', 'medical_diagnosis_v99'])
    ('does not infer semantics from unknown ID %s', typeId => {
      const r = run(finding(typeId, { categoryIds: ['authentication_credentials'], label: 'password grants access' }));
      expect(r.action).toBe('REVIEW');
      expect(r.rule.source).toContain('classification-unsupported');
    });
  it('does not classify unmatched ordinary text or manufacture findings', () => {
    expect(recommendPrivacyV2(detection([]), context())).toEqual([]);
  });
  it('supports a new type/category through declared classes without a context matrix', () => {
    const extension: PolicyDescriptor = { typeId: 'fictional_new_type', categoryIds: ['fictional_new_category'],
      classes: ['personal_identifier'], evidenceMethods: ['label_context'] };
    const policy = createPrivacyPolicy([extension]);
    expect(policy(detection([finding(extension.typeId, { categoryIds: extension.categoryIds })]), context())[0].action).toBe('MASK');
  });
  it('protects a newly declared credential type through the general access principle', () => {
    const d: PolicyDescriptor = { typeId: 'fictional_credential', categoryIds: ['new_access_category'],
      classes: ['access_secret'], evidenceMethods: ['label_context'] };
    expect(createPrivacyPolicy([d])(detection([finding(d.typeId, { categoryIds: d.categoryIds })]), support())[0].action).toBe('MASK');
  });
  it('takes a snapshot of extension semantics and rejects replacement of built-ins', () => {
    const classes: PolicyDescriptor['classes'][number][] = ['access_secret'];
    const d = { typeId: 'new_type', categoryIds: ['new_category'], classes, evidenceMethods: ['label_context'] as const };
    const policy = createPrivacyPolicy([d]); classes.splice(0, 1, 'transaction');
    expect(policy(detection([finding('new_type')]), support())[0].rule.source).toContain('access-secret-protection');
    expect(() => createPrivacyPolicy([POLICY_DESCRIPTORS[0]])).toThrow(TypeError);
  });
  it('rejects invalid extension semantics instead of interpreting English', () => {
    expect(() => createPrivacyPolicy([{ typeId: 'x', categoryIds: ['x'], classes: ['harmless'] } as unknown as PolicyDescriptor])).toThrow(TypeError);
    expect(() => createPrivacyPolicy(null as unknown as PolicyDescriptor[])).toThrow(TypeError);
  });
});

describe('evidence, ownership and context gates', () => {
  it.each(['UNCERTAIN', 'UNKNOWN_POTENTIALLY_SENSITIVE'] as const)('reviews %s even with readable OCR', status => {
    expect(run(finding('password', { status, ocrRecognitionConfidence: 1 })).action).toBe('REVIEW');
  });
  it.each([undefined, -1, 1.1, NaN, Infinity, 0.79])('reviews uncertain classification %s', entityClassificationConfidence => {
    expect(run(finding('email', { entityClassificationConfidence })).action).toBe('REVIEW');
  });
  it.each([undefined, 0.69, -1, 1.1, NaN])('reviews insufficient OCR %s independently', ocrRecognitionConfidence => {
    expect(run(finding('email', { ocrRecognitionConfidence })).action).toBe('REVIEW');
  });
  it('does not require OCR scores for independent visual evidence', () => {
    const f = finding('face_image', { ocrRecognitionConfidence: undefined,
      evidence: [{ id: 'visual-e', detectorId: 'fictional-visual', method: 'visual_object', source: 'image', explanation: 'Local fictional face evidence' }] });
    expect(run(f).action).toBe('MASK');
  });
  it('can protect a credential despite low OCR if a declared independent method supports it', () => {
    const d: PolicyDescriptor = { typeId: 'fictional_visual_secret', categoryIds: ['new_category'], classes: ['access_secret'],
      evidenceMethods: ['label_context', 'visual_object'] };
    const f = finding(d.typeId, { ocrRecognitionConfidence: 0.2, evidence: [
      { id: 'e-ocr', detectorId: 'd', method: 'label_context', source: 'ocr', explanation: 'Fictional OCR evidence' },
      { id: 'e-image', detectorId: 'v', method: 'visual_object', source: 'image', explanation: 'Independent fictional evidence' },
    ] });
    const r = createPrivacyPolicy([d])(detection([f]), support())[0];
    expect(r.action).toBe('MASK'); expect(r.uncertaintyCodes).toContain('ocr_readability_uncertain');
    expect(r.evidenceIds).toEqual(['e-image']);
  });
  it.each([
    { evidence: [] }, { categoryIds: [] }, { categoryIds: ['wrong_category'] },
    { uncertaintyReason: 'Ambiguous candidate' }, { label: '' },
    { evidence: [{ id: 'e1', detectorId: 'd', method: 'pattern', source: 'derived', explanation: 'Unverified derived text' }] },
  ] satisfies Partial<UniversalFinding>[])('reviews missing or unsupported evidence %#', patch => {
    expect(run(finding('email', patch)).action).toBe('REVIEW');
  });
  it('reviews duplicate evidence IDs', () => {
    const f = finding(); expect(run({ ...f, evidence: [f.evidence[0], f.evidence[0]] }).action).toBe('REVIEW');
  });
  it.each([
    { typeId: 'face_image', method: 'visual_object', source: 'ocr' },
    { typeId: 'gps_metadata', method: 'metadata', source: 'image' },
  ] as const)('reviews contradictory method/source provenance for $typeId', item => {
    expect(run(finding(item.typeId, { evidence: [{ id: 'e1', detectorId: 'd',
      method: item.method, source: item.source, explanation: 'Contradictory fictional provenance' }] })).action).toBe('REVIEW');
  });
  it.each(['unknown', 'mixed', 'another_person'] as const)('does not assume authority for %s ownership', informationOwner => {
    expect(run(finding(), context({ informationOwner })).action).toBe('REVIEW');
  });
  it('does not treat organization ownership as authority over a person', () => {
    expect(run(finding(), context({ informationOwner: 'organization' })).action).toBe('REVIEW');
    expect(run(finding('business_plan'), context({ informationOwner: 'organization' })).action).toBe('MASK');
  });
  it.each([
    { presetId: undefined, purpose: 'Please trust this custom purpose' },
    { presetId: 'university', purpose: 'custom scholarship verification' },
    { audience: 'unknown' }, { recipient: { name: '' } }, { audience: 'named_recipient' },
  ] satisfies Partial<SharingContextV2>[])('reviews unsupported context %# without interpreting prose', patch => {
    expect(run(finding(), context(patch)).action).toBe('REVIEW');
  });
  it('does not infer verified recipient identity from name or kind', () => {
    const r = run(finding(), support({ recipient: { name: 'Official trusted university', kind: 'verified' }, requirements: [needed] }));
    expect(r.action).toBe('REVIEW'); expect(r.uncertaintyCodes).toContain('recipient_not_verified');
    expect(r.sharingNeedReason).toContain('not official');
  });
  it.each(['government_id_number', 'medical_diagnosis', 'bank_account_number'])('does not KEEP high-impact %s for a legitimate-sounding task', typeId => {
    expect(run(finding(typeId), support({ requirements: [{ ...needed, typeId }] })).action).toBe('REVIEW');
  });
  it.each(['password', 'api_key'])('protects %s even when user confirms it is required', typeId => {
    const r = run(finding(typeId), support({ requirements: [{ ...needed, typeId }] }));
    expect(r.action).toBe('MASK'); expect(r.factors).toContain('risk:unauthorized_access');
    expect(r.uncertaintyCodes).toContain('recipient_not_verified');
  });
});

describe('necessity and explainability', () => {
  it('requires REVIEW for user-confirmed public disclosure necessity', () => {
    const r = run(finding(), context({ requirements: [needed] }));
    expect(r.action).toBe('REVIEW'); expect(r.factors).toContain('requirement_source:user_confirmation');
  });
  it('reviews conflicting requirements and exposes both requirement IDs', () => {
    const r = run(finding(), context({ requirements: [needed, { ...needed, id: 'r2', importance: 'optional' }] }));
    expect(r.action).toBe('REVIEW'); expect(r.uncertaintyCodes).toContain('requirements_conflict');
    expect(r.factors).toEqual(expect.arrayContaining(['requirement:r1', 'requirement:r2']));
  });
  it.each([false, true])('reviews unconfirmed or unknown necessity %#', confirmedByUser => {
    const r = run(finding(), context({ requirements: [{ ...needed, confirmedByUser, importance: 'unknown' }] }));
    expect(r.action).toBe('REVIEW'); expect(r.uncertaintyCodes).toContain('necessity_unconfirmed');
  });
  it('treats dual requirement selectors as an intersection', () => {
    const r = run(finding(), context({ requirements: [{ ...needed, categoryId: 'financial_information' }] }));
    expect(r.action).toBe('MASK'); expect(r.factors).not.toContain('requirement:r1');
  });
  it('accepts an explicit category requirement without a type selector', () => {
    const r = run(finding(), context({ requirements: [{ ...needed, typeId: undefined, categoryId: 'contact_information' }] }));
    expect(r.action).toBe('REVIEW'); expect(r.factors).toContain('requirement:r1');
  });
  it.each([
    [{ ...needed, typeId: undefined }], [{ ...needed, confirmedByUser: undefined }],
    [needed, needed], [{ ...needed, importance: 'official' }],
  ].map(requirements => ({ requirements })))('reviews malformed requirements %#', ({ requirements }) => {
    expect(run(finding(), context({ requirements: requirements as unknown as SharingContextV2['requirements'] })).action).toBe('REVIEW');
  });
  it('does not invent a relationship between co-occurring fields', () => {
    const rs = recommendPrivacyV2(detection([finding('person_name'), finding('home_address', { id: 'f2', evidence: [
      { id: 'e2', detectorId: 'd', method: 'label_context', source: 'ocr', explanation: 'A separate fictional address.' },
    ] })]), context());
    expect(rs.map(r => r.action)).toEqual(['MASK', 'MASK']);
    expect(rs[0].evidenceIds).toEqual(['e1']); expect(rs[1].evidenceIds).toEqual(['e2']);
    expect(JSON.stringify(rs)).not.toContain('same person');
  });
  it('reports partial coverage without fabricating a clean-document guarantee', () => {
    const r = detection(); const partial = { ...r, coverage: { ...r.coverage,
      areas: [{ family: 'pattern' as const, status: 'partial' as const, explanation: 'Partial test coverage' }], warnings: ['Not all content inspected'] } };
    const rec = recommendPrivacyV2(partial, context())[0];
    expect(rec.uncertaintyCodes).toContain('coverage_incomplete'); expect(rec.reliability).toBe('limited');
    expect(recommendPrivacyV2({ ...partial, findings: [] }, context())).toEqual([]);
  });
  it('exposes a version, stable rule, evidence and user-confirmation instruction', () => {
    const r = run(); expect(r.rule.version).toBe(POLICY_VERSION); expect(r.rule.source).toContain('public-minimization');
    expect(r.evidenceIds).toEqual(['e1']); expect(r.explanation).toContain('Review and confirm');
    expect(r.sensitivityReason).toBeTruthy(); expect(r.sharingNeedReason).toBeTruthy();
  });
});

describe('security and identity regression', () => {
  it('is deterministic, input immutable, and retains no mutable result aliases', () => {
    const input = deepFreeze(detection()); const c = deepFreeze(context()); const before = JSON.stringify({ input, c });
    const a = recommendPrivacyV2(input, c); expect(a).toEqual(recommendPrivacyV2(input, c));
    expect(JSON.stringify({ input, c })).toBe(before); expect(a[0].source).not.toBe(input.source);
    expect(Object.isFrozen(a[0].factors)).toBe(true); expect(Object.isFrozen(a[0].source)).toBe(true);
  });
  it('canonicalizes evidence and requirement order', () => {
    const f = finding(); const e2 = { ...f.evidence[0], id: 'e2' }; const r2 = { ...needed, id: 'r2' };
    expect(run({ ...f, evidence: [...f.evidence, e2] }, context({ requirements: [needed, r2] })))
      .toEqual(run({ ...f, evidence: [e2, ...f.evidence] }, context({ requirements: [r2, needed] })));
  });
  it.each([
    null, {}, { ...detection(), source: { kind: 'url', id: 'x' } },
    { ...detection(), findings: [finding(), finding()] },
    { ...detection(), findings: [finding('email', { id: '' })] },
    { ...detection(), findings: [finding('email', { source: { kind: 'image', id: 'another-image' } })] },
    { ...detection(), coverage: { ...detection().coverage, source: { kind: 'image', id: 'another-image' } } },
  ])('rejects unaddressable input %# without partial output or values in diagnostics', input => {
    expect(() => recommendPrivacyV2(input as UniversalDetectionResult, context())).toThrow(TypeError);
    try { recommendPrivacyV2(input as UniversalDetectionResult, context()); } catch (error) {
      expect(String(error)).not.toContain('FICTIONAL_SECRET_CANARY');
    }
  });
  it.each([{ kind: 'pdf', id: 'fictional-document', pageIndex: 0 }, { kind: 'docx', id: 'fictional-document' }] as const)
    ('preserves source scope for $kind without inventing geometry', s => {
      const f = finding('email', { source: s }); const result = detection([f]);
      const r = recommendPrivacyV2({ ...result, source: s, coverage: { ...result.coverage, source: s } }, context())[0];
      expect(r.source).toEqual(s); expect(r).not.toHaveProperty('boxes');
    });
  it('rejects a different PDF page even with the same document ID', () => {
    const s = { kind: 'pdf' as const, id: 'fictional-pdf', pageIndex: 0 };
    expect(() => recommendPrivacyV2({ source: s, coverage: { source: s, areas: [], warnings: [] }, findings: [
      finding('email', { source: { ...s, pageIndex: 1 } }),
    ] }, context())).toThrow(TypeError);
  });
  it('imports and evaluates without network, persistence, logs, clocks, randomness, or URLs', async () => {
    const fail = () => { throw new Error('Forbidden side effect'); };
    for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Worker', 'indexedDB', 'localStorage', 'sessionStorage', 'navigator']) {
      vi.stubGlobal(name, new Proxy(fail, { get: fail, apply: fail }));
    }
    vi.spyOn(console, 'log').mockImplementation(fail); vi.spyOn(console, 'warn').mockImplementation(fail);
    vi.spyOn(console, 'error').mockImplementation(fail); vi.spyOn(Date, 'now').mockImplementation(fail);
    vi.spyOn(Math, 'random').mockImplementation(fail); vi.spyOn(URL, 'createObjectURL').mockImplementation(fail);
    vi.resetModules(); const fresh = await import('./recommendPrivacyV2');
    const r = fresh.recommendPrivacyV2(detection([finding('password')]), support());
    expect(r[0].action).toBe('MASK'); expect(JSON.stringify(r)).not.toContain('FICTIONAL_SECRET_CANARY');
  });
});

describe('explicit unchanged v1 compatibility', () => {
  const types = ['bank_account_number', 'student_id', 'payment_amount', 'order_number', 'email', 'home_address', 'phone'] as const;
  const golden = [
    { recipient: 'university', purpose: 'tuition_payment_verification', actions: ['MASK', 'REVIEW', 'KEEP', 'REVIEW', 'REVIEW', 'MASK', 'MASK'] },
    { recipient: 'customer_support', purpose: 'order_or_refund_inquiry', actions: ['MASK', 'MASK', 'KEEP', 'KEEP', 'REVIEW', 'MASK', 'REVIEW'] },
    { recipient: 'public_sharing', purpose: 'sharing_screenshot_publicly', actions: ['MASK', 'MASK', 'MASK', 'MASK', 'MASK', 'MASK', 'MASK'] },
  ] as const;
  const field = (type: DetectedField['type']): DetectedField => ({ id: 'legacy-f', imageId: 'legacy-img', type,
    label: 'Fictional label', value: 'Fictional value', wordIds: ['legacy-word'], boxes: [{ x: 1, y: 2, width: 30, height: 10 }], confidence: 0.95 });
  for (const scenario of golden) {
    it.each(types.map((type, i) => ({ type, action: scenario.actions[i] })))
      (`preserves ${scenario.recipient} / $type = $action`, ({ type, action }) => {
        const c = { recipient: scenario.recipient, purpose: scenario.purpose } as PrivacyContext;
        const fields = deepFreeze([field(type)]);
        const actual = recommendPrivacyV1Compatibility(fields, c);
        expect(actual[0].action).toBe(action); expect(actual).toEqual(recommendPrivacy(fields, c));
      });
  }
  it('preserves v1 unknown, uncertain, empty, invalid and unsupported behavior', () => {
    const c: PrivacyContext = { recipient: 'customer_support', purpose: 'order_or_refund_inquiry' };
    expect(recommendPrivacyV1Compatibility([], c)).toEqual([]);
    for (const f of [field('unknown'), { ...field('email'), confidence: 0.1 }]) {
      expect(recommendPrivacyV1Compatibility([f], c)).toEqual(recommendPrivacy([f], c));
    }
    const custom = { recipient: 'other', purpose: 'unknown' } as unknown as PrivacyContext;
    expect(recommendPrivacyV1Compatibility([field('email')], custom)).toEqual(recommendPrivacy([field('email')], custom));
    expect(() => recommendPrivacyV1Compatibility([field('email'), field('email')], c)).toThrow(TypeError);
  });
});
