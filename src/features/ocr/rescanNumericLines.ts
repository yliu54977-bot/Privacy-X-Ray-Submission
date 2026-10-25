import {PSM, type Page, type Worker, type Word} from 'tesseract.js';
import {repeatedDigitGroups} from './recognitionQuality';
const suspicious = (words: readonly Word[]) => words.every(w=>/^\d+$/.test(w.text.trim())) &&
  repeatedDigitGroups(words.map(w=>({text:w.text,lineId:'candidate'})));
const quality = (words: readonly Word[]) => words.reduce((sum,w)=>sum+w.text.length*Math.max(0,w.confidence)/100,0);

/** At most two local single-line reads for collapsed repeated glyph groups.
 * Uses only newly recognized text. No digit insertion, checksums or document labels. */
export async function rescanNumericLines(worker:Worker,data:Page,surface:HTMLCanvasElement,signal:AbortSignal):Promise<Page> {
  const lines=(data.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines));
  const targets=lines.filter(line=>suspicious(line.words)).slice(0,2);
  if(!targets.length)return data;
  const replacements=new Map<typeof lines[number],typeof lines[number]>();
  try{
    await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_LINE});
    for(const line of targets){
      if(signal.aborted)throw new Error('Scan cancelled.');
      const b=line.bbox,margin=Math.max(4,b.y1-b.y0);
      const x=Math.max(0,Math.floor(b.x0-margin)),y=Math.max(0,Math.floor(b.y0-margin*.5));
      const width=Math.min(surface.width,Math.ceil(b.x1+margin))-x,height=Math.min(surface.height,Math.ceil(b.y1+margin*.5))-y;
      if(width<=0||height<=0||width*height>1_000_000)continue;
      const crop=document.createElement('canvas');
      const scale=Math.min(1,18/Math.max(1,b.y1-b.y0));
      crop.width=Math.max(1,Math.round(width*scale));crop.height=Math.max(1,Math.round(height*scale));
      try{
        crop.getContext('2d')!.drawImage(surface,x,y,width,height,0,0,crop.width,crop.height);
        const candidate=(await worker.recognize(crop,{}, {blocks:true,text:true})).data;
        if(signal.aborted)throw new Error('Scan cancelled.');
        const candidateLines=(candidate.blocks??[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines)).filter(l=>l.words.length);
        if(candidateLines.length!==1)continue;
        const words=candidateLines[0]!.words;
        if(!words.length||!words.every(w=>/^\d+$/.test(w.text.trim()))||quality(words)<=quality(line.words))continue;
        const translate=(box:typeof b)=>({x0:box.x0*width/crop.width+x,y0:box.y0*height/crop.height+y,x1:box.x1*width/crop.width+x,y1:box.y1*height/crop.height+y});
        const mapped=words.map(w=>({...w,bbox:translate(w.bbox),symbols:w.symbols?.map(s=>({...s,bbox:translate(s.bbox)}))??[]}));
        // A crop can contain neighbouring numeric rows or columns. Only retain
        // words on the original baseline and within a small edge allowance.
        const tolerance=Math.max(2,(b.y1-b.y0)*.25);
        if(mapped.some(w=>{const r=w.bbox;return !Object.values(r).every(Number.isFinite)||r.x1<=r.x0||r.y1<=r.y0||
          r.x0<b.x0-tolerance||r.x1>b.x1+tolerance||r.y0<b.y0-tolerance||r.y1>b.y1+tolerance;}))continue;
        replacements.set(line,{...line,words:mapped,text:words.map(w=>w.text).join(' ')+'\n'});
      }finally{crop.width=crop.height=0;}
    }
  }catch{
    if(signal.aborted)throw new Error('Scan cancelled.');
    return data; // Optional enhancement must not discard a successful initial scan.
  }finally{
    try{await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});}catch{ /* Worker is disposed by the caller; keep recognized text. */ }
  }
  if(!replacements.size)return data;
  const blocks=data.blocks!.map(block=>({...block,paragraphs:block.paragraphs.map(p=>({...p,lines:p.lines.map(line=>replacements.get(line)??line)}))}));
  return {...data,blocks,text:blocks.map(b=>b.paragraphs.map(p=>p.lines.map(l=>l.text.trimEnd()).join('\n')).join('\n\n')).join('\n\n')};
}
