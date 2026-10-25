import { expect, test } from '@playwright/test';
for (const turns of [1, 2, 3]) test(`local OCR restores ${turns * 90}-degree text and maps the email to original pixels`, async ({page}) => {
  test.setTimeout(120000);
  await page.goto('/');
  const result=await page.evaluate(async turns=>{
    const upright=document.createElement('canvas');upright.width=1200;upright.height=600;
    const ctx=upright.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,1200,600);ctx.fillStyle='black';ctx.font='40px Arial';
    const lines=['PRIVATE CONTACT RECORD','Email: alex@example.test','Phone: 555-010-2345','Name: Alex Morgan'];
    lines.forEach((line,i)=>ctx.fillText(line,100,110+i*110));
    const canvas=document.createElement('canvas');canvas.width=turns%2?600:1200;canvas.height=turns%2?1200:600;
    const rotated=canvas.getContext('2d')!;
    if(turns===1)rotated.translate(600,0);else if(turns===2)rotated.translate(1200,600);else rotated.translate(0,1200);
    rotated.rotate(turns*Math.PI/2);rotated.drawImage(upright,0,0);
    const blob=await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b!),'image/png'));
    const url=URL.createObjectURL(blob);
    try{
      const {scanImageV2}=await import('/src/v2/detection/scanImageV2.ts');
      const {detectUniversalPrivacy}=await import('/src/v2/detection/detectUniversalPrivacy.ts');
      const image={id:'rotated-fictional',file:new File([blob],'fictional.png',{type:'image/png'}),previewUrl:url,width:canvas.width,height:canvas.height,mimeType:'image/png' as const};
      const ocr=await scanImageV2(image,()=>{},new AbortController().signal);
      const detected=await detectUniversalPrivacy({imageId:image.id,imageWidth:image.width,imageHeight:image.height,ocr});
      return {width:image.width,height:image.height,findings:detected.findings.filter(f=>f.value?.includes('alex@example.test')).flatMap(f=>f.boxes??[])};
    }finally{URL.revokeObjectURL(url);}
  },turns);
  expect(result.findings.length).toBeGreaterThan(0);
  const expected = turns === 1 ? {x:380,y:100,width:60,height:620} : turns === 2 ? {x:480,y:380,width:620,height:60} : {x:160,y:480,width:60,height:620};
  expect(result.findings.every(box=>box.x>=0&&box.y>=0&&box.x+box.width<=result.width&&box.y+box.height<=result.height)).toBe(true);
  expect(result.findings.some(box=>{
    const cx=box.x+box.width/2,cy=box.y+box.height/2;
    return cx>=expected.x&&cx<=expected.x+expected.width&&cy>=expected.y&&cy<=expected.y+expected.height;
  })).toBe(true);
});
