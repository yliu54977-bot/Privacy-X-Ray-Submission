import { expect,test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cases } from './fixtures/ocr-generalization';
import { releaseCases } from './fixtures/ocr-release-candidate';
import { compact,editDistance,matchWords,textMetrics } from './fixtures/ocr-generalization-metrics';

test('generalization metric primitives preserve misses and conservative spatial matches',()=>{
 expect(editDistance(compact('甲乙 A'),compact('甲丙 B'))).toBe(2);
 expect(textMetrics('one two','').tokenEdits).toBe(2);
 const annotations=[{text:'secret',angle:90,box:{x:10,y:10,width:20,height:100}}];
 const word=(id:string,x:number,y:number)=>({id,text:'unrelated',lineId:'l',box:{x,y,width:10,height:10}});
 const matches=matchWords([word('lower',15,60),word('upper',15,20),word('outside',100,20)],annotations);
 expect(matches.byLine[0]!.map(w=>w.id)).toEqual(['upper','lower']);expect(matches.unmatched.map(w=>w.id)).toEqual(['outside']);
});

test('generalization benchmark measures real OCR and exported pixels',async({page,browser},info)=>{
 test.skip(!process.env.OCR_GENERALIZATION,'Explicit development/heldout benchmark only.');test.setTimeout(600_000);
 const release=process.env.OCR_GENERALIZATION==='release';
 const split=release?'release':process.env.OCR_GENERALIZATION==='confirmation'?'confirmation':process.env.OCR_GENERALIZATION==='heldout'?'heldout':'development';
 const label=process.env.BENCHMARK_LABEL??'current';
 const cdp=await browser.newBrowserCDPSession();let active='',sampling=false;
 const rss:Record<string,{peakBytes:number;samples:number}>={};
 const sample=async()=>{if(sampling||!active)return;sampling=true;const id=active;try{const p=await cdp.send('SystemInfo.getProcessInfo');const {stdout}=await promisify(execFile)('ps',['-o','rss=','-p',p.processInfo.map(p=>p.id).join(',')]);const n=stdout.trim().split(/\s+/).reduce((s,n)=>s+Number(n)*1024,0);rss[id]={peakBytes:Math.max(rss[id]?.peakBytes??0,n),samples:(rss[id]?.samples??0)+1};}catch{/* Unsupported measurement remains null. */}finally{sampling=false;}};
 await page.exposeFunction('generalizationPhase',(id:string)=>{active=id;});
 await page.goto('/');const timer=setInterval(()=>void sample(),200);const results=[];
 const specs=(release?releaseCases():cases(split as 'development'|'heldout'|'confirmation')).filter(s=>!process.env.OCR_CATEGORY||s.category===process.env.OCR_CATEGORY);
 try{for(const spec of specs){
 const result=await page.evaluate(async spec=>{
  const {renderFixture}=await import(spec.id.startsWith('release-')?'/tests/fixtures/ocr-release-candidate.ts':'/tests/fixtures/ocr-generalization.ts');
  const {matchWords,textMetrics,contains,summarize}=await import('/tests/fixtures/ocr-generalization-metrics.ts');
  const {scanImage}=await import('/src/features/ocr/scanImage.ts');
  const {recognizeContent,selectionBoxes}=await import('/src/features/recognition/content.ts');
  const {redactImage}=await import('/src/features/export/redactImage.ts');
  await (window as unknown as {generalizationPhase:(id:string)=>Promise<void>}).generalizationPhase(spec.id);
  const {canvas,ink,annotations}=await renderFixture(spec);const totalStart=performance.now();
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Fixture encoding failed')),'image/png'));
  const image={id:spec.id,file:new File([blob],'fictional.png',{type:'image/png'}),previewUrl:URL.createObjectURL(blob),width:canvas.width,height:canvas.height,mimeType:'image/png' as const};
  try{
   const slopeAttempts:{milliseconds:number;selected:boolean}[]=[];
   const start=performance.now();const ocr=await scanImage(image,()=>{},new AbortController().signal,{mixedChineseEnglish:true,enhanceLowContrast:true,upscaleSmallText:true,adaptiveRescan:true,detailRescan:true,generalContent:true,onMeasuredSlopeTiming:(milliseconds,selected)=>slopeAttempts.push({milliseconds,selected})});const ocrMs=performance.now()-start;
   const normalize=performance.now();const content=recognizeContent(ocr);const normalizationMs=performance.now()-normalize;
   const matched=matchWords(content.words,annotations);const matchedIds=new Set(matched.byLine.flatMap(l=>l.map(w=>w.id)));
   const words=content.words.filter(w=>matchedIds.has(w.id));const lineIds=new Set(words.map(w=>w.lineId));
   const wordBoxes=selectionBoxes(content,words.map(w=>({kind:'word' as const,id:w.id})),image.id);
   const lineBoxes=selectionBoxes(content,content.lines.filter(l=>lineIds.has(l.id)).map(l=>({kind:'line' as const,id:l.id})),image.id);
   const exportStart=performance.now();
   const decodeExport=async(boxes:typeof wordBoxes)=>{const png=await redactImage(image,boxes.map((b,i)=>({...b,id:`m-${i}`,imageId:image.id,source:'manual' as const,shouldRedact:true})));const bitmap=await createImageBitmap(png);const output=document.createElement('canvas');output.width=image.width;output.height=image.height;output.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close();return output;};
   const wordPng=await decodeExport(wordBoxes),linePng=await decodeExport(lineBoxes);const exportMs=performance.now()-exportStart;
   const lineTargets=new Map<string,Set<number>>();matched.byLine.forEach((ws,i)=>ws.forEach(w=>{const s=lineTargets.get(w.lineId)??new Set<number>();s.add(i);lineTargets.set(w.lineId,s);}));
   const lines=annotations.map((a,index)=>{
    const ws=matched.byLine[index]!,actual=ws.map(w=>w.text).join(' '),b=a.box;
    const x=Math.max(0,Math.floor(b.x)),y=Math.max(0,Math.floor(b.y)),width=Math.max(0,Math.min(image.width,Math.ceil(b.x+b.width))-x),height=Math.max(0,Math.min(image.height,Math.ceil(b.y+b.height))-y);
    let inkPixels=0,rawCovered=0,wordCovered=0,lineCovered=0;
    if(width&&height){const intended=ink.getContext('2d')!.getImageData(x,y,width,height).data,wpx=wordPng.getContext('2d')!.getImageData(x,y,width,height).data,lpx=linePng.getContext('2d')!.getImageData(x,y,width,height).data;
     for(let py=0;py<height;py++)for(let px=0;px<width;px++){const i=(py*width+px)*4;if(intended[i+3]!<32)continue;inkPixels++;if(!ws.length)continue;const xx=x+px+.5,yy=y+py+.5;
      if(ws.some(w=>contains(w.box,xx,yy)))rawCovered++;
      // Require an actual selected region AND decoded opaque black PNG pixels. Source-black ink alone cannot pass.
      if(wordBoxes.some(b=>contains(b,xx,yy))&&wpx[i]===0&&wpx[i+1]===0&&wpx[i+2]===0&&wpx[i+3]===255)wordCovered++;
      if(lineBoxes.some(b=>contains(b,xx,yy))&&lpx[i]===0&&lpx[i+1]===0&&lpx[i+2]===0&&lpx[i+3]===255)lineCovered++;
     }
    }
    const tm=textMetrics(a.text,actual),ids=[...new Set(ws.map(w=>w.lineId))];
    return {index,...(!tm.exactLine?{fictionalExpected:a.text,fictionalActual:actual,fictionalWords:ws.map(w=>({text:w.text,box:w.box}))}:{}),located:!!ws.length,...tm,matchedWords:ws.length,inkPixels,rawCovered,wordCovered,lineCovered,rawInkCoverage:inkPixels?rawCovered/inkPixels:0,wordExportInkCoverage:inkPixels?wordCovered/inkPixels:0,lineExportInkCoverage:inkPixels?lineCovered/inkPixels:0,splitAcrossLines:ids.length>1,mergedWithOtherAnnotations:ids.some(id=>(lineTargets.get(id)?.size??0)>1)};
   });
   const exposure=content.words.filter(w=>!content.lines.some(l=>l.wordIds.includes(w.id))||!content.groups.some(g=>g.wordIds.includes(w.id))).length;
   const result={id:spec.id,slopeAttempts,fictionalUnmatched:content.words.filter(w=>matched.unmatched.some(m=>m.id===w.id)).map(w=>({text:w.text,box:w.box,confidence:w.confidence})),category:spec.category,variant:spec.variant,...summarize(lines),lines,words:content.words.length,unmatchedOcrWords:matched.unmatched.length,duplicatesRemoved:content.diagnostics.duplicateWords,invalidWords:content.diagnostics.invalidWords,
    failures:{A_missingRegion:lines.filter(l=>!l.located).length,B_transcription:lines.filter(l=>l.located&&!l.exactLine).length,D_rawGeometry:lines.filter(l=>l.located&&l.rawInkCoverage<.99).length,F_exportCoverage:lines.filter(l=>l.located&&l.lineExportInkCoverage<.999).length,C_grouping:lines.filter(l=>l.splitAcrossLines||l.mergedWithOtherAnnotations).length,E_selectionExposure:exposure},
    ocrMs,normalizationMs,exportMs,totalMs:performance.now()-totalStart,readingAngle:ocr.readingAngle??0,mainThreadHeapBytes:(performance as Performance & {memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize??null};
   wordPng.width=wordPng.height=linePng.width=linePng.height=0;return result;
  }finally{URL.revokeObjectURL(image.previewUrl);canvas.width=canvas.height=ink.width=ink.height=0;}
 },spec);
 results.push({...result,browserProcessRss:rss[spec.id]??null});console.log('OCR_GENERALIZATION_CASE',JSON.stringify({label,split,...results.at(-1)}));
 }}finally{clearInterval(timer);await cdp.detach();}
 const report={label,split,matching:'Unique spatial assignment: center inside with >=15% word overlap, or >=60% word overlap; order projected onto annotation angle. No expected text enters OCR.',memory:'200ms sampled aggregate Chromium-process RSS; includes shared pages, not unique physical memory or exact peak.',failures:'A missing OCR region; B transcription; C split/merged annotation lines; D raw geometry misses >=1% intended ink; E word absent from selectable line/group; F selected line PNG misses >=0.1% ink.',results};
 await info.attach(`ocr-generalization-${label}-${split}.json`,{body:JSON.stringify(report,null,2),contentType:'application/json'});
 expect(results).toHaveLength(specs.length);for(const r of results){expect(r.invalidWords).toBe(0);if(release){expect(r.wordExportInkCoverage).toBe(1);expect(r.lineExportInkCoverage).toBe(1);}expect(r.ocrMs).toBeGreaterThan(0);expect(r.lines.every(l=>l.located||l.rawCovered+l.wordCovered+l.lineCovered===0)).toBe(true);}
});
