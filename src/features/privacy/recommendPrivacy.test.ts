import { describe, expect, it } from "vitest";
import type { DetectedField, PixelRect, PrivacyAction, PrivacyContext, PrivacyFieldType } from "../../types";
import { recommendPrivacy } from "./recommendPrivacy";

const types: Exclude<PrivacyFieldType, "unknown">[] = [
  "bank_account_number", "student_id", "payment_amount", "order_number", "email", "home_address", "phone",
];
const contexts: PrivacyContext[] = [
  { recipient: "university", purpose: "tuition_payment_verification" },
  { recipient: "customer_support", purpose: "order_or_refund_inquiry" },
  { recipient: "public_sharing", purpose: "sharing_screenshot_publicly" },
];
// Independent expected matrix: order is types above; no production rule table imported.
const expected: PrivacyAction[][] = [
  ["MASK", "REVIEW", "KEEP", "REVIEW", "REVIEW", "MASK", "MASK"],
  ["MASK", "MASK", "KEEP", "KEEP", "REVIEW", "MASK", "REVIEW"],
  ["MASK", "MASK", "MASK", "MASK", "MASK", "MASK", "MASK"],
];
function field(type: PrivacyFieldType = "order_number", changes: Partial<DetectedField> = {}): DetectedField {
  return { id: `field-${type}`, imageId: "fictional-image", type, label: "Fictional field",
    value: "DEMO987654", wordIds: ["word-1"], boxes: [{ x: 10, y: 20, width: 30, height: 40 }],
    confidence: 0.9, ...changes };
}

for (const [i, context] of contexts.entries()) {
  describe(context.recipient, () => {
    for (const [j, type] of types.entries()) {
      it(`${type} recommends ${expected[i][j]} with a qualified reason`, () => {
        const input = field(type);
        expect(recommendPrivacy([input], context)).toEqual([{
          fieldId: input.id, imageId: input.imageId, action: expected[i][j],
          explanation: expect.stringMatching(/\bmay\b/), ruleId: `${context.recipient}:${type}`,
        }]);
        const explanation = recommendPrivacy([input], context)[0].explanation;
        expect(explanation.length).toBeLessThan(180);
        expect(explanation).not.toMatch(/\b(must|required|official|guaranteed|safe|compliant)\b/i);
        expect(explanation).not.toContain(input.value);
      });
    }
    it("unknown categories require REVIEW even with perfect OCR confidence", () => {
      expect(recommendPrivacy([field("unknown", { confidence: 1 })], context)[0]).toMatchObject({
        action: "REVIEW", ruleId: "review:unknown-field",
      });
    });
    it("known but low-confidence text requires REVIEW instead of its default", () => {
      for (const type of types) expect(recommendPrivacy([field(type, { confidence: 0.69 })], context)[0].action).toBe("REVIEW");
    });
    it("empty input returns an empty result", () => expect(recommendPrivacy([], context)).toEqual([]));
  });
}

