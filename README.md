# Privacy X-Ray

**Find possible sensitive information. Choose what to hide. Download a permanently redacted PNG.**

[Live demo](https://yliu54977-bot.github.io/privacy-x-ray-site/) · [Planning documents](devpost/README.md) · [Recognition coverage](docs/material-recognition.md)

The hosted demo is maintained separately. Run this snapshot locally to review the exact submission version.

Privacy X-Ray is a browser-local privacy inspection and image redaction app built with React, TypeScript and Vite. It helps people review screenshots, document photographs and selected PDF pages before sharing. No account, API key, recipient questionnaire or purpose form is required.

## Try it

1. Open the demo and choose an image or PDF, or use **Try a sample**.
2. Recognition starts automatically. Check the items you want to cover.
3. Draw a mask over anything missed. Move, resize or delete masks as needed.
4. Select **Preview covered image**, inspect the actual result, then **Download PNG**.

Findings start unchecked. The app does not decide what you must hide. Editing masks invalidates the previous preview. The downloaded PNG contains opaque replacement pixels at the original image resolution; redactions are not removable CSS or editing layers.

## What is included

- Local English and simplified Chinese OCR, bounded orientation recovery, and native-detail text rescanning.
- Candidate detection for names, contact details, multiline addresses, supported identity and payment formats, credentials, and labeled information across everyday documents.
- Unlabeled institution, student, employee, library and membership card candidates where readable layout evidence exists.
- Possible face locations, QR inspection, and horizontal/vertical barcode-region detection with nearby printed numeric captions. Face detection does not identify people; barcode regions are not decoded.
- Searchable recognized text for information the classifiers did not categorize.
- An interactive editor with original-image coordinates, keyboard controls, desktop/mobile layouts and permanent PNG export.
- The previous Universal/Classic context-aware review at `?review=advanced`, retained for comparison and regression testing. It is separate from the default workflow.

These are candidates, not proof of privacy or document authenticity. Blur, glare, handwriting, small text, arbitrary rotation, unsupported languages, unusual layouts, faces and barcodes can still be missed. Inspect the entire final image. See the [coverage and limits](docs/material-recognition.md).

## Run locally

Use **Node.js 22.13 or later** and npm.

```sh
git clone https://github.com/yliu54977-bot/Privacy-X-Ray-Submission.git
cd Privacy-X-Ray-Submission
npm ci
npm run dev
```

Open the local URL printed by Vite. Installation prepares pinned OCR, face and PDF assets for same-origin serving. It requires internet access to obtain dependencies; normal image processing uses the downloaded local assets. No cloud AI service is configured.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

For the browser acceptance suite:

```sh
npm run prepare:test-fixtures
npx playwright install --with-deps chromium
npm run test:integration
```

The optional test-fixture preparation downloads one checksum-pinned public MediaPipe portrait for real-model tests. It is not a user upload, is ignored by Git, and is not bundled into the website. [Testing details](docs/testing.md).

## Privacy and file limits

Image pixels, OCR text, search terms and editing state remain in browser-tab memory. There is no processing backend, database, telemetry or analytics. The hosting provider receives ordinary requests for static website assets; user-selected files and OCR results are not sent with them. This is not an offline-install guarantee.

PNG, JPEG and WebP inputs are limited to 20 MB and 16 million decoded pixels; WebP uses one still frame. PDFs are limited to 20 MB and 200 pages; the user selects one page to rasterize and export as PNG. The original PDF and its other pages are not redacted. HEIC, Office files, encrypted PDFs, video and animations require conversion. Manual masking remains available when recognition fails.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/App.tsx` | Default upload, selection, preview and download flow |
| `src/features/ocr/`, `src/v2/detection/` | Local OCR, classification and visual region candidates |
| `src/features/editor/` | Interactive original-pixel redaction editor |
| `src/state/` | Authoritative decisions, masks and preview invalidation |
| `src/features/export/` | Permanent Canvas redaction and PNG download |
| `src/AdvancedApp.tsx`, `src/v2/ui/` | Retained Universal/Classic review components |
| `src/features/privacy/` | Transparent rules for the optional advanced review |
| `devpost/` | Scope, PRD, technical specification and submission checklist |
| `tests/` | Browser workflows using fictional material and a public test fixture |

[Architecture](docs/architecture.md) · [Test coverage](docs/testing.md)

## Team and submission snapshot

Developer A worked on architecture, upload, OCR and integration; Developer B on the editor and review interface; Developer C on privacy recommendations and permanent export. Integration and recognition improvements followed the initial module work.

This private submission-preparation repository starts with a clean snapshot of the validated A+B integrated application, including its required export and policy dependencies. It does not import the private development repository's commit history, local uploads, environment files or development artifacts. The validated application baseline passed **704 unit/component tests and 64 browser acceptance tests**, including real OCR and exported-pixel checks. This small regression set is not a general accuracy benchmark. Repository CI runs the same acceptance suite. Publication is a separate team decision; this repository remains private.

## License and attribution

Project code is distributed under the [MIT License](LICENSE), preserving its existing copyright notice. Third-party packages, models and test resources retain their own terms; the project license does not relicense them. See [third-party notices](THIRD_PARTY_NOTICES.md).
