import type {
  ContentSourceRef, DetectionFamily, RecommendationV2, SharingContextV2,
  UniversalDetectionResult, UniversalFinding,
} from '../../../v2/contracts';
import { POLICY_CLASSES, POLICY_DESCRIPTORS, POLICY_VERSION } from './policyDescriptors';
import type { PolicyDescriptor } from './policyDescriptors';

/** Additive C-owned detail; assignable to A's RecommendationV2 without contract changes. */
export interface PolicyRecommendation extends RecommendationV2 {
  readonly factors: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly uncertaintyCodes: readonly string[];
}
export type RecommendPrivacyV2 = (
  result: UniversalDetectionResult, context: SharingContextV2,
) => readonly PolicyRecommendation[];

const purposes = {
  university: 'tuition_payment_verification',
  customer_support: 'order_or_refund_inquiry',
  public_sharing: 'sharing_screenshot_publicly',
} as const;
const families: readonly DetectionFamily[] = ['pattern', 'label_context', 'nlp_entity',
  'visual_object', 'document_structure', 'metadata', 'relationship'];
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const score = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const sourceValid = (s: ContentSourceRef): boolean => !!s && text(s.id) &&
  (s.kind === 'image' || s.kind === 'docx' || (s.kind === 'pdf' && Number.isInteger(s.pageIndex) && s.pageIndex >= 0));
const sameSource = (a: ContentSourceRef, b: ContentSourceRef): boolean => sourceValid(a) &&
  sourceValid(b) && a.kind === b.kind && a.id === b.id &&
  (a.kind !== 'pdf' || (b.kind === 'pdf' && a.pageIndex === b.pageIndex));
const copySource = (s: ContentSourceRef): ContentSourceRef => Object.freeze(s.kind === 'pdf'
  ? { kind: s.kind, id: s.id, pageIndex: s.pageIndex } : { kind: s.kind, id: s.id });
const canonical = (items: readonly string[]): readonly string[] => Object.freeze([...new Set(items)].sort());
const uncertaintyMessages: Readonly<Record<string, string>> = Object.freeze({
  coverage_incomplete: 'Detection coverage is incomplete or not established.',
  classification_unsupported: 'No supported policy classification is available.',
  classification_uncertain: 'Entity classification or category evidence is uncertain.',
  evidence_missing_or_invalid: 'Detector evidence is missing or invalid.',
  ocr_score_invalid: 'The OCR score is invalid.',
  ocr_readability_uncertain: 'OCR readability is uncertain, separately from entity classification.',
  relationship_evidence_unsupported: 'Structured relationship support is unavailable in P0.',
  evidence_method_unsupported: 'The supplied evidence method is unsupported for this type.',
  context_unsupported: 'The sharing context is unsupported or inconsistent.',
  ownership_unresolved: 'Ownership or third-party disclosure authority is unresolved.',
  ownership_scope_uncertain: 'Organizational ownership does not establish personal disclosure authority.',
  requirements_invalid: 'Stated requirement data is invalid or ambiguous.',
  requirements_conflict: 'Applicable stated requirements conflict.',
  necessity_unconfirmed: 'Applicable disclosure necessity is not confirmed.',
  recipient_not_verified: 'The contract provides no recipient-verification evidence.',
  encoded_content_unknown: 'The encoded content is unknown.',
  public_disclosure_necessity_unverified: 'A user-confirmed request does not verify public disclosure necessity.',
  necessity_missing: 'No applicable disclosure necessity is supplied.',
});

function validateIdentity(result: UniversalDetectionResult): void {
  if (!result || !sourceValid(result.source) || !Array.isArray(result.findings) ||
      !result.coverage || !sameSource(result.source, result.coverage.source)) {
    throw new TypeError('Detection result must have one valid source and coverage.');
  }
  const ids = new Set<string>();
  for (const f of result.findings) {
    if (!f || !text(f.id) || ids.has(f.id) || !sameSource(result.source, f.source)) {
      throw new TypeError('Findings must have unique IDs belonging to the detection source.');
    }
    ids.add(f.id);
  }
}

/** Extensions are trusted application code, not detector/user prose or session configuration. */
export function createPrivacyPolicy(additionalDescriptors: readonly PolicyDescriptor[] = []): RecommendPrivacyV2 {
  if (!Array.isArray(additionalDescriptors)) throw new TypeError('Policy descriptors must be an array.');
  const descriptors = new Map<string, PolicyDescriptor>();
  for (const d of [...POLICY_DESCRIPTORS, ...additionalDescriptors]) {
    if (!d || !text(d.typeId) || descriptors.has(d.typeId) ||
        !Array.isArray(d.categoryIds) || !d.categoryIds.length || !d.categoryIds.every(text) ||
        !Array.isArray(d.classes) || !d.classes.length || !d.classes.every((c: string) => Object.hasOwn(POLICY_CLASSES, c)) ||
        !Array.isArray(d.evidenceMethods) || !d.evidenceMethods.length || !d.evidenceMethods.every((m: DetectionFamily) => families.includes(m))) {
      throw new TypeError('Policy descriptor is invalid or attempts to replace an existing type.');
    }
    descriptors.set(d.typeId, { typeId: d.typeId, categoryIds: [...d.categoryIds],
      classes: [...d.classes], evidenceMethods: [...d.evidenceMethods] });
  }

  return (result, context) => {
    validateIdentity(result);
    return Object.freeze(result.findings.map(f => evaluate(f, result, context, descriptors.get(f.typeId ?? ''))));
  };
}

