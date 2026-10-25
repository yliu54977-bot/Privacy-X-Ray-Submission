import type { LocalImage } from "../../types";
import type {
  RecommendationV2,
  UniversalDetectionResult,
  UniversalFinding,
} from "../contracts";
import { privacyKnowledgeBase } from "../privacyKnowledgeBase";

/** UI fixtures only. These objects are not OCR output or C's recommendation policy. */
export function mockReview(
  image: LocalImage,
  large = false,
  kind: "tuition" | "order" = "tuition",
): { result: UniversalDetectionResult; recommendations: RecommendationV2[] } {
  const source = { kind: "image" as const, id: image.id };
  const fields =
    kind === "tuition"
      ? [
          {
            id: "bank",
            type: "bank_account_number",
            label: "Bank account number",
            value: "000011112222",
            box: { x: 400, y: 250, width: 285, height: 40 },
            action: "MASK" as const,
          },
          {
            id: "amount",
            type: "payment_amount",
            label: "Payment amount",
            value: "$1250.00",
            box: { x: 300, y: 330, width: 180, height: 40 },
            action: "KEEP" as const,
          },
          {
            id: "email",
            type: "email",
            label: "Email address",
            value: "student@example.com",
            box: { x: 160, y: 410, width: 370, height: 40 },
            action: "REVIEW" as const,
          },
        ]
      : [
          {
            id: "order",
            type: "order_number",
            label: "Order number",
            value: "DEMO987654",
            box: { x: 260, y: 170, width: 260, height: 40 },
            action: "KEEP" as const,
          },
          {
            id: "email",
            type: "email",
            label: "Email address",
            value: "customer@example.com",
            box: { x: 160, y: 250, width: 400, height: 40 },
            action: "REVIEW" as const,
          },
        ];
  const findings: UniversalFinding[] = fields.map((f) => ({
    id: f.id,
    source,
    status: f.id === "email" ? "UNCERTAIN" : "KNOWN",
    typeId: f.type,
    categoryIds: privacyKnowledgeBase.type(f.type)!.categoryIds,
    label: f.label,
    value: f.value,
    boxes: [f.box],
    ocrRecognitionConfidence: f.id === "email" ? 0.6 : 0.95,
    entityClassificationConfidence: 0.9,
    uncertaintyReason:
      f.id === "email"
        ? "Example uncertainty: check the recognized address against the original."
        : undefined,
    evidence: [
      {
        id: `e-${f.id}`,
        detectorId: "ui-fixture",
        method: "label_context",
        source: "ocr",
        explanation:
          "Simulated nearby-label evidence for this UI demonstration.",
      },
    ],
  }));
  findings.push({
    id: "unknown",
    source,
    status: "UNKNOWN_POTENTIALLY_SENSITIVE",
    categoryIds: [],
    label: "Unclassified confidential reference",
    value: "FICTIONAL-REFERENCE",
    uncertaintyReason:
      "Illustrative unlocated finding, not a detected item in this sample image.",
    evidence: [
      {
        id: "unknown-e",
        detectorId: "ui-fixture",
        method: "label_context",
        source: "derived",
        explanation:
          "Simulated confidential-label evidence without a dependable classification or image location.",
      },
    ],
  });
  if (large)
    for (let i = findings.length; i < 240; i++) {
      const type =
        privacyKnowledgeBase.types[i % privacyKnowledgeBase.types.length];
      findings.push({
        id: `large-${i}`,
        source,
        status: i % 4 === 0 ? "UNCERTAIN" : "KNOWN",
        typeId: type.id,
        categoryIds: type.categoryIds,
        label: `${type.name} · mock ${i + 1}`,
        value: `FICTIONAL-VALUE-${i + 1}`,
        evidence: [],
        uncertaintyReason:
          "Volume-test fixture. No image location or verified detector claim.",
      });
    }
  return {
    result: {
      source,
      findings,
      coverage: {
        source,
        areas: [
          {
            family: "label_context",
            status: "partial",
            explanation:
              "Mock text findings only; real OCR is not running in this UI demo.",
          },
          {
            family: "visual_object",
            status: "uninspected",
            explanation:
              "Faces, backgrounds and QR codes have not been inspected.",
          },
          {
            family: "metadata",
            status: "uninspected",
            explanation: "Source file metadata has not been inspected.",
          },
          {
            family: "relationship",
            status: "uninspected",
            explanation:
              "Combined and inferred relationships have not been inspected.",
          },
        ],
        warnings: [
          "Simulated findings and recommendations. This demo does not scan your image.",
          "Taxonomy definitions do not mean that a working detector exists for every category.",
        ],
      },
    },
    recommendations: findings.map((f) => ({
      findingId: f.id,
      source,
      action: fields.find((field) => field.id === f.id)?.action ?? "REVIEW",
      explanation:
        "Illustrative recommendation only. Choose what this particular recipient actually needs.",
      sensitivityReason: f.typeId
        ? (privacyKnowledgeBase
            .type(f.typeId)
            ?.disclosureConsequences.join(" ") ?? "Check sensitivity.")
        : "The confidential reference may contain sensitive information despite an unknown category.",
      sharingNeedReason:
        "Recipient requirements are not established by this mock. Check them yourself.",
      reliability: "requires_review",
      rule: { source: "UI fixture — not the policy engine", version: "demo-1" },
    })),
  };
}
