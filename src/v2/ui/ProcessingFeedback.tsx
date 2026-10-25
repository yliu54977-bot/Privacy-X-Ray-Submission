import type { ScanStatus } from "../../types";
import type { DetectionCoverage, RecommendationV2 } from "../contracts";
export type InspectionStage =
  | "idle"
  | "ocr"
  | "detection"
  | "policy"
  | "review";
export interface ProcessingFeedbackProps {
  status: ScanStatus;
  stage: InspectionStage;
  progress?: number;
  coverage?: DetectionCoverage;
  recommendations?: readonly RecommendationV2[];
  unresolved: number;
}
export function ProcessingFeedback({
  status,
  stage,
  progress = 0,
  coverage,
  recommendations = [],
  unresolved,
}: ProcessingFeedbackProps) {
  const order: Exclude<InspectionStage, "idle">[] = [
    "ocr",
    "detection",
    "policy",
    "review",
  ];
  const current = stage === "idle" ? -1 : order.indexOf(stage),
    done = status === "complete";
  const limited =
    coverage?.areas.some((a) => a.status !== "inspected") ?? false;
  const limitedPolicy =
    !recommendations.length ||
    recommendations.some((r) => r.reliability !== "supported");
  return (
    <section
      className="uv-panel uv-processing"
      aria-label="Inspection progress"
    >
      <h2>From screenshot to your decision</h2>
      <ol className="uv-process-steps">
        {order.map((step, index) => {
          const finished =
            done ||
            ((status === "running" || status === "failed") && index < current);
          const active = status === "running" && step === stage;
          const failed = status === "failed" && step === stage;
          const partial =
            done &&
            ((step === "detection" && limited) ||
              (step === "policy" && limitedPolicy));
          const label = failed
            ? "Could not finish"
            : active
              ? "In progress"
              : partial
                ? "Partial / limited"
                : finished
                  ? step === "review" && unresolved
                    ? "Needs your review"
                    : "Complete"
                  : "Not started";
          return (
            <li
              key={step}
              className={`uv-step ${failed ? "uv-step-failed" : active ? "uv-step-active" : partial ? "uv-step-partial" : finished ? "uv-step-complete" : ""}`}
              aria-current={active ? "step" : undefined}
            >
              <span className="uv-step-number">{index + 1}</span>
              <div>
                <strong>
                  {
                    {
                      ocr: "OCR",
                      detection: "Detection",
                      policy: "Policy guidance",
                      review: "Your review",
                    }[step]
                  }
                </strong>
                <span>{label}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {status === "running" && (
        <p role="status">
          {stage === "ocr"
            ? `Reading text locally · ${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`
            : stage === "detection"
              ? "Checking supported information categories locally."
              : "Preparing review guidance locally."}
        </p>
      )}
      {status === "failed" && (
        <p role="alert">
          Inspection did not finish. Manual redaction remains available; do not
          treat earlier results as complete coverage.
        </p>
      )}
      <p className="uv-muted">
        Completed steps do not mean every kind of content was inspected.
        Coverage warnings identify partial and unsupported methods.
      </p>
    </section>
  );
}
