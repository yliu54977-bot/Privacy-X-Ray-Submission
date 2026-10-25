import { describe, expect, it } from "vitest";
import type { DetectedField, LocalImage, PrivacyRecommendation } from "../types";
import { recommendationDefaults } from "./recommendationDefaults";

const image = { id: "image", width: 100, height: 80 } as LocalImage;
const field: DetectedField = {
  id: "field", imageId: image.id, type: "email", label: "Email",
  value: "fictional@example.com", confidence: 0.9, wordIds: ["one", "two"],
  boxes: [
    { x: -5, y: 10, width: 25, height: 10 },
    { x: 40, y: 10, width: 20, height: 10 },
  ],
};
const suggestion: PrivacyRecommendation = {
  fieldId: field.id, imageId: image.id, action: "MASK",
  explanation: "This address may not be needed.", ruleId: "test-mask",
};

describe("recommendation defaults", () => {
  it("creates one active linked mask per original-image box for MASK", () => {
    const result = recommendationDefaults(image, [field], [suggestion], 3);
    expect(result.decisions.field.action).toBe("MASK");
    expect(result.linkedMasks).toEqual([
      { x: 0, y: 10, width: 20, height: 10, id: "linked:field:3:0",
        imageId: image.id, source: "recommendation", fieldId: field.id, shouldRedact: true },
      { x: 40, y: 10, width: 20, height: 10, id: "linked:field:3:1",
        imageId: image.id, source: "recommendation", fieldId: field.id, shouldRedact: true },
    ]);
  });

  it("leaves KEEP visible and REVIEW unresolved", () => {
    const kept = recommendationDefaults(image, [field], [{ ...suggestion, action: "KEEP" }], 1);
    expect(kept.decisions.field.action).toBe("KEEP");
    expect(kept.linkedMasks).toEqual([]);
    const reviewed = recommendationDefaults(image, [field], [{ ...suggestion, action: "REVIEW" }], 1);
    expect(reviewed.decisions.field).toMatchObject({ action: "REVIEW", reviewReason: "recommendation" });
    expect(reviewed.linkedMasks).toEqual([]);
  });

  it("requires review when a suggestion is absent, duplicated, or cannot be masked", () => {
    expect(recommendationDefaults(image, [field], [], 1).decisions.field.action).toBe("REVIEW");
    expect(recommendationDefaults(image, [field], [suggestion, suggestion], 1).decisions.field.action).toBe("REVIEW");
    const outside = { ...field, boxes: [{ x: 200, y: 10, width: 10, height: 10 }] };
    const result = recommendationDefaults(image, [outside], [suggestion], 1);
    expect(result.decisions.field.action).toBe("REVIEW");
    expect(result.linkedMasks).toEqual([]);
  });
});
