import type { OcrResult, PixelRect, PrivacyAction } from '../types';

/** v2 is additive. The approved v1 contracts in src/types/index.ts remain unchanged. */
export const PRIVACY_KNOWLEDGE_VERSION = '1.0.0' as const;

export type LocalizedText = Readonly<Record<string, string>>;
export type DetectionFamily =
  | 'pattern' | 'label_context' | 'nlp_entity' | 'visual_object'
  | 'document_structure' | 'metadata' | 'relationship';

export interface RuleProvenance {
  readonly source: string;
  readonly version: string;
  readonly note?: string;
}

/** The registry is an open graph, not a fixed union of every possible category. */
export interface PrivacyCategory {
  readonly id: string;
  readonly parentIds: readonly string[];
  readonly name: string;
  readonly description: string;
  readonly aliases?: readonly string[];
  readonly localizedNames?: LocalizedText;
}

/** Presence means DEFINED; implementation and verification are separate claims. */
export interface PrivacyTypeDefinition {
  readonly id: string;
  readonly categoryIds: readonly string[];
  readonly name: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly localizedNames?: LocalizedText;
  readonly detectionMethods: readonly DetectionFamily[];
  readonly implementationStatus: 'not_implemented' | 'implemented';
  readonly validationStatus: 'unverified' | 'verified';
  readonly contextualSensitivity: string;
  readonly disclosureConsequences: readonly string[];
  readonly ownershipConsiderations: string;
  readonly relatedTypeIds: readonly string[];
  readonly evidenceRequirements: readonly string[];
  readonly documentProfiles?: readonly string[];
  readonly provenance: RuleProvenance;
}

/** Geometry is omitted when there is no reliable location. Never create a fake box. */
export interface DetectionEvidence {
  readonly id: string;
  readonly detectorId: string;
  readonly method: DetectionFamily;
  readonly source: 'ocr' | 'image' | 'metadata' | 'derived';
  readonly explanation: string;
  readonly text?: string;
  readonly wordIds?: readonly string[];
  readonly boxes?: readonly PixelRect[];
}

export type FindingStatus = 'KNOWN' | 'UNCERTAIN' | 'UNKNOWN_POTENTIALLY_SENSITIVE';

/** A binary, detector-authored rule match, linked to one evidence item; not a probability. */
export interface ClassificationEvidence {
  readonly kind: 'validated_rule';
  readonly typeId: string;
  readonly detectorId: string;
  readonly evidenceId: string;
}

/** A finding can also refer to a future document without inventing image geometry. */
export type ContentSourceRef =
  | { readonly kind: 'image'; readonly id: string }
  | { readonly kind: 'pdf'; readonly id: string; readonly pageIndex: number }
  | { readonly kind: 'docx'; readonly id: string };

export interface UniversalFinding {
  readonly id: string;
  readonly source: ContentSourceRef;
  readonly status: FindingStatus;
  /** Absent for open-world candidates; never invent a taxonomy type to fit them. */
  readonly typeId?: string;
  readonly categoryIds: readonly string[];
  readonly label: string;
  readonly value?: string;
  readonly evidence: readonly DetectionEvidence[];
  /** Independent evidence scores; neither is a privacy-safety score. */
  readonly ocrRecognitionConfidence?: number;
  readonly entityClassificationConfidence?: number;
  readonly classificationEvidence?: ClassificationEvidence;
  readonly uncertaintyReason?: string;
  /** Original image pixels only. Omit for DOCX/PDF or unlocated image findings. */
  readonly boxes?: readonly PixelRect[];
}

export interface DetectorCapability {
  readonly id: string;
  readonly family: DetectionFamily;
  readonly name: string;
  readonly status: 'implemented' | 'unsupported';
  readonly verified: boolean;
  readonly supportedTypeIds: readonly string[];
  readonly limitation: string;
  /** The orchestrator grants a scoped pixel source only when this is true. */
  readonly requiresImagePixels?: boolean;
}

export interface CoverageArea {
  readonly family: DetectionFamily;
  readonly status: 'inspected' | 'partial' | 'uninspected';
  readonly explanation: string;
}

export interface DetectionCoverage {
  readonly source: ContentSourceRef;
  readonly areas: readonly CoverageArea[];
  /** Plain-language warnings shown even when there are zero findings. */
  readonly warnings: readonly string[];
}

/** A-owned, short-lived access to copies of browser-local image pixels. */
export interface BrowserImagePixelSource {
  readonly imageId: string;
  readonly width: number;
  readonly height: number;
  /** A bounded rectangle in original-image pixels; rejects after run/cancellation. */
  readPixels(rect: PixelRect): Promise<ImageData>;
}

export interface DetectionInput {
  readonly imageId: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly ocr?: OcrResult;
  /** Absent for OCR-only detectors and when local pixel access is unavailable. */
  readonly imagePixels?: BrowserImagePixelSource;
}

/** Detectors receive local session data and return evidence, without UI or policy work. */
export interface PrivacyDetector {
  readonly capability: DetectorCapability;
  detect(input: DetectionInput): Promise<readonly UniversalFinding[]>;
}

export interface UniversalDetectionResult {
  readonly source: ContentSourceRef;
  readonly findings: readonly UniversalFinding[];
  readonly coverage: DetectionCoverage;
}

export type SharingAudience = 'named_recipient' | 'limited_group' | 'public' | 'unknown';
export type InformationOwner = 'self' | 'another_person' | 'organization' | 'mixed' | 'unknown';

/** Text describes the context; it is not treated as machine-understood policy. */
export interface SharingRequirement {
  readonly id: string;
  readonly description: string;
  readonly typeId?: string;
  readonly categoryId?: string;
  readonly importance: 'needed' | 'optional' | 'unknown';
  readonly confirmedByUser: boolean;
}

export interface SharingContextV2 {
  readonly id: string;
  readonly presetId?: 'university' | 'customer_support' | 'public_sharing';
  readonly recipient: { readonly name: string; readonly kind?: string };
  readonly purpose: string;
  readonly audience: SharingAudience;
  readonly informationOwner: InformationOwner;
  readonly requirements: readonly SharingRequirement[];
}

/** C owns rule generation. Qualitative reliability is not a safety guarantee. */
export interface RecommendationV2 {
  readonly findingId: string;
  readonly source: ContentSourceRef;
  readonly action: PrivacyAction;
  readonly explanation: string;
  readonly sensitivityReason: string;
  readonly sharingNeedReason: string;
  readonly uncertaintyReason?: string;
  readonly reliability: 'limited' | 'supported' | 'requires_review';
  readonly rule: RuleProvenance;
}
