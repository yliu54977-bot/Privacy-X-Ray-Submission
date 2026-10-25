import type {
  DetectedField,
  FieldDecision,
  LocalImage,
  PrivacyRecommendation,
  RedactionRect,
} from "../types";
import { clipRect } from "./clipRect";

/** Turn C's pure suggestions into A-owned decisions and active linked masks. */
export function recommendationDefaults(
  image: LocalImage,
  fields: readonly DetectedField[],
  recommendations: readonly PrivacyRecommendation[],
  generation: number,
): {
  decisions: Readonly<Record<string, FieldDecision>>;
  linkedMasks: readonly RedactionRect[];
} {
  const decisions: Record<string, FieldDecision> = {};
  const linkedMasks: RedactionRect[] = [];

  for (const field of fields) {
    if (field.imageId !== image.id) continue;
    const matches = recommendations.filter(
      (item) => item.fieldId === field.id && item.imageId === image.id,
    );
    const suggested = matches.length === 1 ? matches[0] : undefined;
    const boxes = field.boxes.map((box) =>
      clipRect(box, image.width, image.height),
    );
    const maskable = boxes.length > 0 && boxes.every((box) => box !== null);
    const action = suggested?.action === "MASK" && !maskable
      ? "REVIEW"
      : (suggested?.action ?? "REVIEW");

    decisions[field.id] = action === "REVIEW"
      ? { fieldId: field.id, imageId: image.id, action, reviewReason: "recommendation" }
      : { fieldId: field.id, imageId: image.id, action };

    if (action === "MASK") {
      boxes.forEach((box, index) => {
        linkedMasks.push({
          ...box!,
          id: `linked:${field.id}:${generation}:${index}`,
          imageId: image.id,
          source: "recommendation",
          fieldId: field.id,
          shouldRedact: true,
        });
      });
    }
  }

  return { decisions, linkedMasks };
}