it("the same order number changes KEEP to MASK without altering detections", () => {
  const input = [field()];
  expect(recommendPrivacy(input, contexts[1])[0].action).toBe("KEEP");
  expect(recommendPrivacy(input, contexts[2])[0].action).toBe("MASK");
  expect(input[0]).toEqual(field());
});
it("is deterministic, follows input order, and produces fresh result objects", () => {
  const inputs = [field("email"), field("order_number")];
  const first = recommendPrivacy(inputs, contexts[1]);
  recommendPrivacy([field("phone")], contexts[0]);
  const second = recommendPrivacy(inputs, contexts[1]);
  expect(first).toEqual(second);
  expect(first).not.toBe(second);
  expect(first[0]).not.toBe(second[0]);
  expect(first.map((r) => r.fieldId)).toEqual(inputs.map((f) => f.id));
});
it("accepts deeply frozen inputs without mutation", () => {
  const f = field(); Object.freeze(f.boxes[0]); Object.freeze(f.boxes); Object.freeze(f.wordIds); Object.freeze(f);
  const inputs = Object.freeze([f]); const context = Object.freeze({ ...contexts[1] });
  const before = JSON.stringify({ inputs, context });
  recommendPrivacy(inputs, context);
  expect(JSON.stringify({ inputs, context })).toBe(before);
});
it.each([0.7, 1])("accepts OCR confidence boundary %s without claiming classification certainty", (confidence) => {
  expect(recommendPrivacy([field("order_number", { confidence })], contexts[1])[0].action).toBe("KEEP");
});
it.each([0, -1, 0.699999, 1.000001, NaN, Infinity, -Infinity, undefined, null, "0.9"])("invalid or unreadable confidence %s requires REVIEW", (confidence) => {
  expect(recommendPrivacy([field("order_number", { confidence: confidence as number })], contexts[1])[0].action).toBe("REVIEW");
});
it.each(["future_field", "__proto__", "constructor", "toString", "", null, 123])("unsupported field type %s requires REVIEW", (type) => {
  expect(recommendPrivacy([field(type as PrivacyFieldType)], contexts[1])[0].action).toBe("REVIEW");
});
it.each([
  null, undefined, {}, { recipient: "university", purpose: "order_or_refund_inquiry" },
  { recipient: "other", purpose: "other" }, { recipient: "__proto__" }, { recipient: "constructor" },
])("unsupported/malformed context %j requires REVIEW", (context) => {
  expect(recommendPrivacy([field()], context as PrivacyContext)[0]).toMatchObject({ action: "REVIEW", ruleId: "review:unsupported-context" });
});
it.each([
  { value: "" }, { value: "  " }, { value: null }, { label: "" },
  { wordIds: [] }, { wordIds: [""] }, { wordIds: null }, { boxes: [] }, { boxes: null },
  { boxes: [null] }, { boxes: [{ x: NaN, y: 1, width: 2, height: 2 }] },
  { boxes: [{ x: 1, y: 1, width: 0, height: 2 }] },
  { boxes: [{ x: Number.MAX_VALUE, y: 1, width: Number.MAX_VALUE, height: 2 }] },
])("incomplete candidate evidence %j requires REVIEW", (changes) => {
  expect(recommendPrivacy([field("order_number", changes as Partial<DetectedField>)], contexts[1])[0].action).toBe("REVIEW");
});
it("allows negative edge coordinates for A's clipping rather than mutating geometry", () => {
  const box: PixelRect = { x: -1, y: -2, width: 5, height: 5 };
  const input = field("order_number", { boxes: [box] });
  expect(recommendPrivacy([input], contexts[1])[0].action).toBe("KEEP");
  expect(input.boxes[0]).toBe(box);
});
it.each([null, undefined, {}, "fields"])("rejects a non-array field collection %s", (fields) => {
  expect(() => recommendPrivacy(fields as unknown as DetectedField[], contexts[1])).toThrow(TypeError);
});
it.each([null, undefined, {}, { id: "", imageId: "image" }, { id: " ", imageId: "image" },
  { id: "field", imageId: "" }, { id: 1, imageId: "image" }])("rejects unaddressable field identities %j", (input) => {
  expect(() => recommendPrivacy([input as DetectedField], contexts[1])).toThrow(TypeError);
});
it("rejects duplicate IDs before returning any partial result", () => {
  expect(() => recommendPrivacy([field(), field()], contexts[1])).toThrow(/unique IDs/);
});
it("rejects mixed-image input before returning any partial result", () => {
  expect(() => recommendPrivacy([field(), field("email", { imageId: "another" })], contexts[1])).toThrow(/one image/);
});
it("treats semantic ambiguity encoded by A as unknown independently of OCR confidence", () => {
  expect(recommendPrivacy([field("unknown", { confidence: 0.99 })], contexts[1])[0].action).toBe("REVIEW");
});
