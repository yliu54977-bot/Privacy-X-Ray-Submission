---
doc: spec
status: implemented_snapshot
---

# Privacy X-Ray — Technical Specification

This specification describes the current implementation. Shared TypeScript definitions in source are authoritative; this document does not redefine or extend them.

## Architecture

A static React + TypeScript + Vite application performs file decoding, OCR, detection, editing and PNG rendering in the browser.

- `src/App.tsx`: default `SimpleApp`, automatic scanning, checkbox selections and local file workflow.
- `src/AdvancedApp.tsx`: preserved Universal/Classic interfaces, loaded by `?review=advanced`.
- `src/features/image/`: validated local image loading and temporary preview URLs.
- `src/features/documents/renderPdfPage.ts`: local PDF-page rasterization.
- `src/features/ocr/`: Tesseract adapter, geometry, orientation/detail passes and OCR text regions.
- `src/v2/detection/`: detection orchestration, OCR-backed candidates, face/QR/barcode inspection and coverage.
- `src/features/editor/` and `src/v2/ui/`: editor and review presentation.
- `src/state/sessionReducer.ts`: authoritative session, decisions, masks and revision transitions.
- `src/features/privacy/`: deterministic recommendation policy used by the advanced review path.
- `src/features/export/`: permanent Canvas redaction, preview lifecycle and download.

There is no application processing backend or user-content database. See [architecture](../docs/architecture.md) for the code map.

## Shared contracts

Import core contracts from [src/types/index.ts](../src/types/index.ts), and additive Universal contracts from [src/v2/contracts.ts](../src/v2/contracts.ts).

| Contract | Meaning and integration rule |
| --- | --- |
| `PixelRect` | `x`, `y`, `width`, `height` measured from the top-left in original decoded-image pixels. |
| `LocalImage` | Stable image `id`, local `File`, temporary `previewUrl`, decoded dimensions and PNG/JPEG MIME type. WebP/PDF input normalizes before entering this contract. |
| `OcrWord` / `OcrResult` | Text, word/line IDs, image identity, original-pixel boxes and recognition confidence normalized to 0–1. Confidence is not a privacy score. |
| `DetectedField` | Existing editor-compatible field, with stable ID, image ID, label/value, word IDs and zero or more real boxes. |
| `RedactionRect` | Pixel geometry plus ID, image ID and `shouldRedact`; `source: 'manual'` has no field link, while `source: 'recommendation'` requires `fieldId`. |
| `PrivacyAction` / `FieldDecision` | KEEP, MASK or unresolved REVIEW, with `reviewReason` when applicable. |
| `UniversalFinding` | Source identity, status, optional type, extensible category IDs, evidence, uncertainty and optional original-image geometry. Missing boxes are not synthesized. |
| `UniversalDetectionResult` | Findings plus explicit inspection coverage and warnings. |
| `PrivacyDetector` / `DetectionInput` | A detector's declared capability and local inputs; pixel access is scoped to detectors that require it. |
| `SharingContextV2` / `RecommendationV2` | Optional advanced-review context and qualified advice, separate from effective user decisions. |
| `SessionState` / `SessionAction` | Reducer-owned image session, scan request, decisions, masks, revision and preview. |
| `RedactImage` | `(image: LocalImage, rectangles: readonly RedactionRect[]) => Promise<Blob>`. |

The legacy `PrivacyFieldType` union remains compatible with Classic review. It does not limit the Universal taxonomy to seven categories. `toEditorFields(result)` adapts Universal findings to the editor without redefining shared types; use the original Universal result for evidence and advanced policy.

## File normalization

`loadImage(file)` validates MIME/content, file size and decoded dimensions. Limits are 20 MB and 16 million image pixels. WebP converts to one still PNG frame.

`renderPdfPage(file, pageNumber)` accepts a readable, unencrypted PDF of at most 200 pages. It renders one page using PDF.js, with a bounded scale targeting at most 3000 pixels on the long side and approximately six million pixels. It returns a local PNG File for the normal image pipeline. Export refers to that rasterized page, not a full or editable PDF.

File contents and derived OCR data remain in the current browser session. The app does not upload or intentionally persist them.

## Recognition pipeline

