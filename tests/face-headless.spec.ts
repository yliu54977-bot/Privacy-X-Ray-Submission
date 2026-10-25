import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('no WebGL: face and email both survive the complete image scan', async ({page}) => {
 let fallbackLoaded=false;
 page.on('request', r=>{if(r.url().includes('/vision/face-cpu/model.json'))fallbackLoaded=true;});
 await page.addInitScript(() => {
  for (const prototype of [HTMLCanvasElement.prototype, OffscreenCanvas.prototype]) {
   const original = prototype.getContext;
   Object.defineProperty(prototype, 'getContext', {value: function(type: string, ...args: unknown[]) {
    if (type.includes('webgl') || type === 'experimental-webgl') return null;
    return Reflect.apply(original, this, [type, ...args]);
   }});
  }
 });
 await page.goto('/');
 expect(await page.evaluate(()=>document.createElement('canvas').getContext('webgl'))).toBeNull();
 const portrait = (await readFile('tests/fixtures/public-face-portrait.jpg')).toString('base64');
 const png = await page.evaluate(async p => {
  const c=document.createElement('canvas');c.width=960;c.height=640;
  const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,960,640);
  const i=new Image();i.src='data:image/jpeg;base64,'+p;await i.decode();ctx.drawImage(i,220,0,400,440,30,60,240,264);
  ctx.fillStyle='black';ctx.font='32px Arial';ctx.fillText('FICTIONAL STUDENT CARD',300,90);ctx.fillText('student@example.com',300,180);ctx.fillText('Student ID: DEMO827364',300,260);
  return c.toDataURL('image/png').split(',')[1]!;
 },portrait);
 const input=page.locator('input[type=file]');
 await input.setInputFiles({name:'fictional-card.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect(page.getByRole('checkbox',{name:/face region/i}).first()).toBeVisible({timeout:110000});
 await expect(page.getByRole('checkbox',{name:/student@example.com/i}).first()).toBeVisible();
 expect(fallbackLoaded).toBe(true);
 await expect(page.getByRole('checkbox',{name:/DEMO827364/i}).first()).toBeVisible();
 await expect(page.getByText(/Browser-local face regions could not complete/)).toHaveCount(0);
});
