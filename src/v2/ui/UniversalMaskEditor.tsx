import { DetectionOverlays } from "./DetectionOverlays";
import { PrecisionControls } from "./PrecisionControls";
import { RedactionEditor } from "../../features/editor";
import type {
  DetectedField,
  FieldDecision,
  PrivacyAction,
  RedactionEditorProps,
} from "../../types";
import type { RecommendationV2, UniversalFinding } from "../contracts";
import { effectiveAction, imageBoxes } from "./reviewModel";

export interface UniversalMaskEditorProps
  extends Omit<RedactionEditorProps, "highlights"> {
  findings: readonly UniversalFinding[];
  recommendations: readonly RecommendationV2[];
  overrides: Readonly<Record<string, PrivacyAction>>;
  selectedFindingId?: string | null;
  onSelectFindingId?(id: string): void;
}
/** Presentation adapter only: unknown is a v1 highlight placeholder, never a reclassification. */
export function UniversalMaskEditor({
  findings,
  recommendations,
  overrides,
  selectedFindingId,
  onSelectFindingId,
  ...editor
}: UniversalMaskEditorProps) {
  const visible = findings.filter(
    (f) => imageBoxes(f, editor.image).length > 0,
  );
  const highlights: DetectedField[] = visible.map((f) => ({
    id: f.id,
    imageId: editor.image.id,
    type: "unknown",
    label: f.label,
    value: f.value ?? "",
    boxes: imageBoxes(f, editor.image),
    wordIds: [],
    confidence: f.ocrRecognitionConfidence ?? 0,
  }));
  const decisions: Record<string, FieldDecision> = {};
  for (const f of visible) {
    const action = effectiveAction(f, recommendations, overrides);
    decisions[f.id] =
      action === "REVIEW"
        ? {
            fieldId: f.id,
            imageId: editor.image.id,
            action,
            reviewReason: "recommendation",
          }
        : { fieldId: f.id, imageId: editor.image.id, action };
  }
  return (
    <div className="uv-mask-editor">
      <p className="uv-muted">
        Manual regions are yours. Field-linked regions follow a finding. Select
        a region to move, resize or remove it.
      </p>
      <RedactionEditor
        {...editor}
        highlights={highlights}
        selectedFieldId={selectedFindingId}
        decisions={decisions}
        onSelectHighlight={onSelectFindingId}
        renderFindingOverlay={(pointerEnabled) => (
          <DetectionOverlays
            image={editor.image}
            findings={visible}
            actions={Object.fromEntries(
              visible.map((f) => [
                f.id,
                effectiveAction(f, recommendations, overrides),
              ]),
            )}
            selectedId={selectedFindingId}
            pointerEnabled={pointerEnabled}
            disabled={editor.disabled}
            onSelect={onSelectFindingId}
          />
        )}
      />
      <div className="uv-overlay-legend" aria-label="Detection overlay legend">
        <span className="uv-legend-mask">MASK · purple outline</span>
        <span className="uv-legend-review">REVIEW · amber dashed</span>
        <span className="uv-legend-keep">KEEP · green dotted</span>
      </div>
      <p className="uv-muted">
        Choose Select / Edit to select an outline. Tab to a finding, then use
        arrow keys to move between located findings. Missing locations are never
        drawn.
      </p>
      <PrecisionControls {...editor} />
    </div>
  );
}
