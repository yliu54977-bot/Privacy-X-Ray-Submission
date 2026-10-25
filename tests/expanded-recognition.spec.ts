import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const specimen of [
  { name: 'payment card', lines: ['CARD DETAILS', 'Card number: 4111 1111 1111 1111', 'Valid thru: 08/29', 'CVV: 827'], labels: [/payment card number/i, /card expiry date/i, /card security code/i] },
  { name: 'unlabeled card front', lines: ['4111 1111 1111 1111', 'ALEX MORGAN', '08/29', 'FICTIONAL BANK'], labels: [/payment card number/i, /cardholder name/i, /card expiry date/i] },
  { name: 'passport and visa', lines: ['PASSPORT', 'Document number: DOC8273649', 'Visa number: VIS8273649', 'Nationality: FICTIONAL'], labels: [/identity document number/i, /immigration or residence identifier/i, /passport personal details/i] },
  { name: 'access and recovery', lines: ['ACCOUNT SECURITY', 'Password: FictionalPass42', 'OTP: 827364', 'Recovery code: FICTIONAL827364'], labels: [/password/i, /verification or recovery code/i] },
  { name: 'health and employment', lines: ['CONFIDENTIAL RECORD', 'Blood pressure: 120/80', 'Subscriber ID: SUB827364', 'Performance rating: Confidential example'], labels: [/health measurement or report/i, /health coverage details/i, /employment or hr information/i] },
]) test(`simple automatic review covers ${specimen.name}`, async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  const data = await page.evaluate(async lines => {
    const c = document.createElement('canvas'); c.width=1500;c.height=600;
    const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='34px Arial';
    lines.forEach((line,i)=>ctx.fillText(line,40,70+i*95));
    return (c.toDataURL('image/png')).split(',')[1];
  }, specimen.lines);
  await page.locator('input[type=file]').setInputFiles({name:'fictional-record.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  const panel=page.getByRole('complementary',{name:'Choose information to hide',exact:true});
  for (const label of specimen.labels) await expect(panel.getByRole('checkbox',{name:label}).first()).toBeVisible({timeout:90000});
  await panel.getByRole('button',{name:'Select all',exact:true}).click();
  await page.getByRole('button',{name:'Preview covered image',exact:true}).click();
  await expect(page.getByRole('img',{name:'Covered PNG preview',exact:true})).toBeVisible();
});

for (const variant of ['small-multiple','rotated'] as const) test(`real face model recovers ${variant} portraits with original coordinates`, async ({page}) => {
  test.setTimeout(120000);
  const portrait=(await readFile('tests/fixtures/public-face-portrait.jpg')).toString('base64');
  await page.goto('/');
  const data=await page.evaluate(async ({portrait,variant})=>{
    const img=new Image();img.src=`data:image/jpeg;base64,${portrait}`;await img.decode();
    const c=document.createElement('canvas');c.width=variant==='rotated'?1024:1600;c.height=variant==='rotated'?820:1000;
    const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);
    if(variant==='rotated'){ctx.translate(1024,0);ctx.rotate(Math.PI/2);ctx.drawImage(img,0,0,820,1024);}
    else {ctx.drawImage(img,80,80,160,200);ctx.drawImage(img,1240,690,160,200);}
    return c.toDataURL('image/png').split(',')[1];
  },{portrait,variant});
  await page.locator('input[type=file]').setInputFiles({name:'public-test-portraits.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});
  const faces=page.getByRole('checkbox',{name:/face region/i});
  await expect(faces.first()).toBeVisible({timeout:90000});
  if(variant==='small-multiple') expect(await faces.count()).toBeGreaterThanOrEqual(2);
  for(const checkbox of await faces.all()) await checkbox.check();
  const boxes=await page.locator('.px-mask').evaluateAll(elements=>elements.map(el=>Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(el.getAttribute(k))]))));
  if(variant==='small-multiple') for(const region of [{x:80,y:80},{x:1240,y:690}])
    expect(boxes.some(b=>b.x!+b.width!/2>=region.x && b.x!+b.width!/2<=region.x+160 && b.y!+b.height!/2>=region.y && b.y!+b.height!/2<=region.y+200)).toBe(true);
  await page.getByRole('button',{name:'Preview covered image',exact:true}).click();
  const preview=page.getByRole('img',{name:'Covered PNG preview',exact:true});await expect(preview).toBeVisible();
  const pixels=await preview.evaluate((img:HTMLImageElement,boxes)=>{
    const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);
    return boxes.map(b=>Array.from(ctx.getImageData(Math.floor(b.x!+b.width!/2),Math.floor(b.y!+b.height!/2),1,1).data));
  },boxes);
  expect(pixels.every(pixel=>JSON.stringify(pixel)==='[0,0,0,255]')).toBe(true);
});
