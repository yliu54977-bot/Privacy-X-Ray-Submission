import type { PixelRect } from '../../types';

/** Repartition oversized native-detail grids instead of skipping their middle cells.
 * Same 18-pass / 1.28 MP source-area bounds as the original detail stage. At 1.8×
 * this is <=4.15 MP per surface. Keep 20% overlap so crop edges are not blind seams.
 * Extremely thin inputs may not fit these bounds; callers retain bounded sampling.
 */
export function completeDetailGrid(width:number,height:number):PixelRect[] | undefined {
  if (![width,height].every(n=>Number.isFinite(n)&&n>0)) return undefined;
  const choices:{columns:number;rows:number;w:number;h:number;score:number}[]=[];
  for(let columns=1;columns<=18;columns++)for(let rows=1;rows*columns<=18;rows++){
    const w=Math.ceil(width/(columns-(columns-1)*.2));
    const h=Math.ceil(height/(rows-(rows-1)*.2));
    if(w*h>1_280_000||Math.max(w,h)>3000)continue;
    choices.push({columns,rows,w,h,score:columns*rows*10+Math.abs(Math.log(w/h/2))});
  }
  const best=choices.sort((a,b)=>a.score-b.score)[0];
  if(!best)return undefined;
  const axis=(extent:number,span:number,count:number)=>Array.from({length:count},(_,i)=>count===1?0:Math.round(i*(extent-span)/(count-1)));
  return axis(height,best.h,best.rows).flatMap(y=>axis(width,best.w,best.columns).map(x=>({x,y,width:best.w,height:best.h})));
}
