# Architecture

## Data flow

`App.tsx` loads a local file through `loadImage`; selected PDF pages are first rasterized by `renderPdfPage`. The decoded image has a session identity, an in-memory preview URL and original dimensions. `scanImageV2` runs Tesseract locally. `detectUniversalPrivacy` combines evidence-backed text patterns, card/address layouts, QR decoding, barcode-region proposals and face-location proposals. `toEditorFields` adapts findings to the existing reducer/editor contracts without inventing missing locations.

The default UI starts every finding unchecked. Checking it creates field-linked masks through `sessionReducer`; unchecking it removes those masks. Manual masks are independent. The reducer owns authoritative geometry and versioned preview state. The editor reports image-scoped add/update/delete events; drag state is temporary UI state.

`redactImage` draws the original image into Canvas at its original dimensions and paints selected rectangles fully opaque. `usePngPreview` publishes only a current result. Edits or replacement invalidate stale previews; accepted object URLs are revoked when replaced. The download is a new PNG, not an editable document with hidden layers.

## Coordinates and evidence

All saved rectangles use original decoded-image pixels, not CSS coordinates. The editor maps pointer positions using the image's displayed size. OCR orientation metadata is kept in memory: OCR-only classifiers use a consistent reading orientation, then locations return to original pixels. Visual detectors operate directly on source pixels. Missing boxes require manual review; they are never fabricated.

Shared contracts are in [`src/types/index.ts`](../src/types/index.ts) and [`src/v2/contracts.ts`](../src/v2/contracts.ts). `LocalImage`, `OcrResult`, `PixelRect`, `RedactionRect`, `UniversalFinding` and `UniversalDetectionResult` remain the integration boundaries. Findings and evidence are scoped to a source identity. Taxonomy membership does not imply a working detector or confirmed sensitivity.

## Two review interfaces

The default interface asks only which information to hide. It uses existing MASK/KEEP reducer decisions as selection mechanics, not safety recommendations. Deleting a linked mask clears that selection.

`?review=advanced` retains Universal/Classic context configuration, explainable policy suggestions, overrides and comparison controls. In that interface deleting a recommendation-linked mask produces unresolved REVIEW until the user decides. The policy engine is separate from UI and cannot authenticate recipients or interpret arbitrary free text as AI reasoning. The default workflow does not invoke these context requirements.

## Local processing and bounded resources

No user content is uploaded, persisted in a database or sent to an analytics endpoint. Workers, language data, WASM runtimes, PDF resources and the face model are served from the application's origin. OCR, image inspection and export run in the browser. Image sessions and temporary canvases are released when no longer used.

Input, rasterization, OCR-pass, pixel-read and visual-search budgets limit resource use. Cancellation/image identity checks prevent old scan results from being applied to a replacement image. Exhausted or unsupported inspection is not a safety conclusion. Detection limitations and manual masks remain part of the workflow.

The UI, reducer, policy engine and permanent exporter retain their separate responsibilities. [Material recognition](material-recognition.md) describes supported candidate patterns and limits; [testing](testing.md) describes the acceptance suite.
