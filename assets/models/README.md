# Local face detector assets

Runtime: `@mediapipe/tasks-vision@0.10.32` (Apache-2.0).
Model: MediaPipe BlazeFace short-range float16, version 1.
Source: https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
SHA-256: `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f`.

Official setup: https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js

The preparation script verifies this checksum and copies the model and pinned npm WASM files to same-origin public assets. Inputs remain local. This component locates possible faces, not people or protected attributes. It does not provide a face-recall guarantee, and small/occluded faces and nonhuman images may be missed.

## Pure CPU fallback

The pinned TensorFlow.js BlazeFace short-range model is served locally from
`vision/face-cpu/` when MediaPipe initialization or detection fails. Official source:
https://tfhub.dev/mediapipe/tfjs-model/face_detection/short/1

Apache-2.0; see MEDIAPIPE-LICENSE. Model JSON SHA-256:
`c131145fade749f714d39811f282e973760a69cb9e1a9c22f91e132bd8dcd396`; weights SHA-256:
`e9b69ee1c1f8cd33c58120bcd75bf8c56bfba20c880f447e9d293ec102059d4b`.
The preparation script verifies both. The pinned scored TFJS API preserves real
confidence values and the existing crop-confirmation thresholds. No image upload
or runtime third-party model fetch is introduced. Pure CPU inference can be slower.
