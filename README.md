# Privacy X-Ray

**Find sensitive information. Choose what to hide. Share with confidence.**

Privacy X-Ray is a local image review and redaction tool for screenshots, identity documents, receipts, and PDF pages. It combines text, face, and code detection with an editable mask layer, then exports a PNG with the selected regions replaced by opaque black pixels.

**[Try in browser](https://privacy-xray-app.vercel.app/)** · **[Historical desktop preview](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/releases/tag/v0.1.0-desktop-test.1)** · **[Quick start](#quick-start)** · **[Privacy & security](#privacy--security)** · **[Development](#development)** · **[MIT license](LICENSE)**

> **Source status:** This public repository currently contains the browser application. The historical desktop preview `v0.1.0-desktop-test.1` was built from development commit `24322bd222f1695a071b7a3a5c2477d88f430993`, whose desktop source is not included in this repository. Its ZIPs cannot be reproduced from this release's automatically generated source archives. Desktop source migration and a new public-source build are pending.

## Why Privacy X-Ray?

Sharing a screenshot often exposes more than the intended message: a student number beside a portrait, an email in a receipt, or a QR code containing account information. Privacy X-Ray helps you locate those details and decide what to remove before sharing.

Recognition provides suggestions. **You control every mask**, and you can cover anything the detectors miss.

## Features

- **Local text recognition:** English and Simplified Chinese OCR, with detectors for possible names, email addresses, phone numbers, identity/student numbers, addresses, and other sensitive fields.
- **Face and code detection:** Locate possible faces, inspect QR codes, and detect horizontal/vertical barcode regions alongside text findings. This public snapshot does not decode barcode payloads.
- **Editable redaction:** Select detected items, locate them on the image, and draw, move, resize, or remove masks manually.
- **Text review:** Inspect recognized text and cover additional regions without relying solely on automatic classification.
- **PDF page support:** Choose a page, review its rendered image, and export the redacted result as PNG.
- **Pixel-based export:** Selected regions are painted into a freshly encoded PNG. Editable mask layers and the original source file are not embedded in the export.
- **Session controls:** Clear the current file and results, or return to the start screen using the logo. Manual masking remains available when recognition fails.

## Download

Historical packages remain available from the [desktop test release](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/releases/tag/v0.1.0-desktop-test.1). Each package has a matching `.sha256` checksum file.

| Platform | Package | Getting started |
| --- | --- | --- |
| macOS 13+ · Apple M series | [Mac ARM64 ZIP](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/releases/download/v0.1.0-desktop-test.1/Privacy-X-Ray-0.1.0-Mac-arm64-adhoc-test.zip) | Extract the ZIP and move `Privacy X-Ray.app` to Applications. |
| Windows · x64 | [Windows x64 ZIP](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/releases/download/v0.1.0-desktop-test.1/Privacy-X-Ray-0.1.0-Windows-x64-test.zip) | Extract the complete ZIP and launch `Privacy X-Ray.exe`. Keep its companion files together. |

**Mac compatibility:** Use the same ARM64 ZIP for Apple M-series Macs, including Pro, Max and Ultra variants. It requires macOS 13 Ventura or later and does not support Intel Macs. The package architecture and minimum OS version have been verified; each chip/device combination has not been individually tested.

The desktop packages include the application, recognition models, and PDF resources. End users do not need Node.js or an API key.

**Signing status:** The Mac package uses an ad-hoc signature and has not been notarized by Apple, so Gatekeeper may block it. The Windows package is not publisher-signed and may also show a security warning. Desktop ZIP downloads are publicly available from this repository's Releases. These packages mirror the desktop preview built from development commit `24322bd`; this repository's browser-app snapshot and auto-generated source archives are separate.

## Quick start

1. **Open a file.** Choose or drag in an image or PDF. Recognition starts automatically; a fictional sample is also available.
2. **Choose what to hide.** Check individual findings or use **Select all**. Unchecked findings remain visible.
3. **Review the whole image.** Draw masks over missed information and adjust their boundaries with **Select / Edit**.
4. **Preview the result.** Select **Preview covered image** and inspect the actual output.
5. **Save a copy.** Select **Download PNG**. Your original file is not modified.

For PDFs, this workflow applies to **one selected page at a time**. It does not produce a redacted multi-page PDF.

### Supported files

| Input | Current limits | Output |
| --- | --- | --- |
| PNG / JPEG | Up to 20 MiB and 16 million pixels | PNG at the loaded image dimensions |
| WebP | Same image limits; converted to one still frame | PNG |
| PDF | Up to 20 MiB and 200 pages; one selected page per operation | PNG at the rendered page dimensions |

Password-protected PDFs are not supported. Convert HEIC, GIF, Office documents, and video to a supported still-image format first. Large PDF pages are scaled during rendering.

## Privacy & security

Recognition and redaction run on the user's device. The application has no file-upload API or server-side recognition service.

| | Desktop edition | Hosted web edition |
| --- | --- | --- |
| App and model resources | Bundled in the application | Loaded from the website's origin |
| Image and PDF processing | Local | Local |
| Network requirement | Designed to run offline after download | Requires network access to load the app and resources |
| Runtime controls | Historical desktop package: sandbox and network restrictions reported by its original build | Hosting configuration varies; this source snapshot does not yet include the desktop/web hardening migration |
| Updates and telemetry | No automatic updater, analytics, or crash-upload service configured | Hosting may retain connection/access metadata |

The historical desktop app loads bundled assets through `privacy-xray://app/`, without running an HTTP server. Its renderer has Node.js integration disabled, context isolation enabled, and no preload/IPC bridge.

**Clear file** releases the application's references to the current file, results, and previews. It does not delete original files or saved exports, and it is not secure erasure of operating-system memory or storage.

These controls do not protect against a compromised operating system or a modified application. Read [SECURITY.md](SECURITY.md) for the full boundaries.

## Development

### Requirements

- Node.js **22.13 or newer** and npm.
- Internet access to install dependencies and prepare build resources.
- macOS for Mac packaging; use the target operating system for desktop acceptance testing.

### Run the web app

```sh
git clone https://github.com/yliu54977-bot/Privacy-X-Ray-Submission.git
cd Privacy-X-Ray-Submission
npm ci
npm run dev
```

Open the local URL printed by Vite. Installation prepares recognition assets from pinned dependencies; no API key is required.

For a production build:

```sh
npm run build
npm run preview
```

The web build is written to `dist/`. The hosted demo is currently deployed separately and is not yet verified to match this public source commit.

### Desktop source availability

`desktop/`, its lockfile and build scripts are not yet present on this branch. Do not use this repository to reproduce `v0.1.0-desktop-test.1`; that release is a historical binary mirror. A separate reviewed migration will add the desktop sources and native build workflow, followed by a new release built from an identified public commit. The historical tag and packages will be retained without replacement.

### Validation

```sh
npm run typecheck
npm test

# Install the browser once before browser tests
npx playwright install chromium
npm run prepare:test-fixtures
npm run test:integration
```

The public browser baseline passed **704 unit/component tests and 64 browser acceptance tests**. These are regression checks, not a general detection-accuracy benchmark. See [testing details](docs/testing.md) and the [public CI](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/actions).

The historical desktop build reported 673 application tests and 8 desktop tests; those results belong to its original development source, not this browser snapshot. Native GUI startup, disconnected recognition, OS-level network monitoring and save dialogs still require target-platform validation.

## Architecture

| Area | Responsibility |
| --- | --- |
| [`src/features/ocr/`](src/features/ocr/) | OCR, orientation, text-region geometry, and detail passes |
| [`src/v2/detection/`](src/v2/detection/) | Sensitive-field, face, QR, and barcode detection |
| [`src/features/editor/`](src/features/editor/) | Image-coordinate masks and editing interactions |
| [`src/features/export/`](src/features/export/) | PNG preview, opaque pixel redaction, and download |
| [`src/features/documents/`](src/features/documents/) | Local PDF page rendering |
| [`src/features/privacy/v2/`](src/features/privacy/v2/) | Contextual KEEP / MASK / REVIEW policy engine |
| [`tests/`](tests/) | Browser workflow and recognition regression tests |

The default interface uses explicit user selection. The contextual policy engine and advanced review interface remain available in the codebase for integration and regression work; they do not automatically decide what the default interface hides.

**Built with:** React, TypeScript, Vite, Tesseract.js, MediaPipe, jsQR, and PDF.js. Historical desktop packages additionally use Electron and other dependencies listed in their bundled notices. Validation uses Vitest and Playwright.

## Known limitations

- Detection can miss or misread text, faces, codes, handwriting, signatures, or background details. A detected-item count is not proof that all private information was found.
- Small, rotated, blurred, low-contrast, or unusual layouts can reduce recognition quality. Review the full output and add manual masks as needed.
- Redaction protects only the pixels you cover. Information elsewhere in the image can still reveal identity or context.
- The current desktop release is a preview, not an independently audited or fully platform-certified product.

## Contributing

Use a feature branch and keep changes focused. Include a description of the behavior change and relevant validation in your pull request. Detection fixes should include a synthetic regression case; UI and export changes should be checked through the full import–review–export flow.

Use fictional or properly anonymized fixtures. Do not commit real identity documents, account credentials, or personal screenshots. For bug reports, include the app version, operating system, reproduction steps, and a non-sensitive example when possible.

## License

Privacy X-Ray is available under the [MIT License](LICENSE). Bundled dependencies and models retain their respective licenses; see the [model notices](assets/models/README.md) and notices included with desktop builds.
