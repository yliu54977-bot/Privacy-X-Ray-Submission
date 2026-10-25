# Privacy X-Ray

**Find sensitive information. Choose what to hide. Share with confidence.**

Privacy X-Ray is a local image review and redaction tool for screenshots, identity documents, receipts, and PDF pages. It combines text, face, and code detection with an editable mask layer, then exports a PNG with the selected regions replaced by opaque black pixels.

**[Try in browser](https://privacy-xray-app.vercel.app/)** · **[Download desktop preview](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/releases/tag/v0.1.0-desktop-test.2)** · **[Quick start](#quick-start)** · **[Privacy & security](#privacy--security)** · **[Development](#development)** · **[MIT license](LICENSE)**

> **Project status:** Browser app plus public desktop preview, version `0.1.0-desktop-test.2`. The desktop ZIPs and hosted demo were built from public commit [`ef4a612`](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/commit/ef4a6129796cb384ef5e44eefa7157352844dbc8). This repository includes the desktop source, build scripts and native CI; no private repository is needed.

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

Download the [public-source desktop preview](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/releases/tag/v0.1.0-desktop-test.2). Each ZIP has a matching `.sha256` checksum file; `BUILD-PROVENANCE.json` records its public source commit and native build run. Choose a platform ZIP below; GitHub's auto-generated **Source code** archives are for developers.

| Platform | Package | Getting started |
| --- | --- | --- |
| macOS 13+ · Apple M series | [Mac ARM64 ZIP](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/releases/download/v0.1.0-desktop-test.2/Privacy-X-Ray-0.1.0-desktop-test.2-Mac-arm64-adhoc-test.zip) | Extract the ZIP and move `Privacy X-Ray.app` to Applications. |
| Windows · x64 | [Windows x64 ZIP](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/releases/download/v0.1.0-desktop-test.2/Privacy-X-Ray-0.1.0-desktop-test.2-Windows-x64-test.zip) | Extract the complete ZIP and launch `Privacy X-Ray.exe`. Keep its companion files together. |

**Mac compatibility:** Use the same ARM64 ZIP for Apple M-series Macs, including Pro, Max and Ultra variants. It requires macOS 13 Ventura or later and does not support Intel Macs. The package architecture and minimum OS version have been verified; each chip/device combination has not been individually tested.

The desktop packages include the application, recognition models, and PDF resources. End users do not need Node.js or an API key.

**Signing status:** The Mac package uses an ad-hoc signature and has not been notarized by Apple, so Gatekeeper may block it. The Windows package is not publisher-signed and may also show a security warning. Native CI verifies Mac signatures, but downloaded/quarantined first launch remains a manual check. Do not disable global OS security protections to run a preview.

**Historical release:** [`test.1`](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/releases/tag/v0.1.0-desktop-test.1) remains unchanged and was built from private development commit `24322bd`. Use `test.2` for packages whose corresponding desktop source and build workflow are available in this public repository.

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
| Runtime controls | Sandboxed renderer, local asset allowlist, remote requests/navigation/popups and device permissions blocked | Same-origin CSP and security headers in `vercel.json` |
| Updates and telemetry | No automatic updater, analytics, or crash-upload service configured | Hosting may retain connection/access metadata |

The desktop app loads bundled assets through `privacy-xray://app/`, without running an HTTP server. Its renderer has Node.js integration disabled, context isolation enabled, and no preload/IPC bridge.

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

The web build is written to `dist/`. Keep its generated `vercel.json` when uploading a static build. The hosted demo is deployed separately; its source version must be checked against the release notes.

### Build the desktop app from public source

From this repository root, after `npm ci`:

```sh
npm ci --prefix desktop
npm run desktop:test
npm run desktop:build
npm run desktop:start
```

Package on the corresponding system:

```sh
# macOS with Apple Silicon
npm run desktop:package -- darwin arm64
# Windows x64
npm run desktop:package -- win32 x64
```

The app, pinned models and PDF assets are staged in `desktop/stage/`. ZIPs and SHA-256 files are written to `desktop/releases/`. Each app includes `build-info.json` with its public repository and source commit. See [desktop instructions](desktop/README.md) and [native build CI](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/actions/workflows/desktop.yml).

A clean checkout of the release tag is sufficient for a source build; no private repository, training dataset or private service is required. Build-time dependency downloads require internet access. Signatures and ZIP timestamps can vary between rebuilds; this is source reproducibility, not a claim of byte-identical artifacts.

### Validation

```sh
npm run typecheck
npm test
npm run desktop:test

# Install the browser once before browser tests
npx playwright install chromium
npm run prepare:test-fixtures
npm run test:integration
```

The desktop migration passed **718 unit/component tests, 8 desktop security tests, 7 publication-boundary tests and 64 browser acceptance tests**. See the [native build run](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/actions/runs/40161265403), [browser validation](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/actions/runs/40161265393) and [testing details](docs/testing.md). These are regression checks, not a general detection-accuracy benchmark. The browser run needed one retry after a touch-emulation assertion failed; the migration PR's identical source tree also passed all 64 checks.

The native CI additionally launches the staged Electron app with networking disabled, checks OCR/face/QR/PDF processing, opaque preview pixels, saved PNG creation, Clear file and home navigation. It asserts renderer isolation and installed session request blocking. A completed green run is required before distributing its packages. Native save-dialog interaction, OS-level network capture and quarantined first launch remain manual checks.

## Architecture

| Area | Responsibility |
| --- | --- |
| [`src/features/ocr/`](src/features/ocr/) | OCR, orientation, text-region geometry, and detail passes |
| [`src/v2/detection/`](src/v2/detection/) | Sensitive-field, face, QR, and barcode detection |
| [`src/features/editor/`](src/features/editor/) | Image-coordinate masks and editing interactions |
| [`src/features/export/`](src/features/export/) | PNG preview, opaque pixel redaction, and download |
| [`src/features/documents/`](src/features/documents/) | Local PDF page rendering |
| [`src/features/privacy/v2/`](src/features/privacy/v2/) | Contextual KEEP / MASK / REVIEW policy engine |
| [`desktop/`](desktop/) | Isolated Electron runtime, asset manifest, native smoke tests and packaging |
| [`tests/`](tests/) | Browser workflow and recognition regression tests |

The default interface uses explicit user selection. The contextual policy engine and advanced review interface remain available in the codebase for integration and regression work; they do not automatically decide what the default interface hides.

**Built with:** React, TypeScript, Vite, Electron, Tesseract.js, MediaPipe, jsQR, and PDF.js. Validation uses Vitest and Playwright.

## Known limitations

- Detection can miss or misread text, faces, codes, handwriting, signatures, or background details. A detected-item count is not proof that all private information was found.
- Small, rotated, blurred, low-contrast, or unusual layouts can reduce recognition quality. Review the full output and add manual masks as needed.
- Face detection may be unavailable when a browser or graphics environment cannot initialize its runtime. The hosted cloud-browser check reported this warning; native Mac and Windows face checks passed. Inspect detector warnings and manually cover missed faces.
- Redaction protects only the pixels you cover. Information elsewhere in the image can still reveal identity or context.
- The current desktop release is a preview, not an independently audited or fully platform-certified product.

## Contributing

Use a feature branch and keep changes focused. Include a description of the behavior change and relevant validation in your pull request. Detection fixes should include a synthetic regression case; UI and export changes should be checked through the full import–review–export flow.

Use fictional or properly anonymized fixtures. Do not commit real identity documents, account credentials, or personal screenshots. For bug reports, include the app version, operating system, reproduction steps, and a non-sensitive example when possible.

## License

Privacy X-Ray is available under the [MIT License](LICENSE). Bundled dependencies and models retain their respective licenses; see the [model notices](assets/models/README.md) and notices included with desktop builds.
