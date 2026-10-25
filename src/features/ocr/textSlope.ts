import type { OcrWord } from '../../types';
const median = (values: number[]) => { const sorted = [...values].sort((a,b)=>a-b); return sorted[Math.floor(sorted.length/2)]!; };
/** A bounded deskew proposal from several agreeing OCR lines. No text templates,
 * document classification or guessed values enter this geometric estimate. */
export function textSlopeCorrection(words: readonly OcrWord[]): number | undefined {
  const lines = new Map<string, OcrWord[]>();
  for (const word of words) {
    if (!word.lineId || word.confidence < .55 || word.text.trim().length < 2) continue;
    const line = lines.get(word.lineId) ?? []; line.push(word); lines.set(word.lineId,line);
  }
  const angles: number[] = [];
  for (const line of lines.values()) {
    if (line.length < 3 || line.length > 64) continue;
    const height = median(line.map(w=>w.box.height));
    const sorted = [...line].sort((a,b)=>a.box.x-b.box.x);
    // Large gaps can join unrelated columns into an apparent slanted line.
    if (sorted.some((w,i)=>i>0 && w.box.x-sorted[i-1]!.box.x-sorted[i-1]!.box.width>height*4)) continue;
    const slopes: number[] = [];
    for (let i=0;i<sorted.length;i++) for(let j=i+1;j<sorted.length;j++) {
      const a=sorted[i]!.box,b=sorted[j]!.box;
      const dx=b.x+b.width/2-a.x-a.width/2;
      if (dx < height*4) continue;
      slopes.push(Math.atan2(b.y+b.height/2-a.y-a.height/2,dx)*180/Math.PI);
    }
    if (slopes.length) {
      const angle=median(slopes);
      if (median(slopes.map(s=>Math.abs(s-angle)))<=1.5) angles.push(angle);
      if (angles.length>=128) break;
    }
  }
  if (angles.length<3) return;
  const angle=median(angles),agree=angles.filter(a=>Math.abs(a-angle)<=1.5);
  if(agree.length<3 || agree.length/angles.length<.75 || Math.abs(angle)<2 || Math.abs(angle)>12) return;
  return -Math.round(median(agree)*2)/2;
}
