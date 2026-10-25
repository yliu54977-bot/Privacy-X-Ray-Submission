import type { RecommendationReviewProps } from "./contracts";
import "./editor.css";
export function RecommendationReview({
  fields,
  recommendations,
  decisions,
  selectedFieldId,
  removedMaskFieldIds = [],
  status,
  error,
  disabled,
  onSelectField,
  onDecision,
}: RecommendationReviewProps) {
  const unresolved = fields.filter(
    (f) => !decisions[f.id] || decisions[f.id].action === "REVIEW",
  ).length;
  return (
    <section className="px-panel" aria-label="Privacy recommendations">
      <h2>Review sensitive information</h2>
      {status === "idle" && (
        <p>Scan to see suggestions, or add masks manually.</p>
      )}
      {status === "running" && (
        <p role="status">
          Scanning locally… You can continue using manual masks.
        </p>
      )}
      {status === "failed" && (
        <p role="alert">
          {error || "Scanning could not finish."} You can still redact manually.
        </p>
      )}
      {status === "complete" && fields.length === 0 && (
        <p>
          No sensitive fields were detected. Inspect the entire screenshot and
          add manual masks where needed.
        </p>
      )}
      {unresolved > 0 && (
        <p className="px-warning" role="status">
          {unresolved} field{unresolved === 1 ? "" : "s"} need a KEEP or MASK
          choice before export.
        </p>
      )}
      {fields.map((field) => {
        const suggestion = recommendations.find(
          (r) => r.fieldId === field.id && r.imageId === field.imageId,
        );
        const decision = decisions[field.id];
        return (
          <article
            key={field.id}
            className={`px-field ${field.id === selectedFieldId ? "px-field-active" : ""}`}
          >
            <button
              className="px-field-title"
              type="button"
              disabled={disabled}
              aria-pressed={field.id === selectedFieldId}
              onClick={() => onSelectField(field.id)}
            >
              {field.label}
            </button>
            <p className="px-field-value">{field.value}</p>
            <p>
              <span
                className={`px-action px-action-${decision?.action ?? "REVIEW"}`}
              >
                {decision?.action ?? "REVIEW"}
              </span>{" "}
              {suggestion && <small>Suggested: {suggestion.action}</small>}
            </p>
            <p>
              {suggestion?.explanation ??
                "No recommendation is available. Review this field manually."}
            </p>
            {(removedMaskFieldIds.includes(field.id) ||
              (decision?.action === "REVIEW" &&
                decision.reviewReason === "suggested_mask_removed")) && (
              <p className="px-warning">
                Suggested mask removed. Choose whether to keep this information
                visible or mask it.
              </p>
            )}
            <div className="px-choice">
              {(["KEEP", "MASK"] as const).map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={disabled}
                  aria-pressed={decision?.action === action}
                  onClick={() => onDecision(field.imageId, field.id, action)}
                >
                  {action === "KEEP" ? "Keep visible" : "Mask information"}
                </button>
              ))}
            </div>
          </article>
        );
      })}
      <p className="px-help">
        Inspect the whole image before sharing. Detection may miss sensitive
        information.
      </p>
    </section>
  );
}
