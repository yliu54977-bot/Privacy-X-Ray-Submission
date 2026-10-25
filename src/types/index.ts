/** Version 1: browser-memory-only contracts. Never send these objects to a server. */
export const CONTRACT_VERSION = 1 as const;
import type { SharingContextV2, UniversalDetectionResult } from '../v2/contracts';

/** Top-left origin. All measurements are ORIGINAL decoded-image pixels, not CSS pixels. */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One decoded, unscaled image. A owns creation and previewUrl cleanup. */
export interface LocalImage {
  readonly id: string;
  readonly file: File;
  readonly previewUrl: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: 'image/png' | 'image/jpeg';
}

/** Positive, finite geometry; fractional pixels allowed. Active default MASK regions export. */
interface RedactionRectBase extends PixelRect {
  readonly id: string;
  readonly imageId: string;
  readonly shouldRedact: boolean;
}

/** OCR highlights are not masks. Manual masks cannot be removed by recommendation changes. */
export type RedactionRect =
  | (RedactionRectBase & { readonly source: 'manual'; readonly fieldId?: never })
  | (RedactionRectBase & { readonly source: 'recommendation'; readonly fieldId: string });

export interface OcrWord {
  readonly id: string;
  readonly lineId: string;
  readonly text: string;
  readonly box: PixelRect;
  /** Normalized to 0..1 by A's OCR adapter; not a privacy correctness guarantee. */
  readonly confidence: number;
}

export interface OcrResult {
  readonly imageId: string;
  readonly width: number;
  readonly height: number;
  readonly language: string;
  readonly text: string;
  readonly words: readonly OcrWord[];
}

export type PrivacyFieldType =
  | 'bank_account_number' | 'student_id' | 'payment_amount'
  | 'order_number' | 'email' | 'home_address' | 'phone'
  | 'unknown';

/** A identifies plausible candidate fields from browser-local OCR. */
export interface DetectedField {
  readonly id: string;
  readonly imageId: string;
  readonly type: PrivacyFieldType;
  readonly label: string;
  readonly value: string;
  readonly wordIds: readonly string[];
  readonly boxes: readonly PixelRect[];
  readonly confidence: number;
}

/** Only these three recipient/purpose pairs are supported in the hackathon MVP. */
export type PrivacyContext =
  | { readonly recipient: 'university'; readonly purpose: 'tuition_payment_verification' }
  | { readonly recipient: 'customer_support'; readonly purpose: 'order_or_refund_inquiry' }
  | { readonly recipient: 'public_sharing'; readonly purpose: 'sharing_screenshot_publicly' };

export type PrivacyAction = 'KEEP' | 'MASK' | 'REVIEW';

/** A qualified suggestion. MASK creates an active default region; REVIEW needs a decision. */
export interface PrivacyRecommendation {
  readonly fieldId: string;
  readonly imageId: string;
  readonly action: PrivacyAction;
  readonly explanation: string;
  readonly ruleId: string;
}

/** REVIEW is unresolved; linked-mask deletion records a distinct reason for the UI. */
export type FieldDecision =
  | { readonly fieldId: string; readonly imageId: string; readonly action: 'KEEP' | 'MASK' }
  | { readonly fieldId: string; readonly imageId: string; readonly action: 'REVIEW';
      readonly reviewReason: 'recommendation' | 'suggested_mask_removed' };

/** B reports user intent; A owns IDs and the authoritative mask collection. */
export interface EditorEvents {
  onAddManual(imageId: string, rect: PixelRect): void;
  onUpdateMask(imageId: string, maskId: string, rect: PixelRect): void;
  onDeleteMask(imageId: string, maskId: string): void;
}

/** Required props; B may add optional presentation props in its own module. */
export interface RedactionEditorProps extends EditorEvents {
  readonly image: LocalImage;
  readonly masks: readonly RedactionRect[];
  readonly highlights: readonly DetectedField[];
  readonly disabled?: boolean;
}

/** Future C implementation: active regions become opaque pixels in a new PNG Blob. */
export type RedactImage = (
  image: LocalImage,
  rectangles: readonly RedactionRect[],
) => Promise<Blob>;

/** Future C implementation: pure policy logic, independent of React and browser state. */
export type RecommendPrivacy = (
  fields: readonly DetectedField[],
  context: PrivacyContext,
) => readonly PrivacyRecommendation[];

/** A implements label-aware field extraction from its normalized OCR result. */
export type ExtractPrivacyFields = (ocr: OcrResult) => readonly DetectedField[];

/** A's reducer owns these session transitions; effects own OCR, Canvas and URLs. */
export type ScanStatus = 'idle' | 'running' | 'complete' | 'failed';

export interface SessionState {
  /** Additive v2 integration state; omitted by legacy v1 consumers. */
  reviewMode?: 'classic' | 'universal';
  image: LocalImage | null;
  context: PrivacyContext;
  scan: { status: ScanStatus; requestId: string | null; error: string | null };
  ocr: OcrResult | null;
  universalResult?: UniversalDetectionResult | null;
  sharingContextV2?: SharingContextV2;
  fields: readonly DetectedField[];
  recommendations: readonly PrivacyRecommendation[];
  decisions: Readonly<Record<string, FieldDecision>>;
  masks: readonly RedactionRect[];
  revision: number;
  preview: { imageId: string; revision: number; blob: Blob } | null;
}

export type SessionAction =
  | { type: 'SELECT_REVIEW_MODE'; mode: 'classic' | 'universal' }
  | { type: 'IMAGE_LOADED'; image: LocalImage }
  | { type: 'SCAN_STARTED'; imageId: string; requestId: string }
  | { type: 'SCAN_COMPLETED'; imageId: string; requestId: string; ocr: OcrResult; fields: readonly DetectedField[];
      universalResult?: UniversalDetectionResult }
  | { type: 'SCAN_FAILED'; imageId: string; requestId: string; error: string }
  | { type: 'CHANGE_CONTEXT'; context: PrivacyContext }
  | { type: 'APPLY_UNIVERSAL_CONTEXT'; imageId: string; context: SharingContextV2 }
  | { type: 'UPDATE_FIELD_DECISION'; imageId: string; fieldId: string; decision: PrivacyAction;
      /** Explicit manual-location acknowledgement for an unlocated image finding. */
      allowUnlocatedMask?: boolean }
  | { type: 'ADD_MANUAL_MASK'; mask: Extract<RedactionRect, { source: 'manual' }> }
  | { type: 'UPDATE_MASK'; imageId: string; maskId: string; rect: PixelRect }
  | { type: 'DELETE_MASK'; imageId: string; maskId: string }
  | { type: 'RESET_CHANGES' }
  | { type: 'NEW_IMAGE' }
  | { type: 'PREVIEW_COMPLETED'; imageId: string; revision: number; blob: Blob }
  | { type: 'PREVIEW_INVALIDATED' };
