export interface EngineBox { x0:number; y0:number; x1:number; y1:number }
/** Follow nearby ink across a short gap, within one glyph height of the OCR box.
 * Never reconstruct characters or bridge a column. The original transcript is unchanged.
 * Both dark-on-light and light-on-dark text are supported; texture can still mislead it. */
export function textInkBounds(pixels: Uint8ClampedArray, width:number, height:number, box:EngineBox): EngineBox {
  const glyph = box.y1 - box.y0;
  if (glyph < 3 || glyph > 256 || box.x1 <= box.x0) return box;
  const reach = Math.min(96, Math.ceil(glyph * 1.2));
  const left = Math.max(0,Math.floor(box.x0)-reach), right = Math.min(width,Math.ceil(box.x1)+reach);
  const top = Math.max(0,Math.floor(box.y0)-2), bottom = Math.min(height,Math.ceil(box.y1)+2);
  if (right <= left || bottom <= top || (right-left)*(bottom-top)>300_000) return box;
  const gray = (x:number,y:number) => {const i=(y*width+x)*4;return .2126*pixels[i]!+.7152*pixels[i+1]!+.0722*pixels[i+2]!;};
  const borders:number[]=[];
  for(let x=left;x<right;x+=Math.max(1,Math.floor((right-left)/40))) {borders.push(gray(x,top),gray(x,bottom-1));}
  borders.sort((a,b)=>a-b);const background=borders[Math.floor(borders.length/2)]!;
  const ink = (x:number) => {
    let count=0;
    for(let y=Math.max(0,Math.floor(box.y0));y<Math.min(height,Math.ceil(box.y1));y++) {
      const value=gray(x,y);
      if(background>=128 ? value<background-24 : value>background+24) count++;
    }
    return count>=Math.max(1,Math.floor(glyph*.08));
  };
  const maxGap=Math.max(2,Math.ceil(glyph*.35));
  let x0=box.x0,x1=box.x1,gap=0;
  for(let x=Math.min(width-1,Math.floor(box.x0)-1);x>=left;x--) {
    if(ink(x)){x0=x;gap=0;}else if(++gap>maxGap)break;
  }
  gap=0;
  for(let x=Math.max(0,Math.ceil(box.x1));x<right;x++) {
    if(ink(x)){x1=x+1;gap=0;}else if(++gap>maxGap)break;
  }
  return {...box,x0,x1};
}
