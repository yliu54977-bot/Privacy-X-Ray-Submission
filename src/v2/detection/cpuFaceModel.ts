import { localAssetUrl } from '../../localAssets';

/** Same-origin, pure JavaScript CPU fallback for browsers without WebGL contexts. */
export async function cpuFaceModel() {
  const tf = await import('@tensorflow/tfjs-core');
  await import('@tensorflow/tfjs-backend-cpu');
  // Import only the pinned TFJS backend, avoiding the unused legacy MediaPipe runtime.
  const {load} = await import('@tensorflow-models/face-detection/dist/tfjs/detector');
  await tf.setBackend('cpu');
  await tf.ready();
  const model = await load({
    runtime:'tfjs',modelType:'short',maxFaces:32,
    detectorModelUrl:localAssetUrl('vision/face-cpu/model.json'),
  });
  // The public TFJS-specific detectFaces API preserves model confidence scores;
  // estimateFaces strips them while converting its result to display landmarks.
  const scored = model as import('@tensorflow-models/face-detection/dist/tfjs/detector').MediaPipeFaceDetectorTfjs;
  if (typeof scored.detectFaces !== 'function') throw new Error('Scored CPU face detection is unavailable.');
  return {
    maxTiles:96,
    async detect(pixels:ImageData) {
      const faces=await scored.detectFaces(pixels, false);
      return {detections:faces.flatMap(face=>{
        const box=face.locationData.relativeBoundingBox;
        if (!box || !face.score?.length) return [];
        return [{
          boundingBox:{originX:box.xMin*pixels.width,originY:box.yMin*pixels.height,
            width:box.width*pixels.width,height:box.height*pixels.height},
          categories:face.score.map(score=>({score})),
        }];
      })};
    },
  };
}
