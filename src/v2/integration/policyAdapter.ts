import type { PrivacyRecommendation } from '../../types';
import { recommendPrivacyV2 } from '../../features/privacy/v2/recommendPrivacyV2';
import type { RecommendationV2, SharingContextV2, UniversalDetectionResult } from '../contracts';

/** Only exact, built-in UI presets have a machine-readable purpose. */
const presets = {
  university: { recipient: 'University', kind: 'education', purpose: 'Tuition payment verification',
    purposeId: 'tuition_payment_verification', audience: 'named_recipient' },
  customer_support: { recipient: 'Customer support', kind: 'support', purpose: 'Order or refund inquiry',
    purposeId: 'order_or_refund_inquiry', audience: 'named_recipient' },
  public_sharing: { recipient: 'Public audience', kind: 'public', purpose: 'Share a screenshot publicly',
    purposeId: 'sharing_screenshot_publicly', audience: 'public' },
} as const;

export function canonicalPolicyContext(context: SharingContextV2): SharingContextV2 {
  const preset = context.presetId ? presets[context.presetId] : undefined;
  if (!preset || context.recipient.name !== preset.recipient ||
      context.recipient.kind !== preset.kind || context.purpose !== preset.purpose ||
      context.audience !== preset.audience)
    return { ...context, presetId: undefined };
  return { ...context, purpose: preset.purposeId };
}

/** C receives the original result, including source-scoped evidence and classification. */
export function universalPolicyRecommendations(result: UniversalDetectionResult,
  context: SharingContextV2): readonly RecommendationV2[] {
  try { return recommendPrivacyV2(result, canonicalPolicyContext(context)); }
  catch {
    // Malformed policy input must fail closed without exposing values in a log.
    return result.findings.map(finding => ({ findingId: finding.id, source: finding.source,
      action: 'REVIEW', reliability: 'requires_review',
      explanation: 'The recommendation could not be evaluated. Decide what to keep or mask.',
      sensitivityReason: 'This information may be sensitive.',
      sharingNeedReason: 'The recipient need has not been established.',
      uncertaintyReason: 'Policy evaluation was incomplete.',
      rule: { source: 'privacy-xray/v2/evaluation-failed', version: '2.0.0-p0.1' },
    }));
  }
}

/** Existing A reducer owns effective decisions and linked masks; C's output stays intact for UI. */
export function toReducerRecommendations(result: UniversalDetectionResult,
  recommendations: readonly RecommendationV2[]): readonly PrivacyRecommendation[] {
  return recommendations.filter(item => item.source.kind === 'image' &&
    item.source.id === result.source.id && result.findings.some(finding =>
      finding.id === item.findingId && finding.source.kind === 'image' &&
      finding.source.id === item.source.id)).map(item => ({
    fieldId: item.findingId, imageId: item.source.id, action: item.action,
    explanation: item.explanation, ruleId: item.rule.source,
  }));
}
