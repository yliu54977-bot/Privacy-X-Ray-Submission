# Local face detector assets

Runtime: `@mediapipe/tasks-vision@0.10.32` (Apache-2.0).
Model: MediaPipe BlazeFace short-range float16, version 1.
Source: https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
SHA-256: `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f`.

Official setup: https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js

The preparation script verifies this checksum and copies the model and pinned npm WASM files to same-origin public assets. Inputs remain local. This component locates possible faces, not people or protected attributes. It does not provide a face-recall guarantee, and small/occluded faces and nonhuman images may be missed.
