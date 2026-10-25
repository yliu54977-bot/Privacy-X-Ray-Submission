import { describe, expect, it } from "vitest";
import { clipRect, createSessionReducer, initialState, sessionReducer } from "./sessionReducer";
import { hasEditingChanges } from "./hasEditingChanges";
import type { SessionState } from "./sessionReducer";
import type {
  DetectedField,
  LocalImage,
  OcrResult,
  RedactionRect,
  RecommendPrivacy,
} from "../types";
import type { SharingContextV2, UniversalDetectionResult } from '../v2/contracts';
const image = { id: "image", width: 1000, height: 800 } as LocalImage;
const manual: RedactionRect = {
  id: "manual",
  imageId: "image",
  source: "manual",
  shouldRedact: true,
  x: 30,
  y: 40,
  width: 50,
  height: 60,
};
const field: DetectedField = {
  id: "field",
  imageId: "image",
  label: "Example email",
  value: "example@example.com",
  type: "email",
  confidence: 0.9,
  wordIds: ["word"],
  boxes: [
    { x: 10, y: 10, width: 30, height: 20 },
    { x: 40, y: 10, width: 30, height: 20 },
  ],
};
const ocr: OcrResult = {
  imageId: "image",
  width: 1000,
  height: 800,
  language: "eng",
  text: "fictional",
  words: [],
};
const base: SessionState = {
  ...initialState,
  image,
  fields: [field],
  masks: [manual],
  decisions: {
    field: {
      fieldId: "field",
      imageId: "image",
      action: "REVIEW",
      reviewReason: "recommendation",
    },
  },
};
describe("A/B session integration", () => {
  it("accepts only a current reviewed preview and rejects stale revisions", () => {
    const reviewed: SessionState = {
      ...base,
      decisions: {
        field: { fieldId: field.id, imageId: image.id, action: "KEEP" },
      },
    };
    const blob = new Blob(["fictional"]);
    const accepted = sessionReducer(reviewed, {
      type: "PREVIEW_COMPLETED",
      imageId: image.id,
      revision: reviewed.revision,
      blob,
    });
    expect(accepted.preview?.blob).toBe(blob);
    expect(
      sessionReducer(reviewed, {
        type: "PREVIEW_COMPLETED",
        imageId: image.id,
        revision: reviewed.revision + 1,
        blob,
      }),
    ).toBe(reviewed);
    expect(
      sessionReducer(base, {
        type: "PREVIEW_COMPLETED",
        imageId: image.id,
        revision: base.revision,
        blob,
      }),
    ).toBe(base);
  });
  it("starting a scan invalidates a previous accepted preview", () => {
    const state: SessionState = {
      ...base,
      preview: {
        imageId: image.id,
        revision: base.revision,
        blob: new Blob(["fictional"]),
      },
    };
    const next = sessionReducer(state, {
      type: "SCAN_STARTED",
      imageId: image.id,
      requestId: "new",
    });
    expect(next.preview).toBeNull();
    expect(next.revision).toBe(state.revision + 1);
  });
  it("clips partly outside rectangles and rejects invalid geometry", () => {
    expect(
      clipRect({ x: -10, y: 20, width: 30, height: 20 }, 100, 100),
    ).toEqual({ x: 0, y: 20, width: 20, height: 20 });
    expect(
      clipRect({ x: 200, y: 20, width: 30, height: 20 }, 100, 100),
    ).toBeNull();
    expect(
      clipRect({ x: 0, y: 0, width: Infinity, height: 20 }, 100, 100),
    ).toBeNull();
  });
  it("rejects stale editor events", () =>
    expect(
      sessionReducer(base, {
        type: "DELETE_MASK",
        imageId: "old",
        maskId: "manual",
      }),
    ).toBe(base));
  it("updates geometry while preserving identity and provenance", () => {
    const next = sessionReducer(base, {
      type: "UPDATE_MASK",
      imageId: "image",
      maskId: "manual",
      rect: { x: 100, y: 200, width: 30, height: 40 },
    });
    expect(next.masks[0]).toEqual({
      ...manual,
      x: 100,
      y: 200,
      width: 30,
      height: 40,
    });
    expect(base.masks[0]).toEqual(manual);
  });
  it("creates and removes all linked boxes without removing manual masks", () => {
    const masked = sessionReducer(base, {
      type: "UPDATE_FIELD_DECISION",
      imageId: "image",
      fieldId: "field",
      decision: "MASK",
    });
    expect(masked.masks).toHaveLength(3);
    const kept = sessionReducer(masked, {
      type: "UPDATE_FIELD_DECISION",
      imageId: "image",
      fieldId: "field",
      decision: "KEEP",
    });
    expect(kept.masks).toEqual([manual]);
    expect(kept.decisions.field.action).toBe("KEEP");
  });
  it("deleting one linked box removes the entire group and sets REVIEW", () => {
    const masked = sessionReducer(base, {
      type: "UPDATE_FIELD_DECISION",
      imageId: "image",
      fieldId: "field",
      decision: "MASK",
    });
    const next = sessionReducer(masked, {
      type: "DELETE_MASK",
      imageId: "image",
      maskId: masked.masks[1].id,
    });
    expect(next.masks).toEqual([manual]);
    expect(next.decisions.field).toMatchObject({
      action: "REVIEW",
      reviewReason: "suggested_mask_removed",
    });
  });
  it("MASK is idempotent and preserves edited boxes", () => {
    const masked = sessionReducer(base, {
      type: "UPDATE_FIELD_DECISION",
      imageId: "image",
      fieldId: "field",
      decision: "MASK",
    });
    expect(
      sessionReducer(masked, {
        type: "UPDATE_FIELD_DECISION",
        imageId: "image",
        fieldId: "field",
        decision: "MASK",
      }),
    ).toBe(masked);
  });
  it("context changes preserve manual masks and invalidate review revision", () => {
    const next = sessionReducer(base, {
      type: "CHANGE_CONTEXT",
      context: {
        recipient: "public_sharing",
        purpose: "sharing_screenshot_publicly",
      },
    });
    expect(next.masks[0]).toBe(manual);
    expect(next.masks.filter((mask) => mask.source === "recommendation")).toHaveLength(2);
    expect(next.revision).toBe(base.revision + 1);
    expect(next.decisions.field.action).toBe("MASK");
  });
  it("rejects stale scan completion and preserves masks on valid completion", () => {
    const running = sessionReducer(base, {
      type: "SCAN_STARTED",
      imageId: "image",
      requestId: "active",
    });
    expect(
      sessionReducer(running, {
        type: "SCAN_COMPLETED",
        imageId: "image",
        requestId: "old",
        ocr,
        fields: [field],
      }),
    ).toBe(running);
    const next = sessionReducer(running, {
      type: "SCAN_COMPLETED",
      imageId: "image",
      requestId: "active",
      ocr,
      fields: [field],
    });
    expect(next.masks).toEqual([manual]);
    expect(next.scan.status).toBe("complete");
  });
  it("reset retains OCR and context; new image clears session", () => {
    const scanned = { ...base, ocr };
    const next = sessionReducer(scanned, { type: "RESET_CHANGES" });
    expect(next.ocr).toBe(ocr);
    expect(next.masks).toEqual([]);
    expect(next.context).toBe(scanned.context);
    expect(sessionReducer(scanned, { type: "NEW_IMAGE" }).image).toBeNull();
  });
});

