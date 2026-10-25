# Material recognition coverage

The Universal workflow accepts PNG, JPEG, WebP (one still frame), and PDF (one selected page at a time). Files remain in browser memory. Models, workers and PDF resources load from the same origin. Recognition is a suggestion for human review, not a guarantee that all sensitive information was found.

## Coverage matrix

| Material family | Examples of candidate fields |
| --- | --- |
| Identity documents | Names, passport, government ID, driving licence, date of birth, address, possible faces |
| Education | Student IDs, names, grades, enrolment labels |
| Banking and payments | Card numbers, IBAN, account labels, routing identifiers, balances, payment amounts |
| Purchases and shipping | Invoice, order, tracking, addresses |
| Travel | Booking references, tickets, destinations, accommodation |
| Medical | Patient IDs, diagnoses, medications, treatment and insurance labels |
| Employment | Employee IDs, salary, workplace labels |
| Legal and insurance | Cases, contracts, claims and policy labels |
| Communication | Names, email headers, contact details, usernames |
| Technical screenshots | API-key shapes, passwords, Wi-Fi labels, IP/MAC addresses, device identifiers |
| Business and research | Revenue, budget, project labels, participant identifiers |

Material-family hints are keyword matches, not an AI understanding of the document. A field may belong to several categories. New pattern/face findings remain uncertain candidates with evidence and original-image coordinates; existing policy decides their recommendation. Users explicitly confirm decisions. A bulk action masks only currently matching findings with real coordinates.

## Detection layers

1. Browser-local English and simplified Chinese OCR, with bounded adaptive rescans and original-coordinate mapping.
2. Existing exact field detectors, QR inspection, possible one-dimensional barcode regions, and broad label/format candidates reconstructed from OCR geometry.
3. Checksums for conventional card numbers, supported-country IBANs and Chinese national IDs; calendar validation for birth dates. These validate format, not authenticity or ownership.
4. Browser-local, tiled BlazeFace face-location detection. It does not identify people. A face box includes padding and remains a candidate requiring review.
5. Searchable OCR fallback and manual rectangle editing for missed or unclassified text.

## Explicit limits

- PNG/JPEG/WebP: 20 MB and 16 million decoded pixels. PDF: 20 MB, at most 200 pages, selected page rasterized within 3000 pixels/6 million pixels. Export is a PNG of that page, **not a redacted PDF**. Other pages remain uninspected.
- Password-protected PDFs, HEIC, Office documents, video and animated frames require conversion. No attachments or remote links are followed.
- OCR can miss handwriting, stylized text, glare, small text, unsupported languages and layout. Rotation/low-confidence recovery is bounded.
- Face detection can miss small, occluded, distant or profile faces. It cannot inspect every background object. No signatures, fingerprints or photo metadata detector is claimed.
- One-dimensional barcode candidates use repeated stripe geometry, not payload decoding. Small, damaged, strongly tilted or low-contrast codes can be missed; patterned graphics can resemble barcodes. Inspect each region before choosing it.
- QR pixel inspection is limited to 4 million pixels; larger images show an explicit unsupported inspection warning. Face tiles are independently bounded.
- IBAN checks currently cover GB, DE, FR, ES, IT, NL, BE, CH, AT, IE, PL, PT, SA and AE. Other banking formats may still be found by labels or manually.
- A KEEP recommendation never certifies safety. Review uncertain candidates, coverage warnings and the actual exported PNG.

## Integration and validation

`documentPatternDetector` and `localFaceDetector` implement the existing detector contract. Material profiles are presentation hints. No shared taxonomy, policy rules or PNG-export implementation is replaced. New PDF/WebP import normalizes to the existing image contract.

Run typecheck, unit tests, production build and `tests/material-recognition.spec.ts` alongside existing editor/export/Universal suites. Browser fixtures are fictional generated documents and the attributed public MediaPipe portrait; no user uploads belong in fixtures, logs or artifacts.

The asset-preparation script pins the model checksum and same-origin runtimes. Face model provenance is in `assets/models/README.md`; PDF runtime carries its Apache licence. MediaPipe runtime/model source: https://github.com/google-ai-edge/mediapipe (Apache-2.0).

## Expanded everyday-material coverage

The simple checkbox workflow also covers explicit labels for card expiry/security codes/cardholders, bank branch/transfer codes, visa/residence/regional identity numbers, passport personal details, emergency contacts, precise locations, OTP/recovery/meeting credentials, cookies/API secrets, memberships, medical measurements/coverage, HR records, legal details, property and commercial records. These remain candidates, not verified documents. Generic identity/booking numbers require a label; bare arbitrary numbers are not automatically asserted as passport numbers.

