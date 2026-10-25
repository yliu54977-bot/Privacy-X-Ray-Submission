import { describe, expect, it } from "vitest";
import type { UniversalFinding, RecommendationV2 } from "../contracts";
import { privacyKnowledgeBase as taxonomy } from "../privacyKnowledgeBase";
import {
  belongsTo,
  confidenceLabel,
  effectiveAction,
  filterFindings,
  groupFindings,
  imageBoxes,
  recommendationFor,
  PAGE_SIZE,
} from "./reviewModel";
const finding: UniversalFinding = Object.freeze({
  id: "email",
  source: { kind: "image" as const, id: "one" },
  status: "UNCERTAIN",
  typeId: "email",
  label: "Email",
  value: "fictional@example.com",
  categoryIds: Object.freeze(["contact_information", "internet_identities"]),
  evidence: [],
  boxes: [{ x: 10, y: 20, width: 30, height: 40 }],
});
const recommendation: RecommendationV2 = {
  findingId: "email",
  source: finding.source,
  action: "KEEP",
  explanation: "Example",
  sensitivityReason: "Example",
  sharingNeedReason: "Example",
  reliability: "limited",
  rule: { source: "test", version: "1" },
};
const query = { search: "", category: "", filter: "all" as const };
describe("universal review presentation", () => {
  it("supports multiple category memberships and ancestor filters without duplicate cards", () => {
    expect(belongsTo(finding, "contact_information", taxonomy)).toBe(true);
    expect(belongsTo(finding, "internet_identities", taxonomy)).toBe(true);
    expect(belongsTo(finding, "personal", taxonomy)).toBe(true);
    expect(belongsTo(finding, "digital", taxonomy)).toBe(true);
    expect(
      groupFindings([finding], taxonomy).flatMap((g) => g.findings),
    ).toEqual([finding]);
  });
  it("keeps unknown and unrecognized categories reviewable", () => {
    const unknown = {
      ...finding,
      status: "UNKNOWN_POTENTIALLY_SENSITIVE" as const,
      typeId: undefined,
      categoryIds: [],
    };
    expect(
      filterFindings(
        [unknown],
        { ...query, category: "__unknown" },
        taxonomy,
        [],
        {},
      ),
    ).toEqual([unknown]);
    expect(groupFindings([unknown], taxonomy)[0].label).toBe(
      "Unknown information",
    );
    expect(
      groupFindings(
        [{ ...finding, categoryIds: ["future-category"] }],
        taxonomy,
      )[0].id,
    ).toBe("__unknown");
  });
  it("searches value and secondary category names case-insensitively", () => {
    expect(
      filterFindings(
        [finding],
        { ...query, search: "  INTERNET IDENTITIES " },
        taxonomy,
        [],
        {},
      ),
    ).toHaveLength(1);
    expect(
      filterFindings(
        [finding],
        { ...query, search: "EXAMPLE.COM" },
        taxonomy,
        [],
        {},
      ),
    ).toHaveLength(1);
  });
  it("scopes recommendations by source, including PDF page identity", () => {
    expect(
      recommendationFor(finding, [
        { ...recommendation, source: { kind: "image", id: "other" } },
      ]),
    ).toBeUndefined();
    expect(
      recommendationFor(
        { ...finding, source: { kind: "pdf", id: "doc", pageIndex: 1 } },
        [
          {
            ...recommendation,
            source: { kind: "pdf", id: "doc", pageIndex: 0 },
          },
        ],
      ),
    ).toBeUndefined();
  });
  it.each(["KEEP", "MASK", "REVIEW"] as const)(
    "honors explicit %s overrides",
    (action) => {
      expect(
        effectiveAction(finding, [recommendation], { email: action }),
      ).toBe(action);
      expect(
        filterFindings(
          [finding],
          { ...query, filter: action },
          taxonomy,
          [recommendation],
          { email: action },
        ),
      ).toHaveLength(1);
    },
  );
  it("uses REVIEW when no recommendation exists", () =>
    expect(effectiveAction(finding, [], {})).toBe("REVIEW"));
  it("does not synthesize boxes for document, absent, foreign-image or invalid coordinates", () => {
    expect(imageBoxes({ ...finding, boxes: undefined })).toEqual([]);
    expect(
      imageBoxes({ ...finding, source: { kind: "docx", id: "doc" } }),
    ).toEqual([]);
    expect(
      imageBoxes({
        ...finding,
        source: { kind: "pdf", id: "doc", pageIndex: 0 },
      }),
    ).toEqual([]);
    expect(
      imageBoxes(finding, { id: "other", width: 100, height: 100 }),
    ).toEqual([]);
    expect(
      imageBoxes({
        ...finding,
        boxes: [
          { x: NaN, y: 0, width: 1, height: 1 },
          { x: 0, y: 0, width: -1, height: 3 },
        ],
      }),
    ).toEqual([]);
    expect(imageBoxes(finding, { id: "one", width: 20, height: 20 })).toEqual(
      [],
    );
    expect(
      filterFindings(
        [{ ...finding, boxes: [] }],
        { ...query, filter: "unlocated" },
        taxonomy,
        [],
        {},
      ),
    ).toHaveLength(1);
  });
  it("handles 1000 immutable multi-category findings with bounded page size", () => {
    const input = Object.freeze(
      Array.from({ length: 1000 }, (_, i) =>
        Object.freeze({ ...finding, id: `f${i}` }),
      ),
    );
    const result = filterFindings(input, query, taxonomy, [], {});
    expect(result).toHaveLength(1000);
    expect(
      groupFindings(result.slice(0, PAGE_SIZE), taxonomy).flatMap(
        (g) => g.findings,
      ),
    ).toHaveLength(20);
    expect(new Set(result.map((f) => f.id)).size).toBe(1000);
  });
  it.each([undefined, NaN, Infinity, -1, 2])(
    "does not display invalid confidence %s as reliability",
    (score) => expect(confidenceLabel(score)).toBe("Not provided"),
  );
});
