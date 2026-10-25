# Optional public face test fixture

The real-model browser tests use the MediaPipe example portrait at:
https://storage.googleapis.com/mediapipe-assets/portrait.jpg

SHA-256: `a6f11efaa834706db23f275b6115058fa87fc7f14362681e6abe14e82749de3e`.

Run `npm run prepare:test-fixtures` to fetch this checksum-pinned file before the browser acceptance suite. The image is excluded from Git and from production assets. It is an upstream public test resource, not a user upload and not an image released under this project's MIT license. This repository does not redistribute it. Preserve the upstream source and applicable terms when using it beyond these tests.

The tests only check possible face-region geometry and covered pixels. They do not identify the person or infer personal attributes. Reference implementation: https://github.com/google-ai-edge/mediapipe.
