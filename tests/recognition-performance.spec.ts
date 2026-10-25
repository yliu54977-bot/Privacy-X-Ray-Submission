import {expect,test} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

for(const mobile of [false,true])test(`recognition performance: large image ${mobile?'mobile proxy':'desktop'}`,async({page,browser})=>{
  test.skip(!process.env.RECOGNITION_PERFORMANCE,'Explicit performance run with process-memory sampling.');
  test.setTimeout(240000);
  await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});
  const pageCdp=await page.context().newCDPSession(page);
  if(mobile)await pageCdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const processCdp=await browser.newBrowserCDPSession();
  let peakRssBytes=0,samples=0,busy=false;
  const timer=setInterval(async()=>{
    if(busy)return;busy=true;
    try{const info=await processCdp.send('SystemInfo.getProcessInfo');
      const {stdout}=await promisify(execFile)('ps',['-o','rss=','-p',info.processInfo.map(p=>p.id).join(',')]);
      const rss=stdout.trim().split(/\s+/).reduce((sum,n)=>sum+Number(n)*1024,0);
      peakRssBytes=Math.max(peakRssBytes,rss);samples++;
    }catch{/* Report unavailable sampling, not a fabricated zero. */}finally{busy=false;}
  },200);
  try{
    await page.goto('/');
    const fixture=await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=3200;c.height=2400;
      const ctx=c.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#111';ctx.font='56px Arial';
      ['FICTIONAL COMMUNITY RECORD','Contact person: Robin Meadow','Email: robin@example.test','Reference: CP-647281','本地处理测试资料','请检查所有需要遮盖的信息'].forEach((text,i)=>ctx.fillText(text,160,230+i*200));
      return c.toDataURL('image/png').split(',')[1]!;
    });
    const start=performance.now();
    await page.locator('input[type=file]').setInputFiles({name:'fictional-large.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
    const panel=page.getByLabel('Recognized text review',{exact:true});
    await expect(panel.getByText(/All recognized text/)).toBeVisible({timeout:180000});
    const recognitionMs=performance.now()-start;
    expect(await panel.getByRole('button',{name:'Mask this line',exact:true}).count()).toBeGreaterThan(0);
    await panel.getByRole('button',{name:'Mask this line',exact:true}).first().click();
    const exportStart=performance.now();
    await page.getByRole('button',{name:'Preview covered image',exact:true}).click();
    const preview=page.getByRole('img',{name:'Covered PNG preview',exact:true});await expect(preview).toBeVisible({timeout:30000});
    const dimensions=await preview.evaluate((img:HTMLImageElement)=>[img.naturalWidth,img.naturalHeight]);
    expect(dimensions).toEqual([3200,2400]);
    const exported=page.waitForEvent('download');await page.getByRole('button',{name:'Download PNG',exact:true}).click();
    await exported;
    const exportMs=performance.now()-exportStart;
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,db:(await indexedDB.databases()).length}))).toEqual({local:0,session:0,db:0});
    console.log('RECOGNITION_PERFORMANCE',JSON.stringify({label:process.env.BENCHMARK_LABEL,mobileProxy:mobile,pixels:3200*2400,recognitionMs,exportMs,sampledPeakBrowserRssBytes:samples?peakRssBytes:null,samples}));
  }finally{clearInterval(timer);await pageCdp.detach();await processCdp.detach();}
});
