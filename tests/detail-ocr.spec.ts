import { expect, test } from '@playwright/test';

test('native detail OCR recovers dispersed small fields in a 16-megapixel image without duplicate words or misplaced boxes', async ({page})=>{
  test.setTimeout(180000);
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=4000;canvas.height=4000;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f3f4f7';ctx.fillRect(0,0,4000,4000);ctx.fillStyle='#18253e';ctx.font='bold 100px Arial';
    ctx.fillText('FICTIONAL PRIVATE RECORD',100,160);ctx.font='42px Arial';ctx.fillText('CONTACT DETAILS',100,650);ctx.fillText('ACCOUNT DETAILS',2500,2450);
    ctx.font='16px Arial';ctx.fillStyle='#4a5565';
    ctx.fillText('Email: alpha@example.test',100,1000);ctx.fillText('Patient ID: MED8273649',100,1200);
    ctx.fillText('Email: beta@example.test',2500,2800);ctx.fillText('Card number: 4111 1111 1111 1111',2500,3200);
    const blob=await new Promise<Blob>(resolve=>canvas.toBlob(value=>resolve(value!),'image/png'));
    const url=URL.createObjectURL(blob),progress:number[]=[];
    try{
      const {scanImageV2}=await import('/src/v2/detection/scanImageV2.ts');
      const {detectUniversalPrivacy}=await import('/src/v2/detection/detectUniversalPrivacy.ts');
      const image={id:'large-fictional',file:new File([blob],'fictional-large.png',{type:'image/png'}),previewUrl:url,width:4000,height:4000,mimeType:'image/png' as const};
      const ocr=await scanImageV2(image,p=>progress.push(p),new AbortController().signal);
      const detected=await detectUniversalPrivacy({imageId:image.id,imageWidth:4000,imageHeight:4000,ocr});
      return {progress,wordIds:ocr.words.map(w=>w.id),words:ocr.words.map(w=>({text:w.text,confidence:w.confidence,box:w.box})),findings:detected.findings.map(f=>({value:f.value,boxes:f.boxes}))};
    }finally{URL.revokeObjectURL(url);canvas.width=canvas.height=0;}
  });
  await test.info().attach('fictional-large-ocr.json',{contentType:'application/json',body:JSON.stringify(result)});
  for(const value of ['alpha@example.test','beta@example.test','MED8273649','4111 1111 1111 1111'])
    expect(result.findings.some(f=>f.value?.replace(/\s/g,'').toLowerCase()===value.replace(/\s/g,'').toLowerCase()),`Missing fictional field: ${value}`).toBe(true);
  expect(new Set(result.wordIds).size).toBe(result.wordIds.length);
  expect(result.progress.at(-1)).toBe(1);
  expect(result.progress.every((value,i)=>value>=0&&value<=1&&(i===0||value>=result.progress[i-1]!))).toBe(true);
  for(const [value,target] of [['alpha@example.test',{x:90,y:975,width:260,height:40}],['beta@example.test',{x:2490,y:2775,width:260,height:40}]] as const){
    const findings=result.findings.filter(f=>f.value?.replace(/\s/g,'').toLowerCase()===value);
    expect(findings).toHaveLength(1);
    expect(findings.some(f=>f.boxes?.some(b=>b.x+b.width/2>=target.x&&b.x+b.width/2<=target.x+target.width&&b.y+b.height/2>=target.y&&b.y+b.height/2<=target.y+target.height))).toBe(true);
  }
});
