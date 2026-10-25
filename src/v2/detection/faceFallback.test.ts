import {afterEach,expect,it,vi} from 'vitest';
const calls=vi.hoisted(()=>({initializationFails:false,primary:vi.fn(),fallback:vi.fn(),close:vi.fn()}));
vi.mock('@mediapipe/tasks-vision',()=>({FilesetResolver:{forVisionTasks:async()=>({})},FaceDetector:{createFromOptions:async()=>{
 if(calls.initializationFails)throw new Error('No WebGL');
 return {detect:calls.primary,close:calls.close};
}}}));
vi.mock('./cpuFaceModel',()=>({cpuFaceModel:async()=>({maxTiles:1,detect:calls.fallback})}));
afterEach(()=>vi.unstubAllGlobals());
it.each([false,true])('recovers from initialization or first-pixel failure with the actual model score (init=%s)',async initialFailure=>{
 vi.resetModules();calls.initializationFails=initialFailure;
 calls.primary.mockImplementation(()=>{throw new Error('WebGL context unavailable')});
 calls.fallback.mockResolvedValue({detections:[{boundingBox:{originX:30,originY:30,width:40,height:40},categories:[{score:.94}]}]});
 vi.stubGlobal('location',{origin:'https://example.test'});
 vi.stubGlobal('ImageData',class{constructor(public data:Uint8ClampedArray,public width:number,public height:number){}});
 const {localFaceDetector}=await import('./faceDetector');
 const faces=await localFaceDetector.detect({imageId:'cpu',imageWidth:128,imageHeight:128,imagePixels:{imageId:'cpu',width:128,height:128,
  readPixels:async r=>new ImageData(new Uint8ClampedArray(r.width*r.height*4),r.width,r.height)}});
 expect(faces.length).toBeGreaterThan(0);
 expect(faces.every(f=>f.entityClassificationConfidence===.94)).toBe(true);
 expect(calls.fallback.mock.calls.length).toBeGreaterThan(1);
 expect(calls.primary).toHaveBeenCalledTimes(initialFailure?0:1);
});
