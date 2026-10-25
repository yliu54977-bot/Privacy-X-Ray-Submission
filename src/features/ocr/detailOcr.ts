import { layoutBox } from './ocrOrientation';
import type { OcrRotation } from './ocrGeometry';
import type { OcrWord, PixelRect } from '../../types';

/** Bounded native-image windows; used when overview OCR cannot sufficiently enlarge the source. */
export function ocrDetailTiles(width: number, height: number): PixelRect[] {
  const axis=(extent:number,size:number,overlap:number)=>{
    const span=Math.min(size,extent), values=[0];
    while(values[values.length-1]!+span<extent) values.push(Math.min(extent-span,values[values.length-1]!+size-overlap));
    return values;
  };
  const all:PixelRect[]=[];
  for(const y of axis(height,800,160))for(const x of axis(width,1600,320))all.push({x,y,width:Math.min(1600,width),height:Math.min(800,height)});
  return all.length<=18?all:Array.from({length:18},(_,i)=>all[Math.round(i*(all.length-1)/17)]!);
}

const normalized=(text:string)=>text.replace(/\s/g,'').toLocaleLowerCase();
function overlap(a:PixelRect,b:PixelRect){
  const area=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  return area/Math.min(a.width*a.height,b.width*b.height);
}

/** Merge only actual OCR words. Spatial indexing bounds duplicate matching on dense documents. */
export function mergeDetailWords(base:readonly OcrWord[], detail:readonly OcrWord[], layout?:{rotation:OcrRotation;width:number;height:number}):OcrWord[]{
  const words=[...base], active=new Set<number>(), grid=new Map<string,Set<number>>();
  const cells=(box:PixelRect)=>{
    const keys:string[]=[];
    for(let y=Math.floor(box.y/128);y<=Math.floor((box.y+box.height)/128);y++)
      for(let x=Math.floor(box.x/128);x<=Math.floor((box.x+box.width)/128);x++)keys.push(`${x}:${y}`);
    return keys;
  };
  const index=(word:OcrWord,i:number)=>{active.add(i);for(const key of cells(word.box)){
    const bucket=grid.get(key)??new Set<number>();bucket.add(i);grid.set(key,bucket);
  }};
  words.forEach(index);
  for(const word of detail){
    if(!Number.isFinite(word.confidence)||word.confidence<0.65||!word.text.trim())continue;
    const possible=new Set(cells(word.box).flatMap(key=>[...(grid.get(key)??[])]));
    const matching=[...possible].filter(i=>active.has(i)&&overlap(word.box,words[i]!.box)>0.6);
    if(matching.length){
      const previous=matching.map(i=>words[i]!).sort((a,b)=>a.box.x-b.box.x);
      const confidence=previous.reduce((sum,w)=>sum+w.confidence,0)/previous.length;
      const same=normalized(previous.map(w=>w.text).join(''))===normalized(word.text);
      if(!(same&&word.confidence>=confidence-0.05)&&!(word.confidence>=0.85&&word.confidence>=confidence-0.05))continue;
      matching.forEach(i=>active.delete(i));
    }
    words.push(word);index(word,words.length-1);
  }
  return readingOrder([...active].map(i=>words[i]!),layout);
}
export function readingOrder(words:readonly OcrWord[],layout?:{rotation:OcrRotation;width:number;height:number}):OcrWord[]{
  const positioned=words.map(word=>({word,box:layout?layoutBox(word.box,layout.width,layout.height,layout.rotation):word.box}));
  const rows:typeof positioned[]=[];
  for(const item of positioned.sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x)){
    const row=rows.find(row=>Math.abs(row[0]!.box.y+row[0]!.box.height/2-item.box.y-item.box.height/2)<=Math.min(row[0]!.box.height,item.box.height)*0.5);
    if(row)row.push(item);else rows.push([item]);
  }
  let id=0;
  return rows.flatMap((row,line)=>row.sort((a,b)=>a.box.x-b.box.x).map(({word})=>({...word,id:`word-${id++}`,lineId:`line-${line}`})));
}
export function wordsAsText(words:readonly OcrWord[]):string{
  let previous='',text='';
  for(const word of words){text+=text?(word.lineId===previous?' ':'\n'):'';text+=word.text;previous=word.lineId;}
  return text;
}

/** Reject clipped crop-edge fragments; an overlapping window can supply the whole word. */
export function completeDetailWord(word:OcrWord, region:PixelRect, width:number, height:number):boolean{
  const b=word.box;
  return !(region.x>0&&b.x<=3 || region.y>0&&b.y<=3 || region.x+region.width<width&&b.x+b.width>=region.width-3 || region.y+region.height<height&&b.y+b.height>=region.height-3);
}
