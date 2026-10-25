---
doc: prd
status: implemented_snapshot
---

# Privacy X-Ray — Product Requirements

The shipped default helps a person answer one question: **“What would you like to hide?”**

This document describes current behavior. The [scope](scope.md) defines boundaries; the [technical specification](spec.md) identifies the implementation contracts.

## Core journey

1. Open the site and select or drop one local image or PDF. No account, recipient or purpose is required.
2. View the image while recognition starts automatically. For a PDF, inspect one selected page.
3. Review the list of possible sensitive items. All start unchecked and visible.
4. Check an item to cover its located regions. Use **Show** to locate it, or **Select all** and **Clear selection** to change detected selections.
5. Draw a mask for a missed detail. Select a mask to move, resize or delete it.
6. Choose **Preview covered image** after selecting or drawing at least one mask.
7. Inspect the generated PNG and choose **Download PNG**. Any later edit requires a fresh preview.

## Interface

The English interface uses the existing Privacy X-Ray visual identity: a light background, dark readable text, blue/purple accents and clearly separated image and selection panels. Panels sit side by side on larger screens and stack on narrow screens.

The page presents three steps: **Your image**, **What would you like to hide?**, and **Preview and download**. It includes local-processing language and a reminder to inspect the entire image.

## Required behavior

### Open a local file

- Accept PNG, JPEG, WebP and PDF, up to 20 MB.
- Accept decoded images up to 16 million pixels.
- Convert WebP to one still PNG frame.
- Render one selected PDF page locally; the source PDF and other pages are not included in the export.
- Reject invalid or unsupported inputs with a readable error.
- Replacing an image with active masks asks before discarding them. Successful replacement clears old findings, selections and preview state.

### Recognize and review

- Start OCR and detection automatically after a file opens.
- Show progress and stage text while processing. Model loading can make the first scan slower.
- Show plausible detected items, readable labels and available values; show an image-region description for visual candidates.
- Treat detection as assistance, not proof of sensitivity or completeness.
- Do not create a mask until the user checks the item or draws one.
- Selecting a checkbox covers all located regions belonging to that finding; clearing it removes its linked masks.
- Provide search when the list is larger and paginate results in groups of 20.
- Never invent missing image coordinates. An unlocated finding directs the user to draw a mask.
- Offer unclassified OCR text for review and keep coverage warnings available even when no sensitive items are found.
- **Scan again** resets detected selections after confirmation when needed; independent manual masks are preserved.

### Edit masks

- Support multiple rectangles, pointer/touch drawing, movement, corner resizing and deletion.
- Keep all geometry in original decoded-image pixels, independent of preview display size.
- Show clear selection outlines and handles.
- Keep manual masks independent from finding-linked masks.
- In the default checkbox flow, deleting a linked mask clears that finding's selection and removes its linked set. It becomes visible.
- Use semantic labels and focusable controls. Preserve keyboard selection and navigation in the advanced review interface; do not claim that every pointer geometry operation has a keyboard equivalent.

### Preview and export

- Generate a real PNG with opaque black pixels over selected rectangles.
- Match the decoded image dimensions; for PDF/WebP this means the normalized image produced by local conversion.
- Require at least one active mask in the default flow.
- Require a current preview and wait for it to display before enabling download.
- Invalidate the old preview when masks, findings, image or relevant session state change.
- Export the rendered PNG, not an SVG/CSS overlay or editable redaction layer.
- Leave the original local file unchanged.
- Report rendering or download errors without claiming a successful result.

## Optional advanced review path

Opening `?review=advanced` preserves Universal and Classic review.

Universal review supports category grouping/filtering, evidence and uncertainty, structured sharing context, policy explanations, user overrides, detection coverage and before/after comparison using the generated PNG. Classic review preserves the three original contexts and their seven initial text-field types.

These interfaces use KEEP/MASK/REVIEW. KEEP means a decision to leave content visible; it does not certify safety. Free-text recipient or purpose descriptions are not presented as AI-understood requirements. Unresolved REVIEW decisions block preview/export. Deleting a recommendation-linked mask creates a REVIEW warning until resolved. Context changes invalidate preview and retain independent manual masks.

The advanced zero-mask export confirmation is separate from the default flow, where a mask is required.

## Failure and incomplete-inspection states

- **No findings:** explain that manual masking remains available; never label the image safe.
- **OCR failure:** show an error and allow manual editing after processing stops.
- **Partial or unsupported inspection:** show limitations rather than a fabricated confidence score.
- **Large or complex material:** bounded OCR/visual passes can miss details; no claim of inspecting every pixel or object.
- **New image during work:** reject stale scan and preview results from the previous image.
- **Temporary session:** users must download their result; the app does not save an account history or editing database.

## Acceptance evidence

Automated checks cover file handling, detector rules, original-coordinate geometry, reducer transitions, mask editing, real OCR examples, responsive layouts, stale preview invalidation and decoded PNG pixels. The documented validation baseline is **704 unit tests and 64 browser tests**, with typecheck and production build passing.

Tests use fictional generated documents and an attributed public face fixture. Passing those cases does not establish accuracy on every real-world material. See [testing](../docs/testing.md) and the [submission checklist](checklist.md).
