import type { RecommendPrivacy } from '../../../types';
import { recommendPrivacy } from '../recommendPrivacy';

/** Explicit v1 route. Never guess a v1 scenario from an arbitrary v2 context. */
export const recommendPrivacyV1Compatibility: RecommendPrivacy = (fields, context) =>
  recommendPrivacy(fields, context);
