import type {
  DetectedField,
  FieldDecision,
  PrivacyContext,
  PrivacyRecommendation,
  RecommendPrivacy,
  RedactionRect,
} from "../types";
import type { SessionState, SessionAction } from "../types";
import { clipRect } from "./clipRect";
import { recommendationDefaults } from "./recommendationDefaults";
import { recommendPrivacy } from "../features/privacy/recommendPrivacy";
import { initialSharingContext, legacyPreset } from '../v2/integration/temporaryPolicy';
import { toReducerRecommendations, universalPolicyRecommendations } from '../v2/integration/policyAdapter';
export { clipRect } from "./clipRect";
export type { SessionState, SessionAction } from "../types";
export const initialState: SessionState = {
  reviewMode: 'classic',
  image: null,
  context: { recipient: "university", purpose: "tuition_payment_verification" },
  scan: { status: "idle", requestId: null, error: null },
  ocr: null,
  universalResult: null,
  sharingContextV2: initialSharingContext,
  fields: [],
  recommendations: [],
  decisions: {},
  masks: [],
  revision: 0,
  preview: null,
};
function defaults(
  state: SessionState,
  fields: readonly DetectedField[],
  context: PrivacyContext,
  generation: number,
  recommend: RecommendPrivacy,
  selectionOnly: boolean,
): {
  recommendations: readonly PrivacyRecommendation[];
  decisions: Readonly<Record<string, FieldDecision>>;
  linkedMasks: readonly RedactionRect[];
} {
  if (!state.image)
    return { recommendations: [], decisions: {}, linkedMasks: [] };
  if (selectionOnly) return { recommendations: [], linkedMasks: [], decisions: Object.fromEntries(
    fields.map(field => [field.id, { fieldId: field.id, imageId: field.imageId, action: 'KEEP' as const }])) };
  const recommendations = state.reviewMode === 'universal'
    ? state.universalResult && state.sharingContextV2
      ? toReducerRecommendations(state.universalResult,
          universalPolicyRecommendations(state.universalResult, state.sharingContextV2))
      : fields.map(field => ({ fieldId: field.id, imageId: field.imageId,
          action: 'REVIEW' as const, explanation: 'No complete inspection result is available.',
          ruleId: 'privacy-xray/v2/no-result' }))
    : recommend(fields, context);
  return {
    recommendations,
    ...recommendationDefaults(state.image, fields, recommendations, generation),
  };
}
/** A owns transitions. C's pure policy can be supplied without changing shared actions. */
export function createSessionReducer(recommend: RecommendPrivacy, options: { selectionOnly?: boolean } = {}) {
  return (state: SessionState, action: SessionAction) =>
    reduceSession(state, action, recommend, !!options.selectionOnly);
}

