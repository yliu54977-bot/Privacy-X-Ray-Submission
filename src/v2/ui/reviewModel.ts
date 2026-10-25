import type { PrivacyAction, PixelRect } from "../../types";
import type { RecommendationV2, UniversalFinding } from "../contracts";
import type { PrivacyTaxonomyRegistry } from "../taxonomyRegistry";

export type ReviewFilter = "all" | PrivacyAction | "uncertain" | "unlocated";
export interface ReviewQuery {
  search: string;
  category: string;
  filter: ReviewFilter;
}
export const PAGE_SIZE = 20;
export const sourceKey = (source: UniversalFinding["source"]) =>
  `${source.kind}:${source.id}${source.kind === "pdf" ? `:${source.pageIndex}` : ""}`;
export function recommendationFor(
  finding: UniversalFinding,
  recommendations: readonly RecommendationV2[],
) {
  return recommendations.find(
    (r) =>
      r.findingId === finding.id &&
      sourceKey(r.source) === sourceKey(finding.source),
  );
}
export function effectiveAction(
  finding: UniversalFinding,
  recommendations: readonly RecommendationV2[],
  overrides: Readonly<Record<string, PrivacyAction>>,
) {
  return (
    overrides[finding.id] ??
    recommendationFor(finding, recommendations)?.action ??
    "REVIEW"
  );
}
export function imageBoxes(
  finding: UniversalFinding,
  image?: { id: string; width: number; height: number },
): readonly PixelRect[] {
  if (
    finding.source.kind !== "image" ||
    (image && finding.source.id !== image.id)
  )
    return [];
  return (finding.boxes ?? []).filter(
    (b) =>
      [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
      b.x >= 0 &&
      b.y >= 0 &&
      b.width > 0 &&
      b.height > 0 &&
      (!image ||
        (b.x + b.width <= image.width && b.y + b.height <= image.height)),
  );
}
export function belongsTo(
  finding: UniversalFinding,
  category: string,
  taxonomy: PrivacyTaxonomyRegistry,
) {
  if (!category) return true;
  if (category === "__unknown")
    return (
      finding.status === "UNKNOWN_POTENTIALLY_SENSITIVE" ||
      !finding.categoryIds.length ||
      finding.categoryIds.every((id) => !taxonomy.category(id))
    );
  return finding.categoryIds.some(
    (id) =>
      id === category || taxonomy.ancestors(id).some((c) => c.id === category),
  );
}
export function filterFindings(
  findings: readonly UniversalFinding[],
  query: ReviewQuery,
  taxonomy: PrivacyTaxonomyRegistry,
  recommendations: readonly RecommendationV2[],
  overrides: Readonly<Record<string, PrivacyAction>>,
) {
  const needle = query.search.trim().toLocaleLowerCase();
  return findings.filter(
    (f) =>
      belongsTo(f, query.category, taxonomy) &&
      (!needle ||
        [
          f.label,
          f.value,
          f.uncertaintyReason,
          f.typeId && taxonomy.type(f.typeId)?.name,
          ...f.categoryIds.map((id) => taxonomy.category(id)?.name ?? id),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle)) &&
      (query.filter === "all" ||
        (query.filter === "uncertain"
          ? f.status !== "KNOWN"
          : query.filter === "unlocated"
            ? imageBoxes(f).length === 0
            : effectiveAction(f, recommendations, overrides) === query.filter)),
  );
}
/** Each finding appears once; secondary memberships remain visible and filterable. */
export function groupFindings(
  findings: readonly UniversalFinding[],
  taxonomy: PrivacyTaxonomyRegistry,
) {
  const groups = new Map<
    string,
    { id: string; label: string; findings: UniversalFinding[] }
  >();
  for (const finding of findings) {
    const category =
      finding.status === "UNKNOWN_POTENTIALLY_SENSITIVE"
        ? undefined
        : finding.categoryIds.map((id) => taxonomy.category(id)).find(Boolean);
    const id = category?.id ?? "__unknown";
    if (!groups.has(id))
      groups.set(id, {
        id,
        label: category?.name ?? "Unknown information",
        findings: [],
      });
    groups.get(id)!.findings.push(finding);
  }
  return [...groups.values()];
}
export const methodLabels = {
  pattern: "Text pattern",
  label_context: "Nearby labels",
  nlp_entity: "Language analysis",
  visual_object: "Visual detection",
  document_structure: "Document layout",
  metadata: "File metadata",
  relationship: "Combined information",
} as const;
export function confidenceLabel(score: number | undefined) {
  if (score === undefined || !Number.isFinite(score) || score < 0 || score > 1)
    return "Not provided";
  return score < 0.7 ? "Needs checking" : "Stronger supporting evidence";
}
