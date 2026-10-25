import { expect, it } from 'vitest';
import type { OcrResult, OcrWord } from '../../types';
import { layoutBox, originalLayoutBox, rememberOcrOrientation, ocrOrientation } from './ocrOrientation';
import { mergeDetailWords, wordsAsText } from './detailOcr';
import { detectUniversalPrivacy } from '../../v2/detection/detectUniversalPrivacy';
for(const rotation of ['clockwise','counterclockwise','upsideDown'] as const)it(`reads rotated labels and restores their original masks: ${rotation}`,async()=>{
  const width=rotation==='upsideDown'?1200:600,height=rotation==='upsideDown'?600:1200;
  const words:OcrWord[]=[{id:'label',lineId:'line',text:'Patient ID:',confidence:0.95,box:originalLayoutBox({x:100,y:100,width:120,height:24},1200,600,rotation)},
    {id:'value',lineId:'line',text:'MED8273649',confidence:0.95,box:originalLayoutBox({x:230,y:100,width:130,height:24},1200,600,rotation)}];
  const merged=mergeDetailWords([],words,{rotation,width,height});
  expect(wordsAsText(merged)).toBe('Patient ID: MED8273649');
  expect(merged[0]!.box).toEqual(words[0]!.box);
  const ocr:OcrResult=rememberOcrOrientation({imageId:'oriented',width,height,language:'eng',text:wordsAsText(merged),words:merged},rotation);
  expect(ocrOrientation(ocr)).toBe(rotation);
  expect(layoutBox(words[1]!.box,width,height,rotation)).toEqual({x:230,y:100,width:130,height:24});
  const detected=await detectUniversalPrivacy({imageId:'oriented',imageWidth:width,imageHeight:height,ocr});
  const patient=detected.findings.find(f=>f.value==='MED8273649');
  const mask = patient!.boxes![0]!, original = words[1]!.box;
  expect(mask.x).toBeLessThan(original.x);
  expect(mask.y).toBeLessThan(original.y);
  expect(mask.x + mask.width).toBeGreaterThan(original.x + original.width);
  expect(mask.y + mask.height).toBeGreaterThan(original.y + original.height);
  expect(mask.width * mask.height).toBeLessThan(original.width * original.height * 1.5);
  expect(patient?.evidence[0]?.boxes).toEqual([words[1]!.box]);
});
