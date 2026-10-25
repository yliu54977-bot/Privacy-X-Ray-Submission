import type {
  DetectedField,
  PrivacyAction,
  PrivacyContext,
  PrivacyFieldType,
  PrivacyRecommendation,
  RecommendPrivacy,
} from "../../types";

type Rule = readonly [PrivacyAction, string];
const rules: Record<
  PrivacyContext["recipient"],
  Record<Exclude<PrivacyFieldType, "unknown">, Rule>
> = {
  university: {
    bank_account_number: [
      "MASK",
      "Your full bank account number may not be needed to verify tuition payment.",
    ],
    student_id: [
      "REVIEW",
      "Your student ID may help match the payment, but requirements vary; decide whether to include it.",
    ],
    payment_amount: [
      "KEEP",
      "The amount may help the university identify your tuition payment.",
    ],
    order_number: [
      "REVIEW",
      "An order number may be unrelated to tuition verification; decide whether it is relevant.",
    ],
    email: [
      "REVIEW",
      "Your email may help identify you, but may not be needed for this payment; decide whether to include it.",
    ],
    home_address: [
      "MASK",
      "Your home address may be unrelated to tuition payment verification.",
    ],
    phone: [
      "MASK",
      "Your phone number may not be needed to verify this payment.",
    ],
  },
  customer_support: {
    bank_account_number: [
      "MASK",
      "Your full bank account number may not be needed to identify an order or refund.",
    ],
    student_id: [
      "MASK",
      "Your student ID may be unrelated to this order or refund inquiry.",
    ],
    payment_amount: [
      "KEEP",
      "The amount may help support identify the charge or requested refund.",
    ],
    order_number: [
      "KEEP",
      "The order number may help support locate your order or refund.",
    ],
    email: [
      "REVIEW",
      "Your email may help match the account, but requirements vary; decide whether to include it.",
    ],
    home_address: [
      "MASK",
      "Your home address may not be necessary to identify the order or refund.",
    ],
    phone: [
      "REVIEW",
      "Your phone number may help match an order, but may not be needed; decide whether to include it.",
    ],
  },
  public_sharing: {
    bank_account_number: [
      "MASK",
      "A public audience may not need your full bank account number.",
    ],
    student_id: [
      "MASK",
      "A public audience may not need your student identifier.",
    ],
    payment_amount: [
      "MASK",
      "Your payment amount may be unnecessary for public sharing.",
    ],
    order_number: [
      "MASK",
      "A public audience may not need an identifier that links to your order.",
    ],
    email: ["MASK", "Public sharing may expose your personal contact address."],
    home_address: ["MASK", "A public audience may not need your home address."],
    phone: [
      "MASK",
      "A public audience may not need your personal phone number.",
    ],
  },
};
const purposes: Record<PrivacyContext["recipient"], PrivacyContext["purpose"]> =
  {
    university: "tuition_payment_verification",
    customer_support: "order_or_refund_inquiry",
    public_sharing: "sharing_screenshot_publicly",
  };
/** OCR readability floor only: passing it does not establish classification or privacy correctness. */
const MIN_OCR_CONFIDENCE = 0.7;

function supportedContext(context: PrivacyContext): boolean {
  return !!context && typeof context === "object" &&
    Object.hasOwn(purposes, context.recipient) &&
    purposes[context.recipient] === context.purpose;
}

/** Uses only approved fields. Geometry is checked for usable evidence, never modified or drawn. */
function uncertainCandidate(field: DetectedField): boolean {
  return !Number.isFinite(field.confidence) || field.confidence < MIN_OCR_CONFIDENCE ||
    field.confidence > 1 || typeof field.value !== "string" || !field.value.trim() ||
    typeof field.label !== "string" || !field.label.trim() ||
    !Array.isArray(field.wordIds) || !field.wordIds.length ||
    field.wordIds.some((id) => typeof id !== "string" || !id.trim()) ||
    !Array.isArray(field.boxes) || !field.boxes.length || field.boxes.some((box) =>
      !box || ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite) ||
      box.width <= 0 || box.height <= 0);
}

/**
 * Pure guidance using the approved RecommendPrivacy contract; no React, network or storage.
 * Unknown categories, unreadable/incomplete evidence and unsupported contexts require REVIEW.
 * A must encode semantic ambiguity as type:'unknown'; OCR confidence cannot express it.
 * Identity errors throw before returning any partial recommendations, so reducer keys stay safe.
 * Every suggestion remains overridable and the user must inspect the final image.
 */
export const recommendPrivacy: RecommendPrivacy = (fields, context) => {
  if (!Array.isArray(fields)) throw new TypeError("Detected fields must be an array.");
  const ids = new Set<string>();
  let imageId: string | undefined;
  for (const field of fields) {
    if (!field || typeof field !== "object" ||
        typeof field.id !== "string" || !field.id.trim() ||
        typeof field.imageId !== "string" || !field.imageId.trim() ||
        ids.has(field.id) || (imageId !== undefined && imageId !== field.imageId)) {
      throw new TypeError("Detected fields must have unique IDs from one image.");
    }
    ids.add(field.id);
    imageId = field.imageId;
  }
  const validContext = supportedContext(context);
  return fields.map((field): PrivacyRecommendation => {
    let rule: Rule;
    let ruleId: string;
    if (!validContext) {
      rule = ["REVIEW", "This sharing context may not be supported. Choose whether to keep or mask this field."];
      ruleId = "review:unsupported-context";
    } else if (typeof field.type !== "string" || !Object.hasOwn(rules[context.recipient], field.type)) {
      rule = ["REVIEW", "This information category may be uncertain. Check the original image and choose KEEP or MASK."];
      ruleId = "review:unknown-field";
    } else if (uncertainCandidate(field)) {
      rule = ["REVIEW", "The recognized text or its location may be incomplete or unreliable. Check the original image before choosing KEEP or MASK."];
      ruleId = "review:uncertain-candidate";
    } else {
      rule = rules[context.recipient][field.type as Exclude<PrivacyFieldType, "unknown">];
      ruleId = `${context.recipient}:${field.type}`;
    }
    return { fieldId: field.id, imageId: field.imageId, action: rule[0], explanation: rule[1], ruleId };
  });
};
