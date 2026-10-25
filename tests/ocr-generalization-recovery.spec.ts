import {expect,test} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {renderFixture,cases} from './fixtures/ocr-generalization';
import {renderFixture as renderReleaseFixture,releaseCases} from './fixtures/ocr-release-candidate';

for(const category of ['release-long-screenshot','camera-simulation','long-large','rotated-perspective','rotated-perspective-heldout','long-large-confirmation'])test(`recognition safety: recovered ${category} text is selectable and permanently redacted`,async({page})=>{
 test.setTimeout(120000);await page.goto('/');
 // Only fictional fixture code is injected; works against the built static app too.
 await page.addScriptTag({content:`window.renderFictionalFixture = ${(category.startsWith('release-')?renderReleaseFixture:renderFixture).toString()};`});
 const fixture=await page.evaluate(async spec=>{
  const {canvas,ink}=await (window as unknown as {renderFictionalFixture:typeof renderFixture}).renderFictionalFixture(spec);
  const pixels=ink.getContext('2d')!.getImageData(0,0,ink.width,ink.height).data;
  const selected:number[]=[];for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]!>=32)selected.push(i/4);
  const blob=await new Promise<Blob>(resolve=>canvas.toBlob(b=>resolve(b!),'image/png'));
  const result={bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),ink:selected,width:canvas.width,height:canvas.height};
  canvas.width=canvas.height=ink.width=ink.height=0;return result;
 },category.startsWith('release-')?releaseCases().find(s=>s.category==='long-screenshot'&&s.variant===0)!:cases(category.endsWith('-confirmation')?'confirmation':category.endsWith('-heldout')?'heldout':'development').find(s=>s.category===category.replace(/-(heldout|confirmation)$/,'')&&s.variant===0)!);
 await page.locator('input[type=file]').setInputFiles({name:'fictional-recovery.png',mimeType:'image/png',buffer:Buffer.from(fixture.bytes)});
 const panel=page.getByLabel('Recognized text review',{exact:true});await expect(panel.getByText(/All recognized text/)).toBeVisible({timeout:90000});
 const seen:string[]=[];
 for(let p=0;p<16;p++){
  seen.push(await panel.innerText());
  while(await panel.getByRole('button',{name:'Mask this line',exact:true}).count())await panel.getByRole('button',{name:'Mask this line',exact:true}).first().click();
  const next=panel.getByRole('button',{name:'Next text',exact:true});if(!await next.count()||!await next.isEnabled())break;await next.click();
 }
 const text=seen.join('\n');
 if(category==='release-long-screenshot'){expect(text).toContain('Archive entry 101');expect(text).toContain('Archive entry 122');}
 else if(category.startsWith('long-large')){const code=category.endsWith('-confirmation')?'915362':'563827';expect(text).toContain(`${code}-10`);expect(text).toContain(`${code}-33`);}
 else if(category==='camera-simulation'){expect(text).toContain('Community notice board');expect(text).toContain('events@example.test');}
 else{expect(text).toContain('Second column text');expect(text).toContain('End of fictional document');}
 await page.getByRole('button',{name:'Preview covered image',exact:true}).click();
 await expect(page.getByRole('img',{name:'Covered PNG preview',exact:true})).toBeVisible();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();const download=await pending;
 const bytes=Array.from(await readFile((await download.path())!));
 const output=await page.evaluate(async({bytes,ink})=>{
  const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(bitmap,0,0);bitmap.close();const px=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let missed=0;for(const at of ink){const i=at*4;if(px[i]!==0||px[i+1]!==0||px[i+2]!==0||px[i+3]!==255)missed++;}
  return {missed,width:canvas.width,height:canvas.height};
 },{bytes,ink:fixture.ink});
 expect(output).toEqual({missed:0,width:fixture.width,height:fixture.height});
});