function reduceSession(
  state: SessionState,
  action: SessionAction,
  recommend: RecommendPrivacy,
  selectionOnly: boolean,
): SessionState {
  if (selectionOnly && (action.type === 'CHANGE_CONTEXT' || action.type === 'APPLY_UNIVERSAL_CONTEXT')) return state;
  if (action.type === 'SELECT_REVIEW_MODE') {
    if (state.reviewMode === action.mode || state.scan.status === 'running') return state;
    if (!state.image) return { ...state, reviewMode: action.mode };
    return { ...state, reviewMode: action.mode, scan: initialState.scan, ocr: null,
      universalResult: null, fields: [], recommendations: [], decisions: {},
      masks: state.masks.filter(mask => mask.source === 'manual'),
      revision: state.revision + 1, preview: null };
  }
  if (action.type === "IMAGE_LOADED")
    return {
      ...initialState,
      image: action.image,
      context: state.context,
      sharingContextV2: state.sharingContextV2,
      reviewMode: state.reviewMode,
      revision: state.revision + 1,
      preview: null,
    };
  if (action.type === "NEW_IMAGE")
    return { ...initialState, revision: state.revision + 1 };
  if (action.type === 'APPLY_UNIVERSAL_CONTEXT') {
    if (!state.image || state.reviewMode !== 'universal' || action.imageId !== state.image.id)
      return state;
    const preset = legacyPreset(action.context);
    const nextRevision = state.revision + 1;
    const nextState = { ...state, sharingContextV2: action.context };
    const next = defaults(nextState, state.fields, preset ?? state.context, nextRevision, recommend, selectionOnly);
    return { ...nextState, context: preset ?? state.context,
      recommendations: next.recommendations, decisions: next.decisions,
      masks: [...state.masks.filter(mask => mask.source === 'manual'), ...next.linkedMasks],
      revision: nextRevision, preview: null };
  }
  if (action.type === "CHANGE_CONTEXT") {
    const nextRevision = state.revision + 1;
    const next = defaults(
      state, state.fields, action.context, nextRevision, recommend, selectionOnly,
    );
    return {
      ...state,
      context: action.context,
      decisions: next.decisions,
      recommendations: next.recommendations,
      masks: [
        ...state.masks.filter((m) => m.source === "manual"),
        ...next.linkedMasks,
      ],
      revision: nextRevision,
      preview: null,
    };
  }
  if (action.type === "RESET_CHANGES") {
    const nextRevision = state.revision + 1;
    const next = defaults(
      state, state.fields, state.context, nextRevision, recommend, selectionOnly,
    );
    return {
      ...state,
      decisions: next.decisions,
      recommendations: next.recommendations,
      masks: next.linkedMasks,
      revision: nextRevision,
      preview: null,
    };
  }
  if (action.type === "PREVIEW_INVALIDATED")
    return { ...state, preview: null, revision: state.revision + 1 };
  if (action.type === "PREVIEW_COMPLETED") {
    if (
      !state.image ||
      action.imageId !== state.image.id ||
      action.revision !== state.revision ||
      state.scan.status === "running" ||
      Object.values(state.decisions).some((d) => d.action === "REVIEW")
    )
      return state;
    return {
      ...state,
      preview: {
        imageId: action.imageId,
        revision: action.revision,
        blob: action.blob,
      },
    };
  }
  if (!state.image) return state;
  const imageId =
    action.type === "ADD_MANUAL_MASK" ? action.mask.imageId : action.imageId;
  if (imageId !== state.image.id) return state;
  if (action.type === "SCAN_STARTED")
    return {
      ...state,
      preview: null,
      revision: state.revision + 1,
      scan: { status: "running", requestId: action.requestId, error: null },
    };
  if (action.type === "SCAN_COMPLETED" || action.type === "SCAN_FAILED") {
    if (
      state.scan.status !== "running" ||
      state.scan.requestId !== action.requestId
    )
      return state;
    if (action.type === "SCAN_FAILED")
      return {
        ...state,
        scan: { status: "failed", requestId: null, error: action.error },
      };
    if (
      action.ocr.imageId !== imageId ||
      action.fields.some((f) => f.imageId !== imageId) ||
      (action.universalResult && (action.universalResult.source.kind !== 'image' ||
        action.universalResult.source.id !== imageId ||
        action.universalResult.findings.some(f => f.source.kind !== 'image' || f.source.id !== imageId)))
    )
      return state;
    const nextRevision = state.revision + 1;
    const next = defaults({ ...state, universalResult: action.universalResult ?? null },
      action.fields, state.context, nextRevision, recommend, selectionOnly);
    return {
      ...state,
      scan: { status: "complete", requestId: null, error: null },
      ocr: action.ocr,
      universalResult: action.universalResult ?? null,
      fields: action.fields,
      decisions: next.decisions,
      recommendations: next.recommendations,
      masks: [
        ...state.masks.filter((m) => m.source === "manual"),
        ...next.linkedMasks,
      ],
      revision: nextRevision,
      preview: null,
    };
  }
  if (action.type === "ADD_MANUAL_MASK") {
    if (state.masks.some((m) => m.id === action.mask.id)) return state;
    const rect = clipRect(action.mask, state.image.width, state.image.height);
    return rect
      ? {
          ...state,
          masks: [...state.masks, { ...action.mask, ...rect }],
          decisions: invalidateUnlocatedMasks(state),
          revision: state.revision + 1,
          preview: null,
        }
      : state;
  }
  if (action.type === "UPDATE_MASK") {
    const rect = clipRect(action.rect, state.image.width, state.image.height);
    if (!rect || !state.masks.some((m) => m.id === action.maskId)) return state;
    return {
      ...state,
      masks: state.masks.map((m) =>
        m.id === action.maskId ? { ...m, ...rect } : m,
      ),
      decisions: invalidateUnlocatedMasks(state),
      revision: state.revision + 1,
      preview: null,
    };
  }
  if (action.type === "DELETE_MASK") {
    const target = state.masks.find((m) => m.id === action.maskId);
    if (!target) return state;
    if (target.source === "manual")
      return {
        ...state,
        masks: state.masks.filter((m) => m.id !== target.id),
        decisions: invalidateUnlocatedMasks(state),
        revision: state.revision + 1,
        preview: null,
      };
    return {
      ...state,
      masks: state.masks.filter(
        (m) => m.source !== "recommendation" || m.fieldId !== target.fieldId,
      ),
      decisions: {
        ...invalidateUnlocatedMasks(state),
        [target.fieldId]: {
          fieldId: target.fieldId,
          imageId,
          action: "REVIEW",
          reviewReason: "suggested_mask_removed",
        },
      },
      revision: state.revision + 1,
      preview: null,
    };
  }
  if (action.type === "UPDATE_FIELD_DECISION") {
    const field = state.fields.find((f) => f.id === action.fieldId);
    if (!field) return state;
    if (
      action.decision === "MASK" &&
      state.decisions[field.id]?.action === "MASK"
    )
      return state;
    const boxes = field.boxes.map((b) =>
      clipRect(b, state.image!.width, state.image!.height),
    );
    const unlocated = !boxes.length;
    if (action.decision === "MASK" &&
      (boxes.some((b) => !b) || (unlocated &&
        (!action.allowUnlocatedMask || !state.masks.some(m => m.source === 'manual')))))
      return state;
    const others = state.masks.filter(
      (m) => m.source !== "recommendation" || m.fieldId !== field.id,
    );
    const linked: RedactionRect[] =
      action.decision === "MASK"
        ? boxes.map((b, i) => ({
            ...b!,
            id: `linked:${field.id}:${state.revision + 1}:${i}`,
            imageId,
            source: "recommendation",
            fieldId: field.id,
            shouldRedact: true,
          }))
        : [];
    return {
      ...state,
      decisions: {
        ...state.decisions,
        [field.id]: action.decision === 'REVIEW'
          ? { fieldId: field.id, imageId, action: 'REVIEW', reviewReason: 'recommendation' }
          : { fieldId: field.id, imageId, action: action.decision },
      },
      masks: [...others, ...linked],
      revision: state.revision + 1,
      preview: null,
    };
  }
  return state;
}

/** A moved or removed manual mask invalidates every unlocated MASK acknowledgement. */
function invalidateUnlocatedMasks(state: SessionState): SessionState['decisions'] {
  const next = { ...state.decisions };
  for (const field of state.fields) {
    if (field.boxes.length || next[field.id]?.action !== 'MASK') continue;
    next[field.id] = { fieldId: field.id, imageId: field.imageId,
      action: 'REVIEW', reviewReason: 'recommendation' };
  }
  return next;
}

/** Stable application reducer using C's approved pure context policy. */
export const sessionReducer = createSessionReducer(recommendPrivacy);

/** Selection UI: no policy engine is invoked; unchecked content remains visible. */
export const selectionSessionReducer = createSessionReducer(() => [], { selectionOnly: true });
