---
doc: scope
status: implemented_snapshot
---

# Privacy X-Ray — Scope

**One line:** Find possible sensitive information locally, choose what to hide, and download a permanently redacted PNG.

## Problem and audience

People share screenshots, photographed documents and PDF pages that mix useful information with personal details. Names, addresses, account numbers, faces or machine-readable codes can be easy to overlook. Privacy X-Ray helps someone inspect those materials and decide what to cover before sharing.

## Current product

The default experience is **Upload → Select → Hide**:

1. Choose a local PNG, JPEG, WebP or PDF.
2. Recognition starts automatically.
3. Inspect possible sensitive items and check the ones to cover.
4. Draw or adjust masks for anything missed.
5. Inspect the actual covered PNG, then download it.

The default workflow asks for neither a recipient nor a sharing purpose. Nothing is automatically selected for hiding after a scan. A finding is a reviewable candidate, not a verified identity or a claim that it must be hidden.

## Included

- One image or selected PDF page at a time; WebP converts to one still PNG frame.
- Browser-local English and simplified Chinese OCR with bounded rotation and small-text recovery.
- Evidence-based candidates across identity, education, financial, contact, travel, medical, work, communication and technical materials.
- Possible face locations, QR inspection and possible one-dimensional barcode regions.
- Full-date expiry recognition, multiline address coverage and supported card-layout clues.
- Checkbox selection, search, paginated findings, location highlighting and unclassified OCR text review.
- Manual rectangle creation, selection, movement, resizing and deletion.
- Original-image coordinate alignment and an opaque, flattened PNG export.
- Desktop and mobile layouts, visible processing feedback and explicit coverage warnings.
- Existing Universal and Classic review interfaces under `?review=advanced`.

The advanced interface preserves context configuration, explainable KEEP/MASK/REVIEW advice, overrides and comparison tools. It is an optional review path, not a prerequisite for the default workflow.

## Product evolution

The initial concept centered on three sharing scenarios and seven text-field types. Development broadened recognition to more document families and visual regions. Feedback then led to the simpler default: show what was found and let the user choose what to cover. The earlier review interfaces remain available for advanced use and regression testing. This document describes the implemented snapshot; it does not claim a new team approval.

## Boundaries

- Files stay in browser memory; no processing server, cloud AI API, account or database is required.
- Static application files, OCR models, face models and PDF resources load from the site's own origin. Initial loading needs network access; full offline operation is not promised.
- Maximum file size: 20 MB. Images: 16 million decoded pixels. PDFs: at most 200 pages, with only one selected page processed at a time.
- PDF output is a PNG of the rendered page, not a redacted PDF. Other pages remain uninspected.
- No guarantee of detecting every sensitive item, every face, every barcode or every document layout.
- No identity recognition, official-document verification, privacy safety score or claim to know an organization's requirements.
- Handwriting, glare, tiny text, unsupported languages, signatures, background details and damaged codes may require manual masking.
- Barcode proposals locate stripe regions; they do not decode payloads.
- HEIC, Office files, video, encrypted PDFs and unsupported formats require local conversion.

See the [recognition coverage document](../docs/material-recognition.md) for detailed limits.

## Demonstration target

Use fictional materials to show a complete upload, selection, manual correction, actual PNG preview and download. Include a sideways card or multiline address example, and show that editing a mask removes the old preview. Mention detection limits and inspect the output before sharing. Never include real identity documents in public fixtures or demonstration recordings.

## Future work

Broader language and layout validation, stronger handling of difficult photographs, additional locally processed visual categories, batch workflows and full-document export remain future work. They are not claims about this submission.
