# Validation

## Reproduce

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run prepare:test-fixtures
npx playwright install --with-deps chromium
npm run test:integration
```

The initial application snapshot passed 704 unit/component tests and 64 Chromium acceptance tests before submission preparation. GitHub Actions repeats installation, type checking, tests, the production build and the acceptance suite on pushes to main and pull requests. Its run result is the authoritative status of this repository.

`test:integration` selects the maintained acceptance matrix. Other Playwright files include earlier workflows and benchmark experiments; their presence is not a claim that every experimental test is in the release gate. `test:browser:production` is an additional preview-server suite and requires an existing build.

## Acceptance coverage

- Automatic local OCR; simple checkbox selection; preserved Universal/Classic review.
- Manual creation, movement, resizing, selection and deletion; original-coordinate alignment.
- Desktop/mobile layouts, keyboard selection, preview invalidation and PNG downloads.
- Original image resolution, opaque output pixels, unchanged neighboring pixels and unchanged input.
- Multiline English/Chinese addresses and continuous character coverage.
- Sideways/unlabeled card names and identifiers, complete expiry dates, barcode bars and printed captions.
- Real local face-model checks, duplicate/false-positive controls, QR findings and unsupported coverage.
- Image replacement, stale sessions, policy overrides and browser-local processing checks.

The browser fixtures are fictional generated documents. The real-model face tests use an optional public MediaPipe portrait downloaded by `scripts/prepare-test-fixtures.mjs`, with a pinned SHA-256. The file is ignored by Git and is never included in production assets. Its source is documented in `tests/fixtures/PUBLIC-FACE-SOURCE.md`. No user-uploaded identity image belongs in the repository, traces, screenshots or logs.

A passing synthetic suite demonstrates these specific regressions. It does not establish accuracy on arbitrary materials, official document validity, complete face detection or universal privacy protection. Physical-device and additional-browser results should be reported separately when measured.
