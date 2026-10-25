import {expect,test} from '@playwright/test';

test('measured slope retains new fictional text and original-pixel coverage',async({page})=>{
 test.setTimeout(120000);await page.goto('/');
 const results=await page.evaluate(async()=>{
  const {scanContent}=await import('/src/features/recognition/scanContent.ts');
  const {recognizeContent,selectionBoxes}=await import('/src/features/recognition/content.ts');
  const {redactImage}=await import('/src/features/export/redactImage.ts');
  const {matchWords,textMetrics,contains}=await import('/tests/fixtures/ocr-generalization-metrics.ts');
  const results=[];
  // New fictional prose, both directions and near-horizontal controls. These
  // are rasterized probes, not photographs or independently verified ground truth.
  const lines=['Workshop registration opens tomorrow','Please collect the blue envelope','Room 482 on the upper floor','The afternoon session starts at two','Contact workshop@example.test'];
  for(const angle of [-11,-3,0,3,11]){
   const canvas=document.createElement('canvas'),ink=document.createElement('canvas');
   canvas.width=ink.width=1100;canvas.height=ink.height=780;
   const ctx=canvas.getContext('2d')!,ic=ink.getContext('2d')!;ctx.fillStyle='#ece8df';ctx.fillRect(0,0,1100,780);
   const annotations=[];
   for(let i=0;i<lines.length;i++){
    const x=85,y=190+i*105,r=angle*Math.PI/180;
    ctx.font=ic.font='28px Arial';const m=ctx.measureText(lines[i]!);
    const corners=[[0,-m.actualBoundingBoxAscent],[m.width,-m.actualBoundingBoxAscent],[0,m.actualBoundingBoxDescent],[m.width,m.actualBoundingBoxDescent]].map(([a,b])=>({x:x+a!*Math.cos(r)-b!*Math.sin(r),y:y+a!*Math.sin(r)+b!*Math.cos(r)}));
    const left=Math.floor(Math.min(...corners.map(p=>p.x)))-2,top=Math.floor(Math.min(...corners.map(p=>p.y)))-2;
    annotations.push({text:lines[i]!,angle,box:{x:left,y:top,width:Math.ceil(Math.max(...corners.map(p=>p.x)))-left+2,height:Math.ceil(Math.max(...corners.map(p=>p.y)))-top+2}});
    for(const c of [ctx,ic]){c.save();c.translate(x,y);c.rotate(r);c.fillStyle=c===ic?'#000':'#58534b';c.fillText(lines[i]!,0,0);c.restore();}
   }
   const blob=await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b!)));const previewUrl=URL.createObjectURL(blob);
   const image={id:`slope-${angle}`,file:new File([blob],'fictional.png',{type:'image/png'}),previewUrl,width:1100,height:780,mimeType:'image/png' as const};
   try{
    const start=performance.now(),ocr=await scanContent(image,()=>{},new AbortController().signal),ms=performance.now()-start;
    const content=recognizeContent(ocr),matched=matchWords(content.words,annotations);
    const boxes=selectionBoxes(content,content.words.map(w=>({kind:'word' as const,id:w.id})),image.id);
    const png=await redactImage(image,boxes.map((box,i)=>({...box,id:`m${i}`,imageId:image.id,source:'manual' as const,shouldRedact:true})));
    const bitmap=await createImageBitmap(png);ctx.clearRect(0,0,1100,780);ctx.drawImage(bitmap,0,0);bitmap.close();
    const mask=ic.getImageData(0,0,1100,780).data,actual=ctx.getImageData(0,0,1100,780).data;
    let pixels=0,missed=0;for(let i=0;i<mask.length;i+=4){if(mask[i+3]!<32)continue;pixels++;const x=(i/4)%1100+.5,y=Math.floor(i/4/1100)+.5;if(!boxes.some(b=>contains(b,x,y))||actual[i]!==0||actual[i+1]!==0||actual[i+2]!==0||actual[i+3]!==255)missed++;}
    results.push({angle,selectedAngle:ocr.readingAngle??0,exact:annotations.filter((a,i)=>textMetrics(a.text,matched.byLine[i]!.map(w=>w.text).join(' ')).exactLine).length,located:matched.byLine.filter(l=>l.length).length,pixels,missed,ms});
   }finally{URL.revokeObjectURL(previewUrl);canvas.width=canvas.height=ink.width=ink.height=0;}
  }return results;
 });
 console.log('MEASURED_SLOPE_CONFIRMATION',JSON.stringify(results));
 for(const r of results){expect(r.located).toBe(5);expect(r.missed).toBe(0);expect(r.pixels).toBeGreaterThan(0);}
});