const mockRecommendations: RecommendPrivacy = (fields, context) =>
  fields.map((detected) => ({
    fieldId: detected.id,
    imageId: detected.imageId,
    action: context.recipient === "university" ? "MASK" :
      context.recipient === "customer_support" ? "KEEP" : "REVIEW",
    explanation: "Fictional policy fixture for reducer integration.",
    ruleId: `${context.recipient}:${detected.type}`,
  }));

describe("A-owned recommendation integration with mock C policy", () => {
  const reduce = createSessionReducer(mockRecommendations);

  it("enables Reset Changes only for edits beyond the current defaults", () => {
    const empty = reduce(initialState, { type: "IMAGE_LOADED", image });
    expect(hasEditingChanges(empty)).toBe(false);
    const defaultMasks = reduce({ ...base, masks: [] }, {
      type: "CHANGE_CONTEXT", context: initialState.context,
    });
    expect(defaultMasks.masks).toHaveLength(2);
    expect(hasEditingChanges(defaultMasks)).toBe(false);
    const moved = reduce(defaultMasks, {
      type: "UPDATE_MASK", imageId: image.id, maskId: defaultMasks.masks[0].id,
      rect: { x: 200, y: 200, width: 30, height: 20 },
    });
    expect(hasEditingChanges(moved)).toBe(true);
    expect(hasEditingChanges(reduce(moved, { type: "RESET_CHANGES" }))).toBe(false);
    expect(hasEditingChanges(reduce(defaultMasks, {
      type: "UPDATE_FIELD_DECISION", imageId: image.id, fieldId: field.id, decision: "KEEP",
    }))).toBe(true);
    expect(hasEditingChanges(reduce(defaultMasks, {
      type: "DELETE_MASK", imageId: image.id, maskId: defaultMasks.masks[0].id,
    }))).toBe(true);
  });

  it("applies current-context defaults after scanning and preserves manual masks on switches", () => {
    const running = reduce(base, { type: "SCAN_STARTED", imageId: image.id, requestId: "scan" });
    const switchedDuringScan = reduce(running, {
      type: "CHANGE_CONTEXT",
      context: { recipient: "customer_support", purpose: "order_or_refund_inquiry" },
    });
    const completed = reduce(switchedDuringScan, {
      type: "SCAN_COMPLETED", imageId: image.id, requestId: "scan", ocr, fields: [field],
    });
    expect(completed.ocr).toBe(ocr);
    expect(completed.masks).toEqual([manual]);
    expect(completed.decisions.field.action).toBe("KEEP");
    expect(completed.recommendations[0].ruleId).toBe("customer_support:email");

    const university = reduce(completed, {
      type: "CHANGE_CONTEXT",
      context: { recipient: "university", purpose: "tuition_payment_verification" },
    });
    expect(university.ocr).toBe(ocr);
    expect(university.masks.filter((mask) => mask.source === "recommendation")).toHaveLength(2);
    expect(university.masks[0]).toBe(manual);
    expect(university.decisions.field.action).toBe("MASK");
    const reviewed = reduce(university, {
      type: "PREVIEW_COMPLETED", imageId: image.id, revision: university.revision,
      blob: new Blob(["fictional"]),
    });
    expect(reviewed.preview).not.toBeNull();

    const publicSharing = reduce(reviewed, {
      type: "CHANGE_CONTEXT",
      context: { recipient: "public_sharing", purpose: "sharing_screenshot_publicly" },
    });
    expect(publicSharing.masks).toEqual([manual]);
    expect(publicSharing.decisions.field).toMatchObject({ action: "REVIEW", reviewReason: "recommendation" });
    expect(publicSharing.preview).toBeNull();
    expect(publicSharing.ocr).toBe(ocr);
  });

  it("restores active defaults after linked deletion and overrides", () => {
    const masked = reduce(base, {
      type: "CHANGE_CONTEXT", context: initialState.context,
    });
    const removed = reduce(masked, {
      type: "DELETE_MASK", imageId: image.id, maskId: masked.masks[1].id,
    });
    expect(removed.masks).toEqual([manual]);
    expect(removed.decisions.field).toMatchObject({ action: "REVIEW", reviewReason: "suggested_mask_removed" });
    expect(reduce(removed, {
      type: "PREVIEW_COMPLETED", imageId: image.id, revision: removed.revision,
      blob: new Blob(["fictional"]),
    })).toBe(removed);
    const reset = reduce(removed, { type: "RESET_CHANGES" });
    expect(reset.masks).toHaveLength(2);
    expect(reset.masks.every((mask) => mask.source === "recommendation")).toBe(true);
    expect(reset.decisions.field.action).toBe("MASK");
    expect(reset.preview).toBeNull();
    const kept = reduce(reset, {
      type: "UPDATE_FIELD_DECISION", imageId: image.id, fieldId: field.id, decision: "KEEP",
    });
    expect(kept.masks).toEqual([]);
    expect(reduce(kept, { type: "RESET_CHANGES" }).masks).toHaveLength(2);
  });
});

