import type { RedactionRect, SessionState } from "../types";
import { recommendationDefaults } from "./recommendationDefaults";

function linkedGeometry(mask: RedactionRect): string {
  return mask.source === "recommendation"
    ? `${mask.fieldId}:${mask.x}:${mask.y}:${mask.width}:${mask.height}:${mask.shouldRedact}`
    : "";
}

/** Compare edits with this context's defaults; OCR results alone are not unsaved edits. */
export function hasEditingChanges(state: SessionState): boolean {
  if (!state.image) return false;
  if (state.masks.some((mask) => mask.source === "manual")) return true;

  const expected = recommendationDefaults(
    state.image, state.fields, state.recommendations, state.revision,
  );
  if (Object.keys(state.decisions).length !== Object.keys(expected.decisions).length)
    return true;
  for (const [fieldId, original] of Object.entries(expected.decisions)) {
    const actual = state.decisions[fieldId];
    if (!actual || actual.action !== original.action ||
      (actual.action === "REVIEW" &&
        actual.reviewReason !== (original.action === "REVIEW" ? original.reviewReason : undefined)))
      return true;
  }

  const currentMasks = state.masks
    .filter((mask) => mask.source === "recommendation")
    .map(linkedGeometry).sort();
  const defaultMasks = expected.linkedMasks.map(linkedGeometry).sort();
  return JSON.stringify(currentMasks) !== JSON.stringify(defaultMasks);
}
