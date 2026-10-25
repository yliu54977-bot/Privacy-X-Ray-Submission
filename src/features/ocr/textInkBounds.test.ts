import { expect, it } from 'vitest';
import { textInkBounds } from './textInkBounds';
function pixels(inverse=false) {
  const data=new Uint8ClampedArray(200*60*4).fill(inverse?0:255);
  // Fictional glyph omitted just before the reported word, another column far away.
  for(const [left,right] of [[42,48],[52,70],[120,130]])for(let y=22;y<35;y++)for(let x=left!;x<right!;x++){
    const at=(y*200+x)*4;data[at]=data[at+1]=data[at+2]=inverse?255:0;data[at+3]=255;
  }return data;
}
it('recovers nearby omitted strokes from pixels without crossing whitespace to another column',()=>{
  const box={x0:52,y0:20,x1:70,y1:36};
  expect(textInkBounds(pixels(),200,60,box)).toEqual({...box,x0:42});
});
it('supports reversed contrast and leaves whitespace and transcript-independent boxes unchanged',()=>{
  const box={x0:52,y0:20,x1:70,y1:36};
  expect(textInkBounds(pixels(true),200,60,box).x0).toBe(42);
  expect(textInkBounds(new Uint8ClampedArray(200*60*4).fill(255),200,60,box)).toEqual(box);
});
it('bounds work for huge boxes and does not grow past source edges',()=>{
  const huge={x0:0,y0:0,x1:200,y1:1000};expect(textInkBounds(pixels(),200,60,huge)).toEqual(huge);
  const edge=textInkBounds(pixels(),200,60,{x0:0,y0:20,x1:10,y1:36});expect(edge.x0).toBe(0);
});
