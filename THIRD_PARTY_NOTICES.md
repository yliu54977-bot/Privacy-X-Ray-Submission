# Third-party notices

The root MIT license applies to the project's own code. Dependencies, generated runtimes, models and upstream test resources retain their own licenses and attribution. Installing dependencies does not relicense them under MIT.

| Component | Package license | Role |
| --- | --- | --- |
| React / React DOM | MIT | User interface |
| Tesseract.js / Tesseract.js-core | Apache-2.0 | Browser OCR and WASM engine |
| `@tesseract.js-data/eng`, `@tesseract.js-data/chi_sim` | MIT (package metadata) | Packaged language data; upstream Tesseract traineddata terms also apply |
| MediaPipe Tasks Vision | Apache-2.0 | Browser face-location runtime |
| MediaPipe BlazeFace model | See bundled MediaPipe notice and source below | Pinned face-location model |
| PDF.js (`pdfjs-dist`) | Apache-2.0 | Local selected-page rendering; fonts/CMaps retain included notices |
| jsQR | Apache-2.0 | Local QR decoding |

The asset-preparation script copies Tesseract.js and Tesseract-core license text into `public/ocr/licenses`, MediaPipe's notice into `public/vision/LICENSE`, and PDF.js's license and resource notices into `public/pdf`. These generated assets accompany the website build. Installed packages retain their own license files in `node_modules`. Exact dependency versions are pinned in `package-lock.json`.

BlazeFace source, checksum and attribution are documented in [assets/models/README.md](assets/models/README.md); the MediaPipe notice is [assets/models/MEDIAPIPE-LICENSE](assets/models/MEDIAPIPE-LICENSE). Tesseract language package provenance is recorded in the generated OCR manifest; upstream trained data is maintained at https://github.com/tesseract-ocr/tessdata.

The optional MediaPipe example portrait is not distributed in this repository or website and is not claimed to be MIT-licensed. Test preparation downloads it from its recorded upstream URL, verifies its checksum and writes an ignored local fixture. See [test fixture provenance](tests/fixtures/PUBLIC-FACE-SOURCE.md). Other committed screenshots and QR fixtures are fictional examples used for regression testing.

Development tools such as TypeScript, Vite, Vitest and Playwright retain their package licenses. Their dependency tree and notices are available from the lockfile installation.
