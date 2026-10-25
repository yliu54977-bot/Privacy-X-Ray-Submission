import type { PrivacyAction } from "../../types";
import type { RecommendationV2, UniversalDetectionResult } from "../contracts";
import { effectiveAction, imageBoxes } from "./reviewModel";

export function inspectionCounts(
  result: UniversalDetectionResult,
  recommendations: readonly RecommendationV2[],
  overrides: Readonly<Record<string, PrivacyAction>>,
) {
  const actions = result.findings.map((f) =>
    effectiveAction(f, recommendations, overrides),
  );
  return {
    total: actions.length,
    mask: actions.filter((a) => a === "MASK").length,
    review: actions.filter((a) => a === "REVIEW").length,
    keep: actions.filter((a) => a === "KEEP").length,
    uninspected: result.coverage.areas.filter((a) => a.status === "uninspected")
      .length,
    partial: result.coverage.areas.filter((a) => a.status === "partial").length,
    unlocatedMasks: result.findings.filter(
      (f, i) => actions[i] === "MASK" && !imageBoxes(f).length,
    ).length,
  };
}
export function InspectionOverview({
  result,
  recommendations,
  overrides,
}: {
  result: UniversalDetectionResult;
  recommendations: readonly RecommendationV2[];
  overrides: Readonly<Record<string, PrivacyAction>>;
}) {
  const c = inspectionCounts(result, recommendations, overrides);
  return (
    <section
      className="uv-panel uv-overview"
      aria-label="Privacy inspection overview"
    >
      <p className="uv-eyebrow">YOUR REVIEW AT A GLANCE</p>
      <h2>Information, decisions and limits</h2>
      <dl className="uv-stat-grid">
        {[
          ["Detected findings", c.total],
          ["Marked MASK", c.mask],
          ["Unresolved REVIEW", c.review],
          ["Kept visible", c.keep],
          ["Uninspected areas", c.uninspected],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="uv-muted">
        Decision counts are not privacy-safety scores. A MASK choice is not
        proof that pixels are covered. {c.partial} inspection areas were only
        partially inspected.
      </p>
      {!result.coverage.areas.length && (
        <p className="uv-warning">
          Coverage was not reported. A zero count does not mean all content was
          inspected.
        </p>
      )}
      {c.unlocatedMasks > 0 && (
        <p className="uv-warning">
          {c.unlocatedMasks} MASK choices have no precise image boxes. Check
          their manually located redactions.
        </p>
      )}
    </section>
  );
}
