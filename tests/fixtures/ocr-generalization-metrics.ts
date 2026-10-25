import type { Annotation, Box } from './ocr-generalization';
export type LocatedWord = { id:string; text:string; box:Box; lineId:string };
export function editDistance<T>(a:readonly T[], b:readonly T[]):number {
  let row=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]!+1,row[j]!+1,row[j-1]!+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length]!;
}
export const compact=(text:string)=>Array.from(text.normalize('NFC').replace(/\s/gu,''));
// Segment CJK characters individually; preserve punctuation inside non-CJK whitespace tokens.
export const tokens=(text:string)=>text.normalize('NFC').match(/[\u3400-\u9fff]|[^\s\u3400-\u9fff]+/gu)??[];
export const contains=(b:Box,x:number,y:number)=>x>=b.x&&x<b.x+b.width&&y>=b.y&&y<b.y+b.height;
export function overlap(a:Box,b:Box):number{return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));}
/** Geometry only: a word is assigned to at most one annotation, without using expected text. */
export function matchWords(words:readonly LocatedWord[], annotations:readonly Annotation[]) {
  const byLine:LocatedWord[][]=annotations.map(()=>[]);const unmatched:LocatedWord[]=[];
  for(const word of words){let best=-1,score=0;for(const [i,a] of annotations.entries()){
    const intersection=overlap(word.box,a.box),ratio=intersection/(word.box.width*word.box.height);
    const center=contains(a.box,word.box.x+word.box.width/2,word.box.y+word.box.height/2);
    if((center&&ratio>=.15||ratio>=.6)&&ratio>score){best=i;score=ratio;}
  }if(best<0)unmatched.push(word);else byLine[best]!.push(word);}
  byLine.forEach((line,i)=>{const r=annotations[i]!.angle*Math.PI/180;line.sort((a,b)=>(a.box.x+a.box.width/2-b.box.x-b.box.width/2)*Math.cos(r)+(a.box.y+a.box.height/2-b.box.y-b.box.height/2)*Math.sin(r));});
  return {byLine,unmatched};
}
export function textMetrics(expected:string,actual:string){const e=compact(expected),a=compact(actual),et=tokens(expected),at=tokens(actual);return {characterEdits:editDistance(e,a),expectedCharacters:e.length,tokenEdits:editDistance(et,at),expectedTokens:et.length,exactLine:e.join('')===a.join('')};}
export function summarize(lines:{located:boolean;characterEdits:number;expectedCharacters:number;tokenEdits:number;expectedTokens:number;exactLine:boolean;inkPixels:number;rawCovered:number;wordCovered:number;lineCovered:number}[]){
 const sum=(key:'characterEdits'|'expectedCharacters'|'tokenEdits'|'expectedTokens'|'inkPixels'|'rawCovered'|'wordCovered'|'lineCovered')=>lines.reduce((n,l)=>n+l[key],0);
 const ink=sum('inkPixels'),matched=lines.filter(l=>l.located),matchedInk=matched.reduce((n,l)=>n+l.inkPixels,0);
 return {expectedLines:lines.length,locatedLines:matched.length,regionRecall:matched.length/Math.max(1,lines.length),exactLines:lines.filter(l=>l.exactLine).length,compactCER:sum('characterEdits')/Math.max(1,sum('expectedCharacters')),tokenWER:sum('tokenEdits')/Math.max(1,sum('expectedTokens')),rawInkCoverage:sum('rawCovered')/Math.max(1,ink),wordExportInkCoverage:sum('wordCovered')/Math.max(1,ink),lineExportInkCoverage:sum('lineCovered')/Math.max(1,ink),matchedWordExportInkCoverage:matchedInk?matched.reduce((n,l)=>n+l.wordCovered,0)/matchedInk:null,matchedLineExportInkCoverage:matchedInk?matched.reduce((n,l)=>n+l.lineCovered,0)/matchedInk:null};
}
