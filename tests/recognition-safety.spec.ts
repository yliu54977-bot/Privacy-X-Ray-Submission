import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const sample of ['chinese-words', 'large-sideways', 'repeated-digits', 'linked-number'] as const) test(`recognition safety: annotated glyphs survive no PNG export ${sample}`, async ({page}) => {
  test.setTimeout(90000);
  await page.goto('/');
  const fixture = await page.evaluate(async kind => {
    const base=document.createElement('canvas');base.width=kind==='large-sideways'?2400:1200;base.height=kind==='large-sideways'?1600:800;
    if((kind==='repeated-digits'||kind==='linked-number')){base.width=1500;base.height=600;}
    const ctx=base.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,base.width,base.height);ctx.fillStyle='#111';
    ctx.font=kind==='large-sideways'?'60px Arial':'30px Arial';
    if(kind==='large-sideways') ['Community workshop','Evening programme','Room 4628'].forEach((s,i)=>ctx.fillText(s,120,200+i*170));
    else if((kind==='repeated-digits'||kind==='linked-number')){ctx.font='34px Arial';['4111 1111 1111 1111','ALEX MORGAN','08/29','FICTIONAL BANK'].forEach((s,i)=>ctx.fillText(s,40,70+i*95));}
    else ctx.fillText('图书馆开放时间',60,120);
    const canvas=document.createElement('canvas');canvas.width=kind==='large-sideways'?base.height:base.width;canvas.height=kind==='large-sideways'?base.width:base.height;
    const out=canvas.getContext('2d')!;
    if(kind==='large-sideways'){out.translate(canvas.width,0);out.rotate(Math.PI/2);}out.drawImage(base,0,0);
    const pixels=out.getImageData(0,0,canvas.width,canvas.height).data;const ink:number[]=[];
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]!<150&&pixels[i+3]===255&&(kind!=='linked-number'||Math.floor(i/4/canvas.width)<100))ink.push(i/4);
    const blob=await new Promise<Blob>(r=>canvas.toBlob(b=>r(b!),'image/png'));
    return {bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),ink,width:canvas.width,height:canvas.height};
  },sample);
  await page.locator('input[type=file]').setInputFiles({name:'fictional-coverage.png',mimeType:'image/png',buffer:Buffer.from(fixture.bytes)});
  const panel=page.getByLabel('Recognized text review',{exact:true});
  await expect(panel.getByText(/All recognized text/)).toBeVisible({timeout:60000});
  if(sample==='linked-number') await page.getByRole('checkbox',{name:/payment card number/i}).first().check();
  else {
  if(sample==='chinese-words')await panel.getByRole('radio',{name:'Words',exact:true}).check();
  const name=sample==='chinese-words'?'Mask this word':'Mask this line';
  // Current fixtures fit one page. Click remaining actionable items; no classifier prerequisite.
  expect(await panel.getByRole('button',{name,exact:true}).count()).toBeGreaterThan(0);
  while(await panel.getByRole('button',{name,exact:true}).count())await panel.getByRole('button',{name,exact:true}).first().click();
  }
  await page.getByRole('button',{name:'Preview covered image',exact:true}).click();
  await expect(page.getByRole('img',{name:'Covered PNG preview',exact:true})).toBeVisible();
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();
  const download=await downloaded;const bytes=Array.from(await readFile((await download.path())!));
  const result=await page.evaluate(async ({bytes,ink})=>{
    const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let missed=0;for(const at of ink){const i=at*4;if(pixels[i]||pixels[i+1]||pixels[i+2]||pixels[i+3]!==255)missed++;}
    return {missed,width:canvas.width,height:canvas.height,untouchedCorner:pixels[0]===255};
  },{bytes,ink:fixture.ink});
  expect(result).toEqual({missed:0,width:fixture.width,height:fixture.height,untouchedCorner:true});
});
