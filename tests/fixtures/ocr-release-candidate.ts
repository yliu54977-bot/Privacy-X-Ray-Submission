/** Fresh fictional release probes, defined before this run. Synthetic photographs
 * approximate lighting/rotation, not independent real-camera ground truth. */
import type {FixtureSpec,Annotation} from './ocr-generalization';
const categories=['photo-notice','dense-document','long-screenshot','bilingual','rotated-form','dim-receipt','computer','chat'];
export function releaseCases():FixtureSpec[]{return categories.flatMap(category=>[0,1].map(variant=>({id:`release-${category}-${variant}`,category,variant,heldout:true})));}
export async function renderFixture(spec:FixtureSpec){
 const {category,variant:v}=spec;
 const sets:Record<string,string[]>={
 'photo-notice':['Autumn community garden programme','Volunteer orientation on Wednesday','Bring a reusable water bottle','Please meet at the east entrance','Session code GD-682419','Email gardens@example.test'],
 'dense-document':Array.from({length:36},(_,i)=>`Item ${i+1} | Cedar supplies | ${(37.25+i*2.5).toFixed(2)}`),
 'long-screenshot':Array.from({length:22},(_,i)=>`Archive entry ${i+101} - Example records - ${731820+i}`),
 bilingual:['城市活动 City activities','请于周五下午到达','Email office@example.test','联系电话 416 555 0198','订单编号 WX-852316','金额 Total 385.60','集合地点：图书馆东门','仅供软件测试使用'],
 'rotated-form':['Fictional delivery worksheet','Recipient: Jordan Linden','Parcel number PK-681593','Delivery date: 2026-10-29','District: North Garden','Telephone: 416 555 0175'],
 'dim-receipt':['EXAMPLE BOOKSHOP RECEIPT','Receipt number BC-952731','Sketchbook 18.75','Notebook 9.40','Total paid 28.15','Payment ref TX-682195'],
 computer:['$ node app.mjs','host = 198.51.100.42','endpoint = /demo/status','api_key = fictional_not_a_secret','Build: 2026.10.22','Output saved to /tmp/example'],
 chat:['周四的讨论改到下午','Jules: Please bring the draft.','Casey: I will arrive at 15:20.','文档已准备好，请查收。','Email casey@example.test','See you near the reading room.']};
 const canvas=document.createElement('canvas'),ink=document.createElement('canvas');
 canvas.width=ink.width=category==='dense-document'?1500:1100;
 canvas.height=ink.height=category==='long-screenshot'?9500:category==='dense-document'?1700:950;
 const ctx=canvas.getContext('2d')!,ic=ink.getContext('2d')!;
 ctx.fillStyle=category==='computer'?'#222831':'#f3eee5';ctx.fillRect(0,0,canvas.width,canvas.height);
 const annotations:Annotation[]=[];
 for(const [i,text] of sets[category]!.entries()){
  const angle=category==='photo-notice'?(v?-8:5):category==='rotated-form'?(v?180:90):0;
  let x=60,y=130+i*95,font=27;
  if(category==='dense-document'){x=60+(i%2)*740;y=80+Math.floor(i/2)*85;font=v?17:22;}
  if(category==='long-screenshot'){y=90+i*420;font=v?16:22;}
  if(category==='rotated-form'){if(v){x=1000;y=820-i*100;}else{x=850-i*110;y=100;}}
  if(category==='dim-receipt')font=v?17:24;
  const radians=angle*Math.PI/180;
  ctx.font=ic.font=`${font}px ${category==='computer'?'monospace':'Arial'}`;
  const m=ctx.measureText(text),corners=[[0,-m.actualBoundingBoxAscent],[m.width,-m.actualBoundingBoxAscent],[0,m.actualBoundingBoxDescent],[m.width,m.actualBoundingBoxDescent]].map(([a,b])=>({x:x+a!*Math.cos(radians)-b!*Math.sin(radians),y:y+a!*Math.sin(radians)+b!*Math.cos(radians)}));
  const left=Math.floor(Math.min(...corners.map(p=>p.x)))-2,top=Math.floor(Math.min(...corners.map(p=>p.y)))-2;
  annotations.push({text,angle,box:{x:left,y:top,width:Math.ceil(Math.max(...corners.map(p=>p.x)))-left+2,height:Math.ceil(Math.max(...corners.map(p=>p.y)))-top+2}});
  for(const target of [ctx,ic]){target.save();target.translate(x,y);target.rotate(radians);target.fillStyle=target===ic?'black':category==='computer'?'#eee':category==='dim-receipt'?'#a5a29a':'#323831';target.fillText(text,0,0);target.restore();}
 }
 if(category==='photo-notice'){const g=ctx.createLinearGradient(0,0,1100,700);g.addColorStop(0,'#ffffff00');g.addColorStop(.5,v?'#ffffff88':'#ffffff44');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(0,0,1100,950);}
 return {canvas,ink,annotations};
}
