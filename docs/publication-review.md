# Public submission review

Reviewed on **2026-10-24 (America/Toronto)**. Baseline: `47b32aa1961716d45b16c9d9bd176e48e2f31877` in `yliu54977-bot/Privacy-X-Ray-Submission`.

## Conclusion

No confirmed live credential, private training dataset, or user-uploaded identity image was found in the reviewed baseline. This is a scoped review, not a security certification or proof that every identifier is fictional. Keep the public source and documented synthetic fixtures; do not copy the private development workspace wholesale into this repository.

The application consumes upstream pretrained models; no training or fine-tuning pipeline/dataset was found. Tesseract language `traineddata` and the pinned MediaPipe model are runtime dependencies, not evidence that the team's private training examples have been published.

## What to publish

| Material | Decision | Evidence / condition |
| --- | --- | --- |
| `src/`, build scripts, package manifests and lockfile | Keep | Needed to reproduce the submitted app; no application upload API found in reviewed source. |
| `LICENSE`, `THIRD_PARTY_NOTICES.md`, model notices | Keep | Preserve project and upstream terms. |
| `README.md`, `docs/`, public-facing `devpost/` requirements/specification | Keep | Reviewed as product/technical documentation. No personal learner profile was present. |
| `public/samples/` (2 PNGs) | Keep | Both visibly identify themselves as fictional; values match the checked-in generator. EXIF contained image dimensions/resolution, with no GPS, person or device identifiers observed. |
| `tests/fixtures/fictional-qr-*.png` (3 PNGs) | Keep | All decoded: fictional test email, deliberately fake API-key text, and an `example.test` URL. No decoded URL was opened. |
| Unit/browser tests and `acceptance-cases.json` | Keep | Synthetic examples and policy cases, not a collected user dataset. Credential-shaped matches were reviewed as exact fake test values. |
| `assets/models/blaze_face_short_range.tflite` | Keep | SHA-256 matches the documented upstream pretrained model. Retain attribution. |
| Optional upstream portrait | Keep downloader/provenance only | Not tracked; download is checksum-verified and ignored. Do not publish image-bearing screenshots/traces automatically. |
| Real ID cards, personal screenshots, chat exports, raw OCR, real training/evaluation data | Do not publish | Keep in a separately controlled private workspace. No such files were identified in the reviewed tree. |
| Private checkpoints, environment files, credentials, logs, debug archives, learner profiles | Do not publish | Not needed for reproducing the submission; blocked or ignored where recognizable. |
| Desktop installers / the old private repository | Separate review | Not present in this baseline. Existing desktop validation does not certify this independent snapshot or vice versa. |

The six reviewed binary assets are pinned by path and SHA-256 in `scripts/check-publication.mjs`. Updating that list requires provenance and content review, not merely recalculating a hash after a failed check.

## Findings and disposition

| Priority | Finding | Disposition |
| --- | --- | --- |
| Medium | CI uploaded the complete `test-results/` directory, including screenshots; future real test inputs could be exposed. | Removed automatic artifact upload. Existing artifact is a separate owner cleanup item. Public CI must still use fictional data because logs can expose assertions. |
| Medium | No review gate for new media/datasets and only a limited ignore list. | Added staged-file publication checks, six negative/positive regression tests and private-data ignore rules. Does not replace manual review or upstream secret scanning. |
| Medium | `main` was unprotected and the repository ruleset list was empty at inspection. | Owner action required: PR review, required CI, force-push/deletion restrictions and appropriate secret protection. Auditor connection has write, not admin, access. |
| Medium | No security-header/CSP deployment configuration in this snapshot. | Documented; not changed during data-publication work. Requires a separate compatibility-tested web hardening change and deployment to the actual demo host. |
| Low | Actions used mutable `@v4` references and checkout's default persisted credentials. | Pinned the observed upstream commits and set `persist-credentials: false`. Read-only workflow permissions retained. |
| Low | README/checklist incorrectly described the now-public repository as private. | Corrected and linked the publication policy. |

No confirmed critical/high-severity credential leak was identified. The priority labels above describe this review's findings, not a numerical security score.

## Evidence and scope

- Full clone and reachable-history inventory: **1 commit, 1 branch, 173 tracked files**, no tags or Releases at the baseline. No private development history was imported. Review cannot cover unreachable/deleted remote objects or third-party copies.
- All 167 UTF-8 files were included in credential-pattern, email-domain, URL-host and network/storage API searches. All 6 binary files were inventoried; 2 sample images inspected visually and for metadata, 3 QR images decoded, and the model hash checked. Text examples use reserved example/test email domains; synthetic numeric identifiers were not checked against any live identity or payment service.
- Credential-format hits occurred in `src/v2/detection/documentPatterns.test.ts`: an obviously synthetic token and private-key marker/body test cases. No live-credential validation requests were made.
- `npm audit --package-lock-only --ignore-scripts --json` returned **0 known vulnerabilities** for the lockfile at review time. This is advisory-database coverage only, not proof of safe dependencies or model binaries.
- [Baseline CI run](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/actions/runs/40149108795) succeeded with **704 unit/component tests and 64 browser tests**. Logs were inspected; the targeted credential-format scan did not find secret markers.
- Artifact `12581366950` (`synthetic-integration-test-results`, 2,373,225 bytes) was downloaded and its SHA-256 verified as `2ade29aaa69a9695771b7bec960f3cc188acb00c001225161a25069b5fcb04c8`. It contains 9 PNG screenshots, not a training dataset. Visual review and generating-test inspection found synthetic document screens and one redacted upstream public portrait, rather than a team's private upload. Screenshots may show unmasked values in sidebars; redacting only the preview does not sanitize a full UI capture. The original artifact remains available until separately deleted or expired (scheduled 2026-11-01 UTC).
- One HTTP fetch of the README-linked, separately hosted demo returned 200 and HSTS, but no CSP header/meta, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` or `X-Frame-Options`. This checks that response only; it does not establish deployed-source identity or complete runtime network behavior.

## Remaining work

1. Owner: remove unnecessary older screenshot artifacts and enable branch/secret protection. Keep only separately reviewed public demo images.
2. Maintainers: use local pre-push content review; do not put real data in public branches, PRs, logs, Issues or release attachments. A failing public CI run cannot undo an upload.
3. Web security: apply and verify compatible CSP/security headers at the real deployment, including workers/WASM; test file clearing and runtime requests with synthetic inputs.
4. Reassess future model changes and new data separately. No guarantees are made about private folders that were not provided, hidden encodings, every possible credential format, external copies, or GitHub security settings that the connection cannot inspect.
