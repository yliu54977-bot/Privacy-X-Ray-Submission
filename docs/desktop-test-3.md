# Desktop preview test.3

Source version: `0.1.0-desktop-test.3`. This page records the release scope;
it is not evidence that downloadable packages have already been published.
The Release page and its BUILD-PROVENANCE.json identify the actual packages.

## Changes from test.2

- Include PR #8: bounded sparse screenshot OCR recovery, complementary upright
  pass merging, protection for complete dates/emails/identifiers and overlapping
  neighboring glyphs, column separation, and improved screenshot field association.
- Improve passenger/transfer labels, account ending digits, punctuated references,
  social handles, adjacent address lines, OCR-spaced email local parts, right-aligned
  balances, expiry labels touching dates and misread masking symbols.
- Include PR #6: lazy bundled TensorFlow.js CPU face detection when MediaPipe
  initialization or detection fails, including unavailable WebGL. Retain real
  confidence scores and crop confirmation. CPU processing may be slower.
- Require both CPU model files during desktop staging; retain pinned checksums.
- Add native production-bundle regression coverage for no-WebGL face plus OCR,
  screenshot selection and opaque saved-PNG pixels on Mac ARM64 and Windows x64.
- Keep the intentional PR #2 revert. This version does not restore that PR's
  all-text selection workflow. No new detector training or private data is included.

## Release checks

Use the exact public main commit that passes both workflows, not a PR artifact:

1. Integrated privacy workflow: typecheck, application tests, production build,
   full integration suite, no-WebGL face/OCR test and publication boundary checks.
2. Native Mac ARM64 and Windows x64: application and desktop security tests,
   offline asset staging, native smoke including no-WebGL screenshot export,
   native architecture check, packaging and Mac signature verification.
3. Download both workflow artifacts, verify the ZIP hashes and bundled source
   commits, and publish those unchanged ZIPs with .sha256 files and
   BUILD-PROVENANCE.json. Record the exact source commit and successful run URLs.
4. Publish a new prerelease named `v0.1.0-desktop-test.3`; do not replace test.2.
   Switch README download links only once both new packages are available.

The added native test uses fictional text and the existing checksum-verified
public portrait. It verifies expected fields, rejects a cross-column phone/address
concatenation, requires CPU model loading, and decodes the saved PNG to check its
dimensions and selected-mask centre pixels. It prints scan elapsed time for the
fixture, not a claimed performance guarantee.

## Preview limitations and manual checks

- Mac remains ad-hoc signed and not Apple-notarized; Windows remains unsigned.
  Downloaded/quarantined first launch, native save-dialog interaction, physical
  network disconnection and OS-level traffic capture remain manual acceptance
  checks. Do not represent CI session-level network blocking as those checks.
- Run on the actual target hardware with small/rotated/low-contrast text,
  multi-column screenshots, Chinese addresses, multiple faces and large images;
  inspect false positives, missed fields, responsiveness and cancellation.
- Confirm both-face-model failure preserves OCR results and exposes the detector
  warning. Browser CI covers this; the native happy-path smoke is not a substitute.
- Detection remains suggestive and incomplete. Review the entire output and
  add manual masks. QR payloads are supported; barcodes remain region-only;
  PDF export remains one selected page as PNG.
- The hosted browser demo is deployed independently. This desktop release does
  not deploy or alter the website; consult deployment provenance separately.
