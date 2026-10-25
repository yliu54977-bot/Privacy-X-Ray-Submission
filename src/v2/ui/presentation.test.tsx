import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LocalImage } from "../../types";
import { privacyKnowledgeBase as taxonomy } from "../privacyKnowledgeBase";
import { UniversalReview } from "./UniversalReview";
import { SharingContextForm, contextPresets } from "./SharingContextForm";
import { UniversalMaskEditor } from "./UniversalMaskEditor";
import { FinalImageReview } from "./FinalImageReview";
import { mockReview } from "./mockData";
const image: LocalImage = {
  id: "sample",
  width: 1200,
  height: 850,
  mimeType: "image/png",
  file: {} as File,
  previewUrl: "blob:fictional",
};
const props = {
  ...mockReview(image),
  taxonomy,
  overrides: {},
  onSelectFinding: () => {},
  onDecision: () => {},
};
describe("review safeguards and accessible presentation", () => {
  it("shows coverage and unknown guidance even with zero findings", () => {
    const html = renderToStaticMarkup(
      <UniversalReview {...props} result={{ ...props.result, findings: [] }} />,
    );
    expect(html).toContain(
      "No findings were returned. This does not mean the screenshot is safe.",
    );
    expect(html).toContain("What this inspection could miss");
    expect(html).toContain("Faces, backgrounds and QR codes");
  });
  it("distinguishes unlocated MASK intent from covered pixels", () => {
    const html = renderToStaticMarkup(
      <UniversalReview {...props} overrides={{ unknown: "MASK" }} />,
    );
    expect(html).toContain(
      "It does not cover pixels without a manually located mask",
    );
    expect(html).toContain("Uncertain classification");
    expect(html).toContain("These are not privacy-safety scores");
    expect(html).toContain(
      "KEEP leaves information visible; it does not guarantee safe sharing",
    );
  });
  it("bounds initial large-list DOM to 20 findings", () => {
    const data = mockReview(image, true);
    const html = renderToStaticMarkup(<UniversalReview {...props} {...data} />);
    expect(html.match(/<article/g)).toHaveLength(20);
    expect(html).toContain("of 12");
  });
  it("explains context notes and makes application a deliberate confirmation", () => {
    const html = renderToStaticMarkup(
      <SharingContextForm
        value={contextPresets[0]}
        taxonomy={taxonomy}
        onApply={() => {}}
      />,
    );
    expect(html).toContain("it is not interpreted by an AI");
    expect(html).toContain("Whose information is this?");
    expect(html).toContain("not official requirements");
    expect(html).toContain('disabled=""');
  });
  it("exposes a keyboard alternative for mask editing", () => {
    const html = renderToStaticMarkup(
      <UniversalMaskEditor
        image={image}
        masks={[]}
        findings={props.result.findings}
        recommendations={[]}
        overrides={{}}
        onAddManual={() => {}}
        onUpdateMask={() => {}}
        onDeleteMask={() => {}}
      />,
    );
    expect(html).toContain("Keyboard and precise region controls");
    expect(html).toContain("Add manual region");
  });
  it.each([
    { imageId: "old", revision: 4 },
    { imageId: "sample", revision: 3 },
  ])("never displays a stale preview %j", (stale) => {
    const html = renderToStaticMarkup(
      <FinalImageReview
        imageId="sample"
        revision={4}
        ready
        preview={{ ...stale, url: "blob:stale", width: 1200, height: 850 }}
        onPreview={() => {}}
        onDownload={() => {}}
      />,
    );
    expect(html).not.toContain("blob:stale");
    expect(html).not.toContain("Download reviewed PNG");
  });
  it("keeps a current preview unavailable while decisions are unresolved", () => {
    const html = renderToStaticMarkup(
      <FinalImageReview
        imageId="sample"
        revision={4}
        ready={false}
        preview={{
          imageId: "sample",
          revision: 4,
          url: "blob:blocked",
          width: 1200,
          height: 850,
        }}
        onPreview={() => {}}
        onDownload={() => {}}
      />,
    );
    expect(html).not.toContain("blob:blocked");
    expect(html).toContain("Resolve outstanding decisions");
  });
});
