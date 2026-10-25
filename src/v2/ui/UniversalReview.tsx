import { useEffect, useId, useState } from "react";
import type { PrivacyAction } from "../../types";
import type {
  UniversalDetectionResult,
  UniversalFinding,
  RecommendationV2,
} from "../contracts";
import type { PrivacyTaxonomyRegistry } from "../taxonomyRegistry";
import {
  belongsTo,
  confidenceLabel,
  effectiveAction,
  filterFindings,
  groupFindings,
  imageBoxes,
  methodLabels,
  PAGE_SIZE,
  recommendationFor,
} from "./reviewModel";
import type { ReviewFilter } from "./reviewModel";
import "./universal.css";

export interface UniversalReviewProps {
  result: UniversalDetectionResult;
  taxonomy: PrivacyTaxonomyRegistry;
  recommendations: readonly RecommendationV2[];
  overrides: Readonly<Record<string, PrivacyAction>>;
  status?: "ready" | "scanning" | "failed";
  error?: string;
  selectedFindingId?: string | null;
  onSelectFinding(finding: UniversalFinding): void;
  onDecision(finding: UniversalFinding, action: PrivacyAction): void;
}
export function UniversalReview({
  result,
  taxonomy,
  recommendations,
  overrides,
  status = "ready",
  error,
  selectedFindingId,
  onSelectFinding,
  onDecision,
}: UniversalReviewProps) {
  const id = useId();
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [filter, setFilter] = useState<ReviewFilter>("all");
  const [page, setPage] = useState(0);
  const filtered = filterFindings(
    result.findings,
    { search, category, filter },
    taxonomy,
    recommendations,
    overrides,
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  // Reveal an externally selected finding without forcing filters back on every user search.
  useEffect(() => {
    if (!selectedFindingId) return;
    const index = filtered.findIndex((f) => f.id === selectedFindingId);
    if (index >= 0) setPage(Math.floor(index / PAGE_SIZE));
    else {
      const fullIndex = result.findings.findIndex(
        (f) => f.id === selectedFindingId,
      );
      if (fullIndex < 0) return;
      setSearch("");
      setCategory("");
      setFilter("all");
      setPage(Math.floor(fullIndex / PAGE_SIZE));
    }
  }, [selectedFindingId, result.source.id]);

  const unresolved = result.findings.filter(
    (f) => effectiveAction(f, recommendations, overrides) === "REVIEW",
  ).length;
  function resetQuery(update: () => void) {
    update();
    setPage(0);
  }
  return (
    <section
      className="uv-review uv-panel"
      aria-label="Universal information review"
    >
      <div className="uv-section-heading">
        <div>
          <p className="uv-eyebrow">INFORMATION REVIEW</p>
          <h2>Decide what belongs in your screenshot</h2>
        </div>
        <span className="uv-count">{result.findings.length} findings</span>
      </div>
      <p className="uv-muted">
        KEEP leaves information visible; it does not guarantee safe sharing.
        Check every recommendation against your recipient's actual needs.
      </p>
      <CoverageNotice result={result} />
      {status === "scanning" && (
        <p role="status">
          Inspecting locally. Existing results may change when this scan
          finishes.
        </p>
      )}
      {status === "failed" && (
        <p role="alert" className="uv-warning">
          {error ?? "Inspection could not finish."} You can still add masks
          manually. Coverage may be incomplete.
        </p>
      )}
      <button type="button" disabled={status === 'scanning' || !filtered.some(f => f.boxes?.length)}
        onClick={() => filtered.filter(f => f.boxes?.length).forEach(f => onDecision(f, 'MASK'))}>
        Mask matching located findings ({filtered.filter(f => f.boxes?.length).length})
      </button>
      <p className="uv-muted">This applies your MASK choice to the filtered findings with image locations. Findings without locations still need manual review.</p>
      <div className="uv-filters">
        <label htmlFor={`${id}-search`}>
          Search information
          <input
            id={`${id}-search`}
            type="search"
            value={search}
            placeholder="Find a label, value or category"
            onChange={(e) => resetQuery(() => setSearch(e.target.value))}
          />
        </label>
        <label htmlFor={`${id}-category`}>
          Category
          <select
            id={`${id}-category`}
            value={category}
            onChange={(e) => resetQuery(() => setCategory(e.target.value))}
          >
            <option value="">All categories ({result.findings.length})</option>
            <option value="__unknown">
              Unknown information (
              {
                result.findings.filter((f) =>
                  belongsTo(f, "__unknown", taxonomy),
                ).length
              }
              )
            </option>
            {taxonomy.categories.map((c) => {
              const count = result.findings.filter((f) =>
                belongsTo(f, c.id, taxonomy),
              ).length;
              return count ? (
                <option key={c.id} value={c.id}>
                  {c.name} ({count})
                </option>
              ) : null;
            })}
          </select>
        </label>
        <label htmlFor={`${id}-filter`}>
          Show
          <select
            id={`${id}-filter`}
            value={filter}
            onChange={(e) =>
              resetQuery(() => setFilter(e.target.value as ReviewFilter))
            }
          >
            <option value="all">All findings</option>
            <option value="REVIEW">Needs a decision</option>
            <option value="MASK">Marked MASK</option>
            <option value="KEEP">Marked KEEP</option>
            <option value="uncertain">Uncertain or unknown</option>
            <option value="unlocated">No precise image location</option>
          </select>
        </label>
      </div>
      <p role="status" className="uv-results">
        {filtered.length} matching findings · {unresolved} need a decision
      </p>
      {filtered.length === 0 && (
        <p className="uv-empty">
          {result.findings.length
            ? "No findings match these filters. Try another category or clear your search."
            : "No findings were returned. This does not mean the screenshot is safe. Inspect it manually and check the coverage limits above."}
        </p>
      )}
      {groupFindings(visible, taxonomy).map((group) => (
        <details key={`${currentPage}-${group.id}`} className="uv-group" open>
          <summary>
            {group.label}
            <span>{group.findings.length} on this page</span>
          </summary>
          {group.findings.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              taxonomy={taxonomy}
              recommendation={recommendationFor(finding, recommendations)}
              action={effectiveAction(finding, recommendations, overrides)}
              overridden={overrides[finding.id] !== undefined}
              selected={selectedFindingId === finding.id}
              disabled={status === "scanning"}
              onSelect={() => onSelectFinding(finding)}
              onDecision={(action) => onDecision(finding, action)}
              onCategory={(categoryId) =>
                resetQuery(() => setCategory(categoryId))
              }
            />
          ))}
        </details>
      ))}
      {filtered.length > PAGE_SIZE && (
        <nav className="uv-pagination" aria-label="Finding pages">
          <button
            type="button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous page
          </button>
          <span>
            Page {currentPage + 1} of {pages}
          </span>
          <button
            type="button"
            disabled={currentPage + 1 >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Next page
          </button>
        </nav>
      )}
      <p className="uv-muted">
        Findings can belong to several categories. Each appears once on a page;
        category counts include related subcategories.
      </p>
    </section>
  );
}
export function CoverageNotice({
  result,
}: {
  result: UniversalDetectionResult;
}) {
  const gaps = result.coverage.areas.filter((a) => a.status !== "inspected");
  return (
    <aside className="uv-coverage" aria-label="Inspection coverage">
      <h3>What this inspection could miss</h3>
      <p>
        Detection is limited to the methods listed here. Unsupported content
        still needs your attention.
      </p>
      {result.coverage.warnings.length > 0 && (
        <ul>
          {result.coverage.warnings.map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
        </ul>
      )}
      {gaps.length > 0 && (
        <p>
          <strong>
            {gaps.length} inspection areas are partial or uninspected.
          </strong>{" "}
          Review visible surroundings, encoded content and other details
          yourself.
        </p>
      )}
      {!result.coverage.areas.length && (
        <p>
          Inspection coverage was not supplied. Do not assume any area was
          checked.
        </p>
      )}
      <details>
        <summary>View inspection methods and limits</summary>
        <ul>
          {result.coverage.areas.map((a) => (
            <li key={a.family}>
              <strong>
                {methodLabels[a.family]} —{" "}
                {a.status === "uninspected"
                  ? "Not inspected"
                  : a.status === "partial"
                    ? "Partially inspected"
                    : "Inspected with limits"}
              </strong>
              <p>{a.explanation}</p>
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}
interface CardProps {
  finding: UniversalFinding;
  taxonomy: PrivacyTaxonomyRegistry;
  recommendation?: RecommendationV2;
  action: PrivacyAction;
  overridden: boolean;
  selected: boolean;
  disabled: boolean;
  onSelect(): void;
  onDecision(action: PrivacyAction): void;
  onCategory(id: string): void;
}
function FindingCard({
  finding: f,
  taxonomy,
  recommendation: r,
  action,
  overridden,
  selected,
  disabled,
  onSelect,
  onDecision,
  onCategory,
}: CardProps) {
  const located = imageBoxes(f).length > 0;
  return (
    <article
      className={`uv-finding ${selected ? "uv-selected" : ""}`}
      aria-label={f.label}
      aria-current={selected ? "true" : undefined}
    >
      <div className="uv-card-heading">
        <h3>{f.label}</h3>
        <span className={`uv-badge uv-${action.toLowerCase()}`}>{action}</span>
      </div>
      {f.value && <p className="uv-value">{f.value}</p>}
      <div className="uv-tags">
        {f.categoryIds.map((categoryId) => (
          <button
            type="button"
            key={categoryId}
            onClick={() => onCategory(categoryId)}
            aria-label={`Filter category: ${taxonomy.category(categoryId)?.name ?? categoryId}`}
          >
            {taxonomy.category(categoryId)?.name ?? "Unrecognized category"}
          </button>
        ))}
      </div>
      <p className="uv-meta">
        {f.status === "KNOWN"
          ? "Recognized category"
          : f.status === "UNCERTAIN"
            ? "Uncertain classification"
            : "Unknown information · may be sensitive"}
        {overridden ? " · Your choice" : ""} · Suggested:{" "}
        {r?.action ?? "REVIEW"}
      </p>
      <p>
        {r?.explanation ??
          "No policy recommendation is available. Check whether this information belongs in what you share."}
      </p>
      <dl className="uv-reasons">
        <dt>Why it may be sensitive</dt>
        <dd>
          {r?.sensitivityReason ??
            ((f.typeId &&
              taxonomy.type(f.typeId)?.disclosureConsequences.join(" ")) ||
              "The sensitivity is not established. Check its content and who it belongs to.")}
        </dd>
        <dt>Why share or leave it out</dt>
        <dd>
          {r?.sharingNeedReason ??
            "The recipient’s need has not been established. Confirm the minimum information required."}
        </dd>
      </dl>
      {(f.uncertaintyReason ||
        r?.uncertaintyReason ||
        f.status !== "KNOWN") && (
        <p className="uv-warning">
          {f.uncertaintyReason ??
            r?.uncertaintyReason ??
            "This classification needs your review."}
          {f.uncertaintyReason && r?.uncertaintyReason
            ? ` ${r.uncertaintyReason}`
            : ""}
        </p>
      )}
      <p className="uv-location">
        {located
          ? "Located in the original image"
          : "No precise image location. Locate this information yourself and draw a manual mask if needed."}
      </p>
      {!located && action === "MASK" && (
        <p className="uv-warning">
          MASK records your intent. It does not cover pixels without a manually
          located mask. Confirm the final image before export.
        </p>
      )}
      <details className="uv-evidence">
        <summary>Detection details and reliability</summary>
        <p>
          Text recognition: {confidenceLabel(f.ocrRecognitionConfidence)}.
          Category evidence: {f.classificationEvidence ? 'Validated detector rule' : confidenceLabel(f.entityClassificationConfidence)}
          .
        </p>
        <p>
          Recommendation evidence:{" "}
          {r?.reliability === "supported"
            ? "Supported by the stated rule; still needs your review."
            : r?.reliability === "limited"
              ? "Limited evidence."
              : "Requires your review."}{" "}
          These are not privacy-safety scores.
        </p>
        {f.evidence.length ? (
          <ul>
            {f.evidence.map((e) => (
              <li key={e.id}>
                <strong>{methodLabels[e.method]}</strong>
                <p className="uv-meta">
                  Evidence source:{" "}
                  {
                    {
                      ocr: "Recognized image text",
                      image: "Image pixels",
                      metadata: "File metadata",
                      derived: "Combined evidence",
                    }[e.source]
                  }
                </p>
                <p>{e.explanation}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No detection evidence was supplied.</p>
        )}
        {r && (
          <p>
            Rule source: {r.rule.source} · {r.rule.version}
            {r.rule.note ? ` · ${r.rule.note}` : ""}
          </p>
        )}
      </details>
      <div
        className="uv-actions"
        role="group"
        aria-label={`Decision for ${f.label}`}
      >
        {(["KEEP", "MASK", "REVIEW"] as const).map((a) => (
          <button
            type="button"
            key={a}
            disabled={disabled}
            aria-pressed={action === a}
            onClick={() => onDecision(a)}
          >
            {a === "KEEP"
              ? "Keep visible"
              : a === "MASK"
                ? "Mask information"
                : "Review later"}
          </button>
        ))}
        <button type="button" onClick={onSelect} disabled={!located}>
          Locate in image
        </button>
      </div>
    </article>
  );
}