Face search now combines overlapping 1024-, 384- and 192-pixel windows, a 0.6 proposal threshold, 0.8 crop confirmation, and 90/180/270-degree recovery using a bounded overview for large images. The 192-tile budget is spatially distributed for large images; it is a bounded search, not full visual coverage. Results map back to original pixels and overlapping detections are deduplicated. Smaller faces, multiple portraits and rotated portraits have dedicated real-model browser tests. Profile/occluded/tiny faces may still be missed; manual masks remain available. No person is identified.

## Face precision correction

Large photographs now receive a bounded, assembled overview even above four million pixels. Each overview box scales back to original coordinates; 1024-pixel reads keep memory bounded. Overlapping tile proposals use a 0.6 model threshold and must pass a second face-sized crop at 0.8 with spatial agreement before appearing in the checkbox list (up to 48 proposals verified). This reduces text/logo proposals; it does not certify that every returned region is a face. Regression tests include a 2704×1792 fictional card, annotated portrait coverage and a matching text/logo-only negative. User-provided private images are never committed as fixtures.

## Orientation and layout follow-up

Weak OCR can retry 180 degrees as well as quarter turns. All recognized boxes are mapped through the inverse rotation and then to original-image pixels. Retry count remains bounded (one sparse pass and up to three orientations). Student-card name candidates use the nearby aligned text column rather than joining distant watermark/column words on the same OCR row. Face deduplication requires nearby centers in addition to overlap so nearby separate faces are less likely to be collapsed; the existing proposal/crop confidence gates remain unchanged. These changes do not establish a person's identity or official document validity.

## Native-detail text recognition

Large images whose overview cannot sufficiently enlarge text receive up to 18 overlapping native-image OCR bands, enlarged 1.8× within a bounded per-pass canvas. The existing full-image OCR is retained. Detail words are merged by position and recognition confidence, preserving distinct occurrences and avoiding duplicate tokens. Words clipped by internal crop edges are discarded rather than used as truncated identifiers. Original-image coordinates and fresh unique word/line IDs are retained. Long or dense material can exceed the detail budget; no full-coverage guarantee is made. Progress is monotonic across overview, orientation and detail passes; temporary overview/detail canvases are released after processing. No images or recognized text leave the browser.

Orientation metadata stays in browser memory without changing shared contracts. Text classifiers operate in a consistent upright reading layout; both finding and evidence rectangles return to original image coordinates. Detail merging preserves this layout for rotated images.


### Multiline addresses and continuous text coverage

Labeled postal addresses can include up to six adjacent aligned rows, including
Chinese street/building/unit details and English street, unit, locality and postal
code lines. New field labels, separate columns, large vertical gaps and unrelated
prose stop the block. Evidence retains the actual OCR words and their original
locations; overlapping partial street/postcode candidates are replaced only when
the full address contains those same OCR word identities.

OCR-backed selections now cover nearby words as continuous line regions with a
small image-bounded margin. Wrapped lines remain independently editable. The same
coverage applies to unclassified text, including rotated images. Visual face and
QR regions, policy decisions, and the permanent PNG exporter are unchanged.

Explicit identity/contact labels also support bare Chinese birth labels, English
month-name birth dates with calendar validation, single-character sex/ethnicity
values, complete Chinese phone-number labels, No. abbreviations and OCR-spaced
email domains. These remain reviewable candidates, not identity verification.

Regression fixtures are fictional. The browser tests inspect actual exported
pixels across every address line and character gap, check that a neighboring
phone field remains unchanged, and verify preview invalidation. No real identity
image is committed or uploaded as a fixture. Arbitrary layouts, handwriting,
blurred or missing OCR words can still be missed and need manual review.

### Sideways cards, complete dates and barcode regions

Confident but sideways Latin/numeric OCR now triggers bounded orientation recovery.
Candidate quality is measured in its reading orientation so a confident sideways
pass does not suppress an upright pass. All locations still map to source pixels.

Institution-only cards require a compact name, numeric identifier and nearby
expiry wording before unlabeled identity suggestions appear. Explicit student,
employee, library and membership card wording is also supported. These are
unconfirmed layout candidates; plausible dates are excluded from bare IDs.

Labeled expiry dates preserve the entire calendar date or supported date range,
with calendar validation. Generic document expiry is not labeled as a payment-card
field. Month/year payment-card expiry remains supported.

The local barcode-region detector inspects horizontal and vertical stripe
patterns up to the existing sixteen-million-pixel image limit. Each pixel read
stays within four million pixels. Closely aligned numeric captions read by OCR
can be selected with the barcode; unrelated or distant text is excluded. No
payload is decoded, no external service is called, and no identity is inferred.

`tests/card-layout-recognition.spec.ts` uses fictional upright desktop and sideways
mobile cards. It checks real OCR, selectable findings, source-pixel alignment,
permanent coverage of names/IDs/full dates/bars/captions, unchanged neighboring
content and preview invalidation. This is regression coverage, not evidence that
every card layout or barcode can be recognized.
