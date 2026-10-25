import type { PrivacyContext, PrivacyRecommendation } from '../../types';
import type { RecommendationV2, SharingContextV2, UniversalDetectionResult } from '../contracts';

export const initialSharingContext: SharingContextV2 = {
  id: 'preset-university', presetId: 'university',
  recipient: { name: 'University', kind: 'education' },
  purpose: 'Tuition payment verification', audience: 'named_recipient',
  informationOwner: 'self', requirements: [],
};

/** The v1 policy covers only these presets. Custom notes never masquerade as understood policy. */
export function legacyPreset(context: SharingContextV2): PrivacyContext | null {
  if (context.requirements.length ||
    context.recipient.name !== ({ university: 'University', customer_support: 'Customer support',
      public_sharing: 'Public audience' } as Record<string, string>)[context.presetId ?? '']) return null;
  switch (context.presetId) {
    case 'university': return { recipient: 'university', purpose: 'tuition_payment_verification' };
    case 'customer_support': return { recipient: 'customer_support', purpose: 'order_or_refund_inquiry' };
    case 'public_sharing': return { recipient: 'public_sharing', purpose: 'sharing_screenshot_publicly' };
    default: return null;
  }
}

/** Display the current conservative bridge honestly until C's v2 policy is integrated. */
export function temporaryRecommendations(
  result: UniversalDetectionResult,
  recommendations: readonly PrivacyRecommendation[],
): readonly RecommendationV2[] {
  return result.findings.map(finding => {
    const legacy = recommendations.find(item => item.fieldId === finding.id &&
      item.imageId === finding.source.id);
    const supported = !!legacy && !legacy.ruleId.startsWith('review:');
    return {
      findingId: finding.id, source: finding.source,
      action: legacy?.action ?? 'REVIEW',
      explanation: legacy?.explanation ?? 'No supported policy rule is available. Decide what this recipient needs.',
      sensitivityReason: 'This information may identify a person, account, transaction, or private activity.',
      sharingNeedReason: supported
        ? 'This is provisional guidance for the selected preset. Confirm the recipient’s actual needs.'
        : 'The recipient’s need has not been established by a supported rule.',
      ...(finding.uncertaintyReason ? { uncertaintyReason: finding.uncertaintyReason } : {}),
      reliability: supported ? 'limited' : 'requires_review',
      rule: { source: 'Privacy X-Ray temporary v1 policy bridge', version: '1',
        note: 'Conservative guidance pending the dedicated v2 policy.' },
    };
  });
}
