import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({detectFaces:vi.fn(),createDetector:vi.fn()}));
vi.mock('@tensorflow/tfjs-core',()=>({setBackend:async()=>true,ready:async()=>{}}));
vi.mock('@tensorflow/tfjs-backend-cpu',()=>({}));
vi.mock('@tensorflow-models/face-detection/dist/tfjs/detector',()=>({load:mocks.createDetector}));
import {cpuFaceModel} from './cpuFaceModel';
afterEach(()=>vi.unstubAllGlobals());
it('preserves real scores and converts normalized detections to source pixels without mutating them',async()=>{
 vi.stubGlobal('location',{origin:'https://example.test'});
 const detection={score:[.93],locationData:{relativeBoundingBox:{xMin:.2,yMin:.3,width:.25,height:.4}}};
 mocks.detectFaces.mockResolvedValue([detection,{locationData:{}},{score:[],locationData:detection.locationData}]);
 mocks.createDetector.mockResolvedValue({detectFaces:mocks.detectFaces});
 const model=await cpuFaceModel();
 expect(mocks.createDetector).toHaveBeenCalledWith(expect.objectContaining({runtime:'tfjs',detectorModelUrl:'https://example.test/vision/face-cpu/model.json'}));
 const pixels={width:1000,height:500} as ImageData;
 const result=await model.detect(pixels);
 expect(result.detections).toEqual([{boundingBox:{originX:200,originY:150,width:250,height:200},categories:[{score:.93}]}]);
 expect(detection.locationData.relativeBoundingBox.xMin).toBe(.2);
 expect(mocks.detectFaces).toHaveBeenCalledWith(pixels,false);
});
it('fails explicitly if a dependency no longer exposes its scored detection API',async()=>{
 vi.stubGlobal('location',{origin:'https://example.test'});
 mocks.createDetector.mockResolvedValue({estimateFaces:vi.fn()});
 await expect(cpuFaceModel()).rejects.toThrow('Scored CPU face detection is unavailable');
});