function evaluate(f: UniversalFinding, result: UniversalDetectionResult,
  context: SharingContextV2, descriptor: PolicyDescriptor | undefined): PolicyRecommendation {
  const factors: string[] = descriptor ? descriptor.classes.map(c => `class:${c}`) : [];
  const uncertainty: string[] = [];
  const evidenceIds: string[] = [];
  let need = 'No verified necessity or recipient authority is established by this contract.';
  const sensitivity = descriptor ? canonical(descriptor.classes).map(c => POLICY_CLASSES[c as keyof typeof POLICY_CLASSES]).join(' ')
    : 'The information class has not been established; this does not mean ordinary text is sensitive.';

  const output = (action: 'KEEP' | 'MASK' | 'REVIEW', rule: string, explanation: string): PolicyRecommendation => {
    const codes = canonical(uncertainty);
    return Object.freeze({ findingId: f.id, source: copySource(f.source), action,
      explanation: `${explanation} Review and confirm before sharing.`, sensitivityReason: sensitivity,
      sharingNeedReason: need,
      ...(codes.length ? { uncertaintyReason: codes.map(code => uncertaintyMessages[code]).join(' ') } : {}),
      reliability: action === 'REVIEW' ? 'requires_review' : codes.length ? 'limited' : 'supported',
      rule: Object.freeze({ source: `privacy-xray/v2/${rule}`, version: POLICY_VERSION,
        note: 'Local advisory policy; user confirmation is not official verification.' }),
      factors: canonical(factors), evidenceIds: canonical(evidenceIds), uncertaintyCodes: codes });
  };

  // Coverage is not a safety certificate and never creates new sensitive findings.
  if (!Array.isArray(result.coverage.areas) || !result.coverage.areas.length ||
      result.coverage.areas.some(a => !a || a.status !== 'inspected') ||
      !Array.isArray(result.coverage.warnings) || result.coverage.warnings.length) {
    uncertainty.push('coverage_incomplete');
  }
  if (!descriptor) {
    uncertainty.push('classification_unsupported');
    return output('REVIEW', 'classification-unsupported', 'This finding has no supported machine-readable policy descriptor.');
  }
  const ruleAssertion = f.classificationEvidence?.kind === 'validated_rule' &&
    f.classificationEvidence.typeId === f.typeId &&
    f.evidence.some(e => e.id === f.classificationEvidence?.evidenceId &&
      e.detectorId === f.classificationEvidence?.detectorId &&
      descriptor.evidenceMethods.includes(e.method));
  if (f.status !== 'KNOWN' || !text(f.label) || text(f.uncertaintyReason) ||
      !Array.isArray(f.categoryIds) || !f.categoryIds.length ||
      !f.categoryIds.every(c => descriptor.categoryIds.includes(c)) ||
      (!ruleAssertion && (!score(f.entityClassificationConfidence) || f.entityClassificationConfidence < 0.8))) {
    uncertainty.push('classification_uncertain');
    return output('REVIEW', 'classification-uncertain', 'The finding classification or its supporting categories need confirmation.');
  }
  if (!Array.isArray(f.evidence) || !f.evidence.length ||
      f.evidence.some(e => !e || !text(e.id) || !text(e.detectorId) || !text(e.explanation) ||
        !families.includes(e.method) || !['ocr', 'image', 'metadata', 'derived'].includes(e.source) ||
        (e.method === 'visual_object' && e.source !== 'image') ||
        (e.method === 'metadata' && e.source !== 'metadata') ||
        (e.method === 'relationship' && e.source !== 'derived')) ||
      new Set(f.evidence.map(e => e.id)).size !== f.evidence.length) {
    uncertainty.push('evidence_missing_or_invalid');
    return output('REVIEW', 'evidence-invalid', 'Reliable detector evidence is missing or incomplete.');
  }
  const supported = f.evidence.filter(e => descriptor.evidenceMethods.includes(e.method) &&
    e.source !== 'derived' && e.method !== 'relationship');
  const independent = supported.some(e => e.source === 'image' || e.source === 'metadata');
  if (f.ocrRecognitionConfidence !== undefined && !score(f.ocrRecognitionConfidence)) {
    uncertainty.push('ocr_score_invalid');
    return output('REVIEW', 'ocr-invalid', 'The supplied OCR evidence score is invalid.');
  }
  if (supported.some(e => e.source === 'ocr') &&
      (!score(f.ocrRecognitionConfidence) || f.ocrRecognitionConfidence < 0.7)) {
    uncertainty.push('ocr_readability_uncertain');
    if (!independent) return output('REVIEW', 'ocr-uncertain', 'OCR readability is insufficient; it is separate from entity classification.');
  }
  evidenceIds.push(...supported.filter(e => e.source !== 'ocr' ||
    (score(f.ocrRecognitionConfidence) && f.ocrRecognitionConfidence >= 0.7)).map(e => e.id));
  if (descriptor.classes.includes('relationship')) {
    uncertainty.push('relationship_evidence_unsupported');
    return output('REVIEW', 'relationship-deferred', 'This policy cannot establish a relationship from co-occurrence or prose evidence.');
  }
  if (!supported.length) {
    uncertainty.push('evidence_method_unsupported');
    return output('REVIEW', 'evidence-unsupported', 'This finding lacks a supported direct evidence method.');
  }

  if (!context || !text(context.id) || !context.presetId || !Object.hasOwn(purposes, context.presetId) ||
      context.purpose !== purposes[context.presetId] || !text(context.recipient?.name) ||
      !['named_recipient', 'limited_group', 'public'].includes(context.audience) ||
      (context.presetId === 'public_sharing') !== (context.audience === 'public')) {
    uncertainty.push('context_unsupported');
    return output('REVIEW', 'context-unsupported', 'This custom, ambiguous, or inconsistent context is not machine-understood by the P0 policy.');
  }
  factors.push(`audience:${context.audience}`, `preset:${context.presetId}`);
  if (!['self', 'organization'].includes(context.informationOwner)) {
    uncertainty.push('ownership_unresolved');
    return output('REVIEW', 'ownership-review', 'Ownership or authority for this disclosure is unresolved; another person’s consent is not assumed.');
  }
  factors.push(`owner:${context.informationOwner}`);
  if (context.informationOwner === 'organization' && descriptor.classes.some(c =>
    ['personal_identifier', 'high_impact', 'transaction'].includes(c))) {
    uncertainty.push('ownership_scope_uncertain');
    return output('REVIEW', 'ownership-scope', 'Organizational ownership does not establish authority over a person’s information.');
  }
  if (!Array.isArray(context.requirements) || context.requirements.some(r => !r || !text(r.id) ||
      !text(r.description) || (!text(r.typeId) && !text(r.categoryId)) ||
      (r.typeId !== undefined && !text(r.typeId)) || (r.categoryId !== undefined && !text(r.categoryId)) ||
      typeof r.confirmedByUser !== 'boolean' || !['needed', 'optional', 'unknown'].includes(r.importance)) ||
      new Set(context.requirements.map(r => r.id)).size !== context.requirements.length) {
    uncertainty.push('requirements_invalid');
    return output('REVIEW', 'requirements-invalid', 'Sharing requirements are incomplete or ambiguous.');
  }
  // Two selectors form an intersection, never a permissive OR.
  const requirements = context.requirements.filter(r => (r.typeId === undefined || r.typeId === f.typeId) &&
    (r.categoryId === undefined || f.categoryIds.includes(r.categoryId)));
  factors.push(...requirements.map(r => `requirement:${r.id}`));
  const conflicting = new Set(requirements.map(r => r.importance)).size > 1;
  const uncertainNeed = requirements.some(r => !r.confirmedByUser || r.importance === 'unknown');
  if (conflicting) uncertainty.push('requirements_conflict');
  if (uncertainNeed) uncertainty.push('necessity_unconfirmed');
  if (requirements.some(r => r.confirmedByUser)) {
    factors.push('requirement_source:user_confirmation');
    need = 'The user confirmed a stated requirement; this is not official recipient verification.';
  }
  if (context.audience !== 'public') uncertainty.push('recipient_not_verified');

  // Protection does not assert that a recipient is trustworthy or a disclosure is necessary.
  if (descriptor.classes.includes('access_secret')) {
    factors.push('risk:unauthorized_access');
    return output('MASK', 'access-secret-protection', 'This access credential should be covered; a stated task requirement does not establish a need to disclose the secret.');
  }
  if (conflicting || uncertainNeed) {
    return output('REVIEW', 'necessity-review', 'The stated requirements conflict or lack confirmation; decide which disclosure is actually necessary.');
  }
  if (descriptor.classes.includes('opaque_content')) {
    uncertainty.push('encoded_content_unknown');
    return output('REVIEW', 'encoded-content-review', 'The content of this code must be inspected before deciding what disclosure is necessary.');
  }
  if (context.audience === 'public') {
    if (requirements.some(r => r.importance === 'needed')) {
      uncertainty.push('public_disclosure_necessity_unverified');
      return output('REVIEW', 'public-necessity-review', 'A user-confirmed request does not establish that exposing this information publicly is appropriate.');
    }
    need = 'The supported public-sharing preset establishes no specific need to expose this information.';
    factors.push('necessity:public_minimization');
    return output('MASK', 'public-minimization', 'Consider covering this information to reduce unnecessary public disclosure.');
  }
  if (!requirements.length) uncertainty.push('necessity_missing');
  return output('REVIEW', 'recipient-and-necessity-review',
    'Recipient verification and sufficient disclosure necessity are not established; a legitimate-sounding task alone does not justify KEEP.');
}

/** Browser-local P0 policy. No uploads, React, logging, storage, masks, or retained session data. */
export const recommendPrivacyV2: RecommendPrivacyV2 = createPrivacyPolicy();
