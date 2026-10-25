import type { ReactNode } from "react";
import type {
  DetectedField,
  FieldDecision,
  PrivacyContext,
  PrivacyRecommendation,
  RedactionEditorProps,
} from "../../types";

/** Approved spec event boundary; replaces the provisional whole-array editor callback. */
export interface EditorProps extends RedactionEditorProps {
  readonly renderFindingOverlay?: (pointerEnabled: boolean) => ReactNode;
  readonly onSelectHighlight?: (fieldId: string) => void;
  readonly selectedFieldId?: string | null;
  readonly decisions?: Readonly<Record<string, FieldDecision>>;
}
export interface ContextSelectorProps {
  value: PrivacyContext | null;
  requiresConfirmation?: boolean;
  disabled?: boolean;
  onChange(context: PrivacyContext): void;
}
export interface RecommendationReviewProps {
  fields: readonly DetectedField[];
  recommendations: readonly PrivacyRecommendation[];
  decisions: Readonly<Record<string, FieldDecision>>;
  selectedFieldId?: string | null;
  removedMaskFieldIds?: readonly string[];
  status: "idle" | "running" | "complete" | "failed";
  error?: string | null;
  disabled?: boolean;
  onSelectField(fieldId: string): void;
  onDecision(imageId: string, fieldId: string, action: "KEEP" | "MASK"): void;
}