1. `scanImageV2` runs browser-local English and simplified Chinese OCR.
2. Bounded sparse, rotation and native-detail passes recover some difficult text. Confidence and geometry guide retries.
3. Word boxes map back to original pixels. Ephemeral orientation metadata lets text classifiers use an upright reading layout without changing shared contracts.
4. `detectUniversalPrivacy` runs compatible detectors and collects evidence, candidate findings and inspection coverage.
5. Adjacent OCR words form continuous line-sized selection regions with a small image-bounded margin. Multiline address continuations remain separately editable.
6. Format/label checks cover supported personal and document fields; checksums and date validation establish format plausibility, not authenticity.
7. Local face detection proposes locations without identifying people. QR inspection and one-dimensional barcode-region proposals remain distinct capabilities. Barcode payloads are not decoded.
8. `toEditorFields` supplies editor-compatible findings. Default UI dispatches KEEP for each field after scan completion so every checkbox starts unchecked.

Recognition can be incomplete. Coverage warnings must remain visible, and manual masking must remain available. Detailed supported patterns and limitations are in [material recognition](../docs/material-recognition.md).

## Editor API and coordinate handling

`RedactionEditor` receives the shared `RedactionEditorProps`; [EditorProps](../src/features/editor/contracts.ts) adds optional presentation controls such as selected highlight and decisions.

```ts
onAddManual(imageId: string, rect: PixelRect): void;
onUpdateMask(imageId: string, maskId: string, rect: PixelRect): void;
onDeleteMask(imageId: string, maskId: string): void;
```

The editor receives readonly image, masks and highlights through props. It converts pointer positions from the displayed image into original-image coordinates, clips geometry and sends intent through these callbacks. The parent assigns IDs and dispatches reducer actions. Detection highlights are not export masks. A completed move/resize emits the updated geometry without replacing identity or source metadata.

## Reducer and stale-work protection

- `IMAGE_LOADED` creates a fresh image session; `NEW_IMAGE` clears it.
- `SCAN_STARTED`, `SCAN_COMPLETED` and `SCAN_FAILED` use image and request identities. Stale results cannot overwrite a newer image or scan.
- `ADD_MANUAL_MASK`, `UPDATE_MASK` and `DELETE_MASK` own mask changes. Geometry validation rejects invalid/empty regions and clips valid intersecting rectangles.
- `UPDATE_MASK` changes geometry while retaining ID, image, source and field link.
- `UPDATE_FIELD_DECISION` applies the whole field decision and creates/removes its linked masks. Manual masks remain independent.
- Deleting one linked rectangle removes that field's linked set and records unresolved REVIEW in the reducer. The default UI immediately dispatches KEEP for the deleted field to match checkbox semantics. Advanced review retains the REVIEW warning.
- `CHANGE_CONTEXT` and `APPLY_UNIVERSAL_CONTEXT` belong to the advanced path. They rebuild policy-linked decisions/masks while preserving manual masks and invalidate preview.
- Relevant state changes increment `revision` and clear `preview`.
- `PREVIEW_COMPLETED` is accepted only for the current image and revision, outside a running scan and without unresolved REVIEW decisions.

Neither OCR nor Canvas rendering runs inside the reducer. The reducer does not create or revoke object URLs.

## Permanent PNG rendering and lifecycle

`redactImage(image, rectangles)` validates identities/geometry, decodes the local source and draws it onto a fresh Canvas at the decoded dimensions. It fills active masks with fully opaque black pixels using source-over composition. Outward rounding covers fractional edges; clipping keeps drawing within bounds. It returns a new PNG Blob and leaves the source File unchanged.

`usePngPreview` requests rendering outside the reducer. Only an accepted, current Blob receives a preview object URL. URLs are revoked when replaced, invalidated or unmounted. Late rendering results are discarded. Download uses the accepted PNG Blob; source metadata or removable editor layers are not copied into it.

The default UI additionally requires an active mask and a successfully displayed preview before download. Advanced review preserves its explicit zero-mask confirmation. Neither path may export an obsolete preview after edits.

## Local processing and static assets

Compatible OCR workers, WebAssembly, traineddata, face model/runtime and PDF resources are prepared as same-origin static assets. First use downloads application assets, not a user-content processing request. No cloud AI key is required. Browser asset caching does not imply full offline support or guaranteed secure memory erasure.

Do not add image contents, OCR values or sensitive findings to logs, analytics, public fixtures or CI artifacts. Demonstration fixtures must be fictional; any public model/example asset must retain attribution.

## Verification

The source validation baseline passed **typecheck, 704 unit tests, production build and 64 browser tests**. Coverage includes real local-model OCR, geometry, reducer behavior, responsive workflows and decoded PNG pixels. Those results are regression evidence for the fixtures tested, not a universal accuracy claim.

See [testing](../docs/testing.md) for reproducible commands and [checklist](checklist.md) for remaining submission work.
