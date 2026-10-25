/** Fictional, deterministic benchmark v1. Held-out text/layouts are frozen before tuning.
 * Some variant pairs intentionally repeat the same pixels; report 22 unique renderings
 * per 32-run split, not 32 independent images (confirmation:11 unique/12 runs).
 * Synthetic camera/perspective and cursive-font probes are NOT real photographs/handwriting.
 */
export interface FixtureSpec { id:string; category:string; variant:number; heldout:boolean; confirmation?:boolean }
export const categories = ['desktop','chat','email-browser','finance','identity-membership','medical-academic','travel-shopping','terminal','tables-columns','camera-simulation','mixed-language','small-low-contrast','rotated-perspective','long-large','stylized-font','text-face'] as const;
export function cases(split:'development'|'heldout'|'confirmation'):FixtureSpec[] {
  const selected=split==='confirmation'?categories.filter(c=>['camera-simulation','mixed-language','small-low-contrast','rotated-perspective','long-large','tables-columns'].includes(c)):categories;
  return selected.flatMap(category=>[0,1].map(variant=>({id:`${split}-${category}-${variant}`,category,variant,heldout:split!=='development',confirmation:split==='confirmation'})));
}
export interface Box {x:number;y:number;width:number;height:number}
export interface Annotation {text:string;box:Box;angle:number}
export async function renderFixture(spec:FixtureSpec):Promise<{canvas:HTMLCanvasElement;ink:HTMLCanvasElement;annotations:Annotation[]}> {
  const {category,variant:v,heldout:h}=spec;
  const name=h?'Morgan Aspen':'Robin Willow', code=h?'728491':'563827';
  const sets:Record<string,string[]>={
    desktop:['Project workspace','Local draft documents','Review the selected content','Meeting notes and diagrams','Version 2.6 preview','All records below are fictional','Download the finished image','No automatic saving'],
    chat:[h?'周末读书会':'明天的讨论会','Avery: Are you free tomorrow?','Morgan: Yes, after lunch.','请带上你的笔记本',`Contact ${h?'morgan':'robin'}@example.test`,'The meeting starts at 14:30.','地点在图书馆二楼','Thanks, see you there!'],
    'email-browser':['Inbox - fictional mail','From: sender@example.test','To: reader@example.test','Subject: Workshop registration','Hello, your reservation is confirmed.',`Reference ${code}`,'Please arrive fifteen minutes early.','https://example.test/workshop'],
    finance:['FICTIONAL PAYMENT RECEIPT',`Receipt RC-${code}`,'Account 4827 1953 6028','Materials and supplies','Subtotal 127.40','Tax 16.56','Total 143.96','Paid 2026-10-12'],
    'identity-membership':['FICTIONAL COMMUNITY PASS',h?'Cedar Arts Association':'Harbour Reading Society',name,`Member ${code}`,'Valid through 2027-05-31','普通会员','For demonstration only','Not an identity document'],
    'medical-academic':['Fictional appointment summary',`Participant ${name}`,'Department: Community Learning','Date 2026-11-18','时间 上午十点','Room 204, West Building','Reference AP-827461','No real medical records'],
    'travel-shopping':['Fictional travel itinerary','Journey: North Bay to Cedar Town',`Booking TR-${code}`,'Departure 08:45','Arrival 11:20','Seat 14B, Car 3',`Passenger ${name}`,'Order total 76.50'],
    terminal:['$ npm run build','server = 192.0.2.73','port = 4173','mode = local_demo','token = fictional_example_only','Build completed successfully.','路径 /tmp/demo/output','0 warnings, 12 files'],
    'tables-columns':['Product','Available','Drawing paper','Twenty eight','Wooden pencils','Thirty five','Blue folders','Forty two','Metal clips','Seventy nine','Glass jars','Eleven'],
    'camera-simulation':['Community notice board','Fictional neighbourhood event','Music and crafts on Saturday','Doors open at half past ten','Bring your own notebook','All ages are welcome','Hall 291, upstairs','Contact events@example.test'],
    'mixed-language':['项目进度 Project update','本周完成接口测试','Next meeting: Thursday 09:30','邮箱 demo@example.test','请检查导出的图片','Order 编号 AB-728491','Amount 金额 268.50','所有内容仅供测试'],
    'small-low-contrast':['Small print demonstration','Reference SM-827491','Please inspect every region','A narrow punctuation test: [a/b];','email: small@example.test','中文小字识别测试','All details are fictional','Version 2026.10.18'],
    'rotated-perspective':['North section heading','Local content extraction','Reference RP-394827','Review before exporting','中文方向测试','Second column text','No real personal data','End of fictional document'],
    'long-large':Array.from({length:24},(_,i)=>`Section ${String(i+1).padStart(2,'0')} ${h?'Cedar records':'Willow notes'} ${code}-${i+10}`),
    'stylized-font':['Fictional handwritten-style note','Remember the afternoon meeting','Bring paper and coloured pencils','Meet near the garden entrance','Call demo@example.test','Saturday, October twenty four','Thank you for your help','Signed: Example Person'],
    'text-face':['Fictional workshop speaker','Public demonstration portrait',name,`Registration SP-${code}`,'Creative learning programme','Saturday at 15:00','Venue: Community Hall','Example data, no identity inference'],
  };
  // Held-out has different lexical content and dimensions/spacing, not just different IDs.
  let lines=sets[category]!.map((s,i)=>h&&i===2&&['desktop','camera-simulation'].includes(category)?'Please bring the printed programme':s);
  if(spec.confirmation)lines=lines.map(text=>text.replaceAll('Cedar records','Orchard archive').replaceAll('728491','915362').replaceAll('North section heading','Eastern reading room').replaceAll('Second column text','Another vertical caption').replaceAll('No real personal data','Only fictional examples').replaceAll('End of fictional document','Practice material ends here').replaceAll('中文方向测试','识别图片中的文字').replaceAll('请检查导出的图片','请仔细查看全部内容').replaceAll('Reference','Record').replaceAll('Community','Neighbourhood'));
  const canvas=document.createElement('canvas'),ink=document.createElement('canvas');
  canvas.width=category==='long-large'?(v?3100:850):h?1280:1200;
  canvas.height=category==='long-large'?(v?4600:12000):h?920:860;
  if(spec.confirmation){canvas.width+=category==='long-large'?0:80;canvas.height+=category==='long-large'?200:100;}
  ink.width=canvas.width;ink.height=canvas.height;
  const ctx=canvas.getContext('2d')!,ic=ink.getContext('2d')!;
  ctx.fillStyle=category==='terminal'?'#20252e':category==='camera-simulation'?'#c4bba7':'#f8f9fb';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(category==='camera-simulation'){ctx.fillStyle='#f2eee4';ctx.fillRect(35,35,canvas.width-70,canvas.height-70);for(let i=0;i<25;i++){ctx.fillStyle=`rgba(100,80,50,${.01+(i%3)*.006})`;ctx.fillRect(i*53,0,12,canvas.height);}}
  if(category==='text-face') { const image=new Image();image.src='/tests/fixtures/public-face-portrait.jpg';await image.decode();ctx.drawImage(image,canvas.width-260,90,190,250); }
  if(category==='chat')for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#dceee6':'#e3e8f3';ctx.fillRect(i%2?90:40,45+i*94,940,72);}
  const annotations:Annotation[]=[];
  for(let i=0;i<lines.length;i++){
    const text=lines[i]!;
    let x=65,y=100+i*(h?88:84),font=h?27:28,angle=0,skew=0,sx=1;
    if(category==='small-low-contrast'){font=v?12:16;y=110+i*67;}
    if(category==='terminal'){font=22;y=105+i*80;}
    if(category==='tables-columns'){x=i%2?720:65;y=100+Math.floor(i/2)*115;font=v?16:25;}
    if(category==='long-large'){font=v?18:23;x=v?(i%3)*1000+60:60;y=110+Math.floor(i/(v?3:1))*(v?560:490);}
    if(category==='text-face')font=23;
    if(category==='camera-simulation'){angle=v?-7:6;skew=v?.13:-.08;sx=1-i*.018;}
    if(category==='rotated-perspective'){
      if(!v){angle=i<4?0:90;x=i<4?65:750+(i-4)*90;y=i<4?100+i*95:100;}
      else {angle=-9;skew=.15;sx=1-i*.025;x=90;y=140+i*90;}
    }
    if(spec.confirmation){font+=1;x+=7;y+=13;}
    const style=category==='stylized-font'?(v?'italic':'normal'):'normal';
    const family=category==='stylized-font'?(v?'Georgia':'cursive'):category==='terminal'?'monospace':'Arial';
    ctx.font=ic.font=`${style} ${font}px ${family}`;
    const metrics=ctx.measureText(text),top=-metrics.actualBoundingBoxAscent,bottom=metrics.actualBoundingBoxDescent;
    const r=angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
    const corners=[[0,top],[metrics.width,top],[metrics.width,bottom],[0,bottom]].map(([a,b])=>({x:x+c*(a!*sx+b!*skew)-s*b!,y:y+s*(a!*sx+b!*skew)+c*b!}));
    const left=Math.floor(Math.min(...corners.map(p=>p.x)))-1,up=Math.floor(Math.min(...corners.map(p=>p.y)))-1;
    annotations.push({text,angle,box:{x:left,y:up,width:Math.ceil(Math.max(...corners.map(p=>p.x)))-left+1,height:Math.ceil(Math.max(...corners.map(p=>p.y)))-up+1}});
    for(const target of [ctx,ic]){target.save();target.translate(x,y);target.rotate(r);target.transform(sx,0,skew,1,0,0);target.fillStyle=target===ic?'#000':category==='terminal'?'#edf2fa':category==='small-low-contrast'&&v?'#a5a8ac':'#18202a';target.fillText(text,0,0);target.restore();}
  }
  // Bounded glare strip over camera text: annotation ink remains the intended glyph mask.
  if(category==='camera-simulation'&&v){const g=ctx.createLinearGradient(0,0,canvas.width,0);g.addColorStop(0,'#ffffff00');g.addColorStop(.48,'#ffffff66');g.addColorStop(.56,'#ffffff77');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);}
  return {canvas,ink,annotations};
}
