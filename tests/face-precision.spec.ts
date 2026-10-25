import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const hasPortrait of [false, true]) test(`face precision on large fictional card ${hasPortrait ? 'with a portrait' : 'with text and logos only'}`, async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  const portrait = (await readFile('tests/fixtures/public-face-portrait.jpg')).toString('base64');
  const result = await page.evaluate(async ({ portrait, hasPortrait }) => {
    const canvas = document.createElement('canvas'); canvas.width = 2704; canvas.height = 1792;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ebe9d8';ctx.fillRect(0,0,2704,1792);
    ctx.fillStyle='#142a24';ctx.fillRect(30,20,350,1750);ctx.fillStyle='#e5c14b';ctx.font='bold 130px Arial';
    ctx.save();ctx.translate(230,1600);ctx.rotate(-Math.PI/2);ctx.fillText('FICTIONAL CAMPUS CARD',0,0);ctx.restore();
    ctx.fillStyle='#152530';ctx.font='bold 110px Arial';ctx.fillText('FICTIONAL UNIVERSITY',500,220);
    ctx.font='bold 85px Arial';['ALEX','MORGAN','DEMO827364','MATHEMATICS','UNDERGRADUATE'].forEach((s,i)=>ctx.fillText(s,1450,650+i*160));
    ctx.fillStyle='#cfaa24';for(let i=0;i<6;i++){ctx.beginPath();ctx.arc(2200,1050,150+i*35,0,Math.PI*1.6);ctx.lineWidth=25;ctx.strokeStyle=i%2?'#f1e5a6':'#d9ba43';ctx.stroke();}
    ctx.fillStyle='#c6ccd0';ctx.fillRect(620,600,720,792);
    if(hasPortrait){const img=new Image();img.src=`data:image/jpeg;base64,${portrait}`;await img.decode();ctx.drawImage(img,220,0,400,440,620,600,720,792);}
    const module = await import('/src/v2/detection/faceDetector.ts');
    const findings = await module.localFaceDetector.detect({ imageId: 'fictional-card', imageWidth:2704,imageHeight:1792,
      imagePixels:{imageId:'fictional-card',width:2704,height:1792,readPixels:async (r:{x:number;y:number;width:number;height:number})=>ctx.getImageData(r.x,r.y,r.width,r.height)} });
    return findings.flatMap((f:{boxes?:{x:number;y:number;width:number;height:number}[]})=>f.boxes??[]);
  }, {portrait,hasPortrait});
  if (!hasPortrait) expect(result).toHaveLength(0);
  else {
    // Manual annotation of the public fixture's face after crop/scale into the card.
    const truth={x:710,y:708,width:468,height:549};
    expect(result).toHaveLength(1);
    expect(result.some(box=>{
      const overlap=Math.max(0,Math.min(box.x+box.width,truth.x+truth.width)-Math.max(box.x,truth.x))*Math.max(0,Math.min(box.y+box.height,truth.y+truth.height)-Math.max(box.y,truth.y));
      return overlap/(truth.width*truth.height)>0.75;
    })).toBe(true);
    expect(result.every(box=>box.x+box.width/2>620 && box.x+box.width/2<1340 && box.y+box.height/2>600 && box.y+box.height/2<1392)).toBe(true);
  }
});
