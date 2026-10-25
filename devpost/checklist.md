---
doc: checklist
status: implemented_snapshot
---

# Privacy X-Ray — Delivery and Submission Checklist

This checklist separates implemented behavior from submission tasks that still need human confirmation. It does not assert team approval, eligibility or a completed competition submission.

## Implemented product

- [x] Local PNG/JPEG import with file and dimension validation.
- [x] WebP normalization and one-page-at-a-time PDF import.
- [x] Automatic browser-local OCR and sensitive-information candidates.
- [x] Checkbox selection without a required recipient or sharing-purpose form.
- [x] Manual creation, selection, movement, resizing and deletion of masks.
- [x] Original-image coordinate mapping across preview sizes and rotation recovery.
- [x] Reviewable face, QR and barcode capabilities with limitations.
- [x] Multiline address coverage, full expiry dates and supported card-layout candidates.
- [x] Unclassified OCR text review, search, pagination and coverage warnings.
- [x] Actual PNG preview and permanently opaque redaction pixels.
- [x] Preview invalidation after edits and rejection of stale scan/render results.
- [x] Desktop/mobile layouts and preserved advanced Universal/Classic review.
- [x] Browser-local processing with no cloud AI API or user-content database.

## Recorded code validation

The supplied final source validation passed the following checks. These are results from the tested source snapshot, not claims that every possible document has been validated.

- [x] TypeScript typecheck.
- [x] **704 unit tests.**
- [x] Production build.
- [x] **64 automated browser tests.**
- [x] Real OCR/model fixtures, editor/reducer workflows and desktop/mobile cases.
- [x] PNG pixel checks for mask opacity, dimensions, alignment and unchanged neighboring content.
- [x] Regression checks for sideways cards, complete dates, barcode captions and multiline addresses.
- [x] Local-processing/network assertions and fictional test artifacts.

See [testing](../docs/testing.md) for commands and validation provenance.

## Submission preparation

The submission repository is private during preparation. Making it public requires a separate owner instruction.

- [ ] Confirm current competition eligibility, team requirements, deadlines and required deliverables against the official rules.
- [ ] Confirm the final team/member attribution and each member's contribution.
- [ ] Verify the final public repository and live demo links from a signed-out browser.
- [ ] Run a final smoke test against the published demo using fictional material.
- [ ] Record a short demo showing upload, selections, manual correction, actual PNG preview and downloaded output.
- [ ] Include a clear explanation of local processing and recognition limitations.
- [ ] Review every screenshot/video for accidental personal information.
- [ ] Prepare final Devpost description, screenshots and video link.
- [ ] Confirm dependency/model/fixture attribution and licensing are included.
- [ ] Submit through Devpost and verify that the submission is complete.

## Suggested demonstration sequence

1. Open a fictional document and let recognition complete.
2. Select a name, identifier, address or code to hide.
3. Correct or add one region manually.
4. Generate and inspect the actual PNG.
5. Edit a mask to demonstrate that the old preview disappears.
6. Generate a fresh preview, download and reopen the PNG.
7. State that detection can miss details and users must inspect the whole image.

Use the default workflow for the main demo. The advanced path is optional and should not obscure the simple selection task.
