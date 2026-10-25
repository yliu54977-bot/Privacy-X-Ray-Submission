import type { OcrResult, PixelRect } from '../../types';
import type { OcrRotation } from './ocrGeometry';
import { uprightOcrBox } from './ocrGeometry';
// Ephemeral metadata; shared contracts and serialized data are unchanged.
const rotations=new WeakMap<OcrResult,OcrRotation>();
export function rememberOcrOrientation(result:OcrResult,rotation:OcrRotation):OcrResult{
  if(rotation!=='none')rotations.set(result,rotation);return result;
}
export const ocrOrientation=(ocr:OcrResult|undefined):OcrRotation=>ocr?rotations.get(ocr)??'none':'none';
export function layoutBox(box:PixelRect,width:number,height:number,rotation:OcrRotation):PixelRect{
  if(rotation==='clockwise')return{x:height-box.y-box.height,y:box.x,width:box.height,height:box.width};
  if(rotation==='counterclockwise')return{x:box.y,y:width-box.x-box.width,width:box.height,height:box.width};
  if(rotation==='upsideDown')return{x:width-box.x-box.width,y:height-box.y-box.height,width:box.width,height:box.height};
  return box;
}
export function originalLayoutBox(box:PixelRect,uprightWidth:number,uprightHeight:number,rotation:OcrRotation):PixelRect{
  const b=uprightOcrBox({x0:box.x,y0:box.y,x1:box.x+box.width,y1:box.y+box.height},uprightWidth,uprightHeight,rotation);
  return{x:b.x0,y:b.y0,width:b.x1-b.x0,height:b.y1-b.y0};
}
