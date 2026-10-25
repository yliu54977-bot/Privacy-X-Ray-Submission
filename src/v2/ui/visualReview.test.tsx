import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  UniversalDetectionResult,
  UniversalFinding,
  RecommendationV2,
} from "../contracts";
import { DetectionOverlays } from "./DetectionOverlays";
import { inspectionCounts, InspectionOverview } from "./InspectionOverview";
import { ProcessingFeedback } from "./ProcessingFeedback";
import { FinalImageReview } from "./FinalImageReview";
import { BeforeAfterComparison } from "./BeforeAfterComparison";
const source = { kind: "image" as const, id: "current" };
const located: UniversalFinding = {
  id: "located",
  source,
  status: "KNOWN",
  label: "Fictional account",
  categoryIds: [],
  evidence: [],
  boxes: [{ x: 12.5, y: 20, width: 50.25, height: 18 }],
};
const result: UniversalDetectionResult = {
  source,
  findings: [
    located,
    {
      ...located,
      id: "unknown",
      boxes: undefined,
      status: "UNKNOWN_POTENTIALLY_SENSITIVE",
    },
  ],
  coverage: {
    source,
    areas: [
      { family: "pattern", status: "partial", explanation: "Text only" },
      { family: "metadata", status: "uninspected", explanation: "Unsupported" },
    ],
    warnings: ["Not all content inspected"],
  },
};
const rec: RecommendationV2 = {
  findingId: "located",
  source,
  action: "MASK",
  explanation: "Example",
  sensitivityReason: "Sensitive",
  sharingNeedReason: "May be unnecessary",
  reliability: "limited",
  rule: { source: "Test fixture", version: "1" },
};
describe("advanced visual review boundaries", () => {
  it("renders original-pixel boxes and accessible decision styles; never guesses missing/foreign/document boxes", () => {
    const html = renderToStaticMarkup(
      <svg>
        <DetectionOverlays
          image={{ id: "current", width: 100, height: 100 }}
          findings={[
            ...result.findings,
            { ...located, id: "foreign", source: { kind: "image", id: "old" } },
            { ...located, id: "doc", source: { kind: "docx", id: "current" } },
          ]}
          actions={{ located: "MASK" }}
          onSelect={() => {}}
        />
      </svg>,
    );
    expect(html.match(/<rect/g)).toHaveLength(1);
    expect(html).toContain('x="12.5"');
    expect(html).toContain('width="50.25"');
    expect(html).toContain("Fictional account: MASK");
    expect(html).toContain('tabindex="0"');
  });
  it.each(["KEEP", "MASK", "REVIEW"] as const)(
    "exposes %s without changing geometry or logging values",
    (action) => {
      const html = renderToStaticMarkup(
        <svg>
          <DetectionOverlays
            image={{ id: "current", width: 100, height: 100 }}
            findings={[{ ...located, value: "DO-NOT-INCLUDE-IN-LABEL" }]}
            actions={{ located: action }}
            onSelect={() => {}}
          />
        </svg>,
      );
      expect(html).toContain(`uv-detection-${action.toLowerCase()}`);
      expect(html).toContain(`Fictional account: ${action}`);
      expect(html).not.toContain("DO-NOT-INCLUDE-IN-LABEL");
    },
  );
  it("counts decisions separately from coverage, including coordinate-free MASK", () => {
    expect(inspectionCounts(result, [rec], { unknown: "MASK" })).toEqual({
      total: 2,
      mask: 2,
      review: 0,
      keep: 0,
      uninspected: 1,
      partial: 1,
      unlocatedMasks: 1,
    });
    expect(inspectionCounts(result, [rec], { located: "KEEP" })).toMatchObject({
      total: 2,
      mask: 0,
      review: 1,
      keep: 1,
    });
    const html = renderToStaticMarkup(
      <InspectionOverview
        result={result}
        recommendations={[rec]}
        overrides={{ unknown: "MASK" }}
      />,
    );
    expect(html).toContain("no precise image boxes");
    expect(html).toContain("not privacy-safety scores");
  });
  it("has no false inspection completion before a scan", () => {
    const html = renderToStaticMarkup(
      <ProcessingFeedback status="idle" stage="idle" unresolved={0} />,
    );
    expect(html.match(/Not started/g)).toHaveLength(4);
    expect(html).not.toContain(">Complete<");
  });
  it("reports the current pipeline step, partial coverage, and limited policy honestly", () => {
    const running = renderToStaticMarkup(
      <ProcessingFeedback status="running" stage="detection" unresolved={0} />,
    );
    expect(running).toContain('aria-current="step"');
    expect(running).toContain("Checking supported information");
    const done = renderToStaticMarkup(
      <ProcessingFeedback
        status="complete"
        stage="review"
        coverage={result.coverage}
        recommendations={[rec]}
        unresolved={1}
      />,
    );
    expect(done.match(/Partial \/ limited/g)).toHaveLength(2);
    expect(done).toContain("Needs your review");
  });
  it("does not mark pending steps complete after a failed scan", () => {
    const html = renderToStaticMarkup(
      <ProcessingFeedback status="failed" stage="ocr" unresolved={0} />,
    );
    expect(html).toContain("Could not finish");
    expect(html).toContain("Manual redaction remains available");
    expect(html).not.toContain(">Complete<");
  });
  it("compares actual supplied original/PNG URLs using a keyboard range without generating export pixels", () => {
    const html = renderToStaticMarkup(
      <BeforeAfterComparison
        originalUrl="blob:original"
        redactedUrl="blob:encoded-png"
        width={1200}
        height={850}
        onReady={() => {}}
        onError={() => {}}
      />,
    );
    expect(html).toContain('src="blob:original"');
    expect(html).toContain('src="blob:encoded-png"');
    expect(html).toContain('type="range"');
    expect(html).toContain("50% redacted image shown");
    expect(html).toContain("inset(0 50% 0 0)");
    expect(html).not.toContain("<canvas");
  });
  it.each([
    { imageId: "old", revision: 4 },
    { imageId: "current", revision: 3 },
  ])("hides stale comparison and download for %j", (preview) => {
    const html = renderToStaticMarkup(
      <FinalImageReview
        imageId="current"
        revision={4}
        ready
        originalUrl="blob:original"
        preview={{ ...preview, url: "blob:stale", width: 1200, height: 850 }}
        onPreview={() => {}}
        onDownload={() => {}}
      />,
    );
    expect(html).not.toContain("blob:stale");
    expect(html).not.toContain("Before and after image comparison");
    expect(html).not.toContain("Download reviewed PNG");
  });
});
