# Advanced review privacy policy

This pure rule engine supports the optional Universal review at `?review=advanced`. The default checkbox workflow does not ask for a recipient or purpose and does not require policy recommendations. No cloud AI or recipient verification is implemented.

## API and integration

```ts
import { recommendPrivacyV2, createPrivacyPolicy } from './features/privacy/v2/recommendPrivacyV2';
import { recommendPrivacyV1Compatibility } from './features/privacy/v2/compatibility';

// Pure, synchronous; uses A's existing types in src/v2/contracts.ts.
recommendPrivacyV2(
  result: UniversalDetectionResult,
  context: SharingContextV2,
): readonly PolicyRecommendation[]
```

`PolicyRecommendation` extends A's `RecommendationV2` with readonly `factors`, supporting `evidenceIds`, and `uncertaintyCodes`. Existing consumers can use it as `RecommendationV2`. `rule.source` is the stable rule identifier (`privacy-xray/v2/...`), `rule.version` is the applicable policy version (`2.0.0-p0.1`). Human-readable uncertainty stays in `uncertaintyReason`. No raw field values or OCR text are copied into explanations.

Pass the original universal result, not `toEditorFields(result)`: that adapter deliberately drops v2 classification/evidence information. Pair each suggestion with the exact `findingId` AND source (including PDF page); keep guidance separate from effective user decisions. A owns reducer updates, user overrides, recommendation-linked masks and invalidation of preview/confirmation on context, finding, evidence, policy or effective-mask changes. B must display explanations/uncertainty and obtain user confirmation. Missing geometry prevents automatic region creation; it does not prevent policy evaluation. The engine creates no masks, URLs, Files or PNGs.

Route legacy inputs explicitly through `recommendPrivacyV1Compatibility(fields, legacyContext)`. It delegates unchanged to the existing v1 function, preserving actions, explanations, rule IDs, uncertain/unknown/invalid behavior. Do not convert arbitrary v2 contexts into v1 requests to obtain a more permissive decision.

## P0 semantics

- Explicit descriptors map all 43 integrated knowledge-base type IDs to declared policy classes and evidence methods. Knowledge-base presence does not assert detector support. Unknown IDs remain REVIEW, including IDs that sound like credentials. English descriptions, labels, recipient names/kinds and unknown ID spellings are never interpreted as policy semantics.
- General classes cover access secrets, identifiers, high-impact information, private content, transactions, opaque content and relationships. Adding a type/category requires one trusted, developer-authored `PolicyDescriptor`, not a context-by-field matrix. `createPrivacyPolicy(additionalDescriptors)` snapshots extensions and prohibits overriding built-in types. Do not use detector or user session text as extension configuration.
- Addressable findings need KNOWN status, supported categories/methods, direct evidence and either entity classification confidence >= 0.8 or a validated detector-rule assertion linked to direct evidence. The assertion is binary, not a probability. OCR-supported guidance also requires OCR confidence >= 0.7. Supported independent image/metadata evidence can be used despite low OCR; deficient OCR is reported and excluded from supporting evidence IDs.
- Known presets require exact machine purpose tokens: `university` / `tuition_payment_verification`, `customer_support` / `order_or_refund_inquiry`, `public_sharing` / `sharing_screenshot_publicly`. No free-text understanding is implemented. Unsupported custom contexts return REVIEW.
- Unknown, mixed or third-party ownership returns REVIEW. Organizational ownership does not establish authority over personal information. No per-person consent or relationship is invented.
- Strong supported access credentials get MASK after classification, context and ownership validation, even when a stated requirement asks for them. Non-disclosure advice does not require trusting a recipient. Missing verification/conflicting claims remain explicit uncertainty; they cannot turn a secret into KEEP. Uncertain credential candidates remain REVIEW, with access consequences in `sensitivityReason`.
- Public minimization gives MASK for supported personal/private/transaction classes without a contrary need. A claimed need to publish them, ambiguous necessity, opaque codes and relationship findings get REVIEW. Two requirement selectors mean an intersection. Conflicts expose both requirement IDs.
- **The current contract has no recipient-verification evidence. Therefore v2 P0 does not issue KEEP for a named recipient, even for a user-confirmed need.** It returns REVIEW and distinguishes user confirmation from official verification. KEEP remains in the shared action contract and the explicit v1 path. Future bounded v2 KEEP needs an A-owned verification/necessity evidence contract; this is not blocking P0 integration.
- Coverage limitations are reported but never treated as a clean-document guarantee. Zero findings yields zero recommendations, not a safety conclusion. A must continue showing coverage warnings even when results are empty.

## Validation

Run the focused policy tests:

```sh
npm test -- src/features/privacy/v2/recommendPrivacyV2.test.ts
npm run typecheck
```

The full project acceptance suite includes policy behavior, explicit overrides and preview invalidation. See [project testing](../../../../docs/testing.md). Unit tests use fictional inputs and check deterministic rules, evidence scope, immutability and absence of network/persistence/logging side effects.

## Deferred work and limits

No recipient authentication, legal/consent determination, LLM, cloud service, custom-purpose interpretation, multi-owner graph, cross-finding inference or aggregate-risk conclusion is implemented. Confidence gates cannot validate a detector's factual correctness. `evidenceIds` cite supplied detector evidence, not independent official verification. Requirement applicability is exact type/category membership; category ancestry is not guessed. Evidence and finding IDs are expected to be opaque IDs, not sensitive values.

The historical acceptance catalogue remains a roadmap, with a P0 disposition on each case. Advanced expectations are not represented as passing executable tests. Guidance can be overridden by the user and guarantees neither privacy nor legal compliance. All policy execution is browser-memory-only; no network, persistence, logging, merge or deployment is added.