describe("approved C policy in the application reducer", () => {
  it("keeps unknown and low-confidence candidates unresolved and blocks preview", () => {
    const unknown: DetectedField = { ...field, id: "unknown", type: "unknown" };
    const low: DetectedField = {
      ...field, id: "low", type: "bank_account_number", confidence: 0.69,
    };
    const loaded = sessionReducer(initialState, { type: "IMAGE_LOADED", image });
    const running = sessionReducer(loaded, {
      type: "SCAN_STARTED", imageId: image.id, requestId: "scan",
    });
    const scanned = sessionReducer(running, {
      type: "SCAN_COMPLETED", imageId: image.id, requestId: "scan", ocr,
      fields: [unknown, low],
    });
    expect(scanned.recommendations.map((item) => item.action)).toEqual(["REVIEW", "REVIEW"]);
    expect(scanned.masks).toEqual([]);
    expect(Object.values(scanned.decisions).every((item) => item.action === "REVIEW")).toBe(true);
    expect(sessionReducer(scanned, {
      type: "PREVIEW_COMPLETED", imageId: image.id, revision: scanned.revision,
      blob: new Blob(["fictional"]),
    })).toBe(scanned);
  });
});

describe('v2 session integration', () => {
  it('switches recognition modes on the same image while retaining only manual masks', () => {
    const previous = { ...base, ocr, scan: { status: 'complete' as const, requestId: null, error: null },
      masks: [manual, { ...manual, id: 'linked', source: 'recommendation' as const, fieldId: field.id }],
      preview: { imageId: image.id, revision: base.revision, blob: new Blob(['fictional']) } };
    const changed = sessionReducer(previous, { type: 'SELECT_REVIEW_MODE', mode: 'universal' });
    expect(changed.image).toBe(image);
    expect(changed.masks).toEqual([manual]);
    expect(changed.ocr).toBeNull();
    expect(changed.fields).toEqual([]);
    expect(changed.decisions).toEqual({});
    expect(changed.preview).toBeNull();
    expect(changed.revision).toBe(previous.revision + 1);
    expect(sessionReducer(changed, { type: 'SCAN_COMPLETED', imageId: image.id,
      requestId: 'stale', ocr, fields: [field] })).toBe(changed);
    const running = { ...previous, scan: { status: 'running' as const, requestId: 'active', error: null } };
    expect(sessionReducer(running, { type: 'SELECT_REVIEW_MODE', mode: 'universal' })).toBe(running);
  });

  const result: UniversalDetectionResult = {
    source: { kind: 'image', id: image.id }, findings: [],
    coverage: { source: { kind: 'image', id: image.id }, areas: [], warnings: ['Inspect manually.'] },
  };
  it('selects v2 before loading and retains its result through context switches', () => {
    const mode = sessionReducer(initialState, { type: 'SELECT_REVIEW_MODE', mode: 'universal' });
    const loaded = sessionReducer(mode, { type: 'IMAGE_LOADED', image });
    expect(loaded.reviewMode).toBe('universal');
    expect(sessionReducer(loaded, { type: 'SELECT_REVIEW_MODE', mode: 'classic' }).reviewMode).toBe('classic');
    const running = sessionReducer(loaded, { type: 'SCAN_STARTED', imageId: image.id, requestId: 'v2' });
    const scanned = sessionReducer(running, { type: 'SCAN_COMPLETED', imageId: image.id,
      requestId: 'v2', ocr, fields: [field], universalResult: result });
    expect(scanned.universalResult).toBe(result);
    const changed = sessionReducer(scanned, { type: 'CHANGE_CONTEXT',
      context: { recipient: 'public_sharing', purpose: 'sharing_screenshot_publicly' } });
    expect(changed.universalResult).toBe(result);
    expect(sessionReducer(changed, { type: 'NEW_IMAGE' }).universalResult).toBeNull();
  });
  it('rejects stale or mismatched v2 detection results', () => {
    const loaded = sessionReducer(initialState, { type: 'IMAGE_LOADED', image });
    const running = sessionReducer(loaded, { type: 'SCAN_STARTED', imageId: image.id, requestId: 'v2' });
    expect(sessionReducer(running, { type: 'SCAN_COMPLETED', imageId: image.id,
      requestId: 'old', ocr, fields: [], universalResult: result })).toBe(running);
    expect(sessionReducer(running, { type: 'SCAN_COMPLETED', imageId: image.id,
      requestId: 'v2', ocr, fields: [], universalResult: {
        ...result, source: { kind: 'image', id: 'another-image' },
      } })).toBe(running);
  });
  it('applies preset and custom contexts without discarding OCR or manual masks', () => {
    const mode = sessionReducer(initialState, { type: 'SELECT_REVIEW_MODE', mode: 'universal' });
    const loaded = sessionReducer(mode, { type: 'IMAGE_LOADED', image });
    const running = sessionReducer(loaded, { type: 'SCAN_STARTED', imageId: image.id, requestId: 'v2' });
    const scanned = sessionReducer(running, { type: 'SCAN_COMPLETED', imageId: image.id,
      requestId: 'v2', ocr, fields: [field], universalResult: result });
    const withManual = sessionReducer(scanned, { type: 'ADD_MANUAL_MASK', mask: manual as Extract<RedactionRect, { source: 'manual' }> });
    const publicContext: SharingContextV2 = { id: 'public-1', presetId: 'public_sharing',
      recipient: { name: 'Public audience' }, purpose: 'Share a screenshot publicly',
      audience: 'public', informationOwner: 'self', requirements: [] };
    const publicState = sessionReducer(withManual, { type: 'APPLY_UNIVERSAL_CONTEXT',
      imageId: image.id, context: publicContext });
    expect(publicState.context.recipient).toBe('public_sharing');
    expect(publicState.ocr).toBe(ocr);
    expect(publicState.masks[0]).toBe(withManual.masks[0]);
    // No matching universal finding/evidence exists, so the real policy cannot authorize a mask default.
    expect(publicState.decisions.field.action).toBe('REVIEW');
    const custom: SharingContextV2 = { ...publicContext, id: 'custom-1', presetId: undefined,
      recipient: { name: 'Fictional recipient' }, requirements: [{ id: 'need',
        description: 'An unverified need', typeId: 'email', importance: 'needed', confirmedByUser: false }] };
    const customState = sessionReducer(publicState, { type: 'APPLY_UNIVERSAL_CONTEXT',
      imageId: image.id, context: custom });
    expect(customState.sharingContextV2).toBe(custom);
    expect(customState.recommendations).toEqual([]);
    expect(customState.decisions.field.action).toBe('REVIEW');
    expect(customState.masks).toEqual([manual]);
    expect(sessionReducer(customState, { type: 'APPLY_UNIVERSAL_CONTEXT',
      imageId: 'stale', context: publicContext })).toBe(customState);
  });
  it('requires explicit manual location for an unboxed MASK and resets it after mask edits', () => {
    const unlocated: DetectedField = { ...field, id: 'unlocated', type: 'unknown', boxes: [] };
    const current: SessionState = { ...base, fields: [unlocated], decisions: {
      unlocated: { fieldId: 'unlocated', imageId: image.id, action: 'REVIEW', reviewReason: 'recommendation' },
    } };
    const requested = { type: 'UPDATE_FIELD_DECISION' as const, imageId: image.id,
      fieldId: unlocated.id, decision: 'MASK' as const };
    expect(sessionReducer(current, requested)).toBe(current);
    const accepted = sessionReducer(current, { ...requested, allowUnlocatedMask: true });
    expect(accepted.decisions.unlocated.action).toBe('MASK');
    expect(accepted.masks).toEqual([manual]);
    const moved = sessionReducer(accepted, { type: 'UPDATE_MASK', imageId: image.id,
      maskId: manual.id, rect: { ...manual, x: 60 } });
    expect(moved.decisions.unlocated.action).toBe('REVIEW');
    expect(moved.preview).toBeNull();
    expect(sessionReducer(moved, { type: 'PREVIEW_COMPLETED', imageId: image.id,
      revision: moved.revision, blob: new Blob(['fictional']) })).toBe(moved);
    const withoutManual = { ...current, masks: [] };
    expect(sessionReducer(withoutManual, { ...requested, allowUnlocatedMask: true })).toBe(withoutManual);
  });
});
