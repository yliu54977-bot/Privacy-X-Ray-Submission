import type { OcrWord, PixelRect } from '../../types';

/** Find fragmented vertical runs, not arbitrary document regions. This only schedules
 * real local OCR; it neither rotates the source nor guesses any recognized string. */
export function orientationRegions(words:readonly OcrWord[],width:number,height:number):PixelRect[]{
 const short=words.filter(w=>w.text.trim().length>0&&w.text.trim().length<=3&&w.box.width<100&&w.box.height<150);
 const columns:OcrWord[][]=[];
 for(const word of [...short].sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x)){
  const column=columns.find(col=>{const last=col.at(-1)!;return Math.abs(last.box.x+last.box.width/2-word.box.x-word.box.width/2)<Math.max(last.box.width,word.box.width)*.6 &&
   word.box.y-last.box.y-last.box.height>=-Math.max(last.box.height,word.box.height)*.8 && word.box.y-last.box.y-last.box.height<Math.max(last.box.height,word.box.height)*1.6;});
  if(column)column.push(word);else columns.push([word]);
 }
 return columns.filter(col=>col.length>=4&&col.filter(w=>/[\p{L}]/u.test(w.text)).length>=2&&col.reduce((n,w)=>n+w.confidence,0)/col.length<.85).sort((a,b)=>b.length-a.length).flatMap(col=>{
  const x=Math.min(...col.map(w=>w.box.x)),y=Math.min(...col.map(w=>w.box.y));
  const right=Math.max(...col.map(w=>w.box.x+w.box.width)),bottom=Math.max(...col.map(w=>w.box.y+w.box.height));
  if(bottom-y<(right-x)*3||bottom-y>1600)return [];
  // Two glyph widths along the run recover crop-end characters missing from
  // the initial fragmented OCR. Across the run keep the narrower column guard.
  const pad=Math.min(32,Math.max(8,right-x)),along=pad*2;const left=Math.max(0,Math.floor(x-pad)),top=Math.max(0,Math.floor(y-along));
  return [{x:left,y:top,width:Math.min(width,Math.ceil(right+pad))-left,height:Math.min(height,Math.ceil(bottom+along))-top}];
 }).slice(0,4);
}
export function insideRegion(word:OcrWord,region:PixelRect):boolean{
 return word.box.x>=region.x&&word.box.y>=region.y&&word.box.x+word.box.width<=region.x+region.width&&word.box.y+word.box.height<=region.y+region.height;
}
