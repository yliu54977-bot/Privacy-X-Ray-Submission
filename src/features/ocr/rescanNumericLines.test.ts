import {afterEach,expect,it,vi} from 'vitest';
import type {Page,Worker} from 'tesseract.js';
import {rescanNumericLines} from './rescanNumericLines';
const box={x0:100,y0:60,x1:300,y1:100};
const word=(text:string)=>({text,confidence:80,bbox:box,symbols:[]});
const line=(text='111 111')=>({text,words:text.split(' ').map(word),bbox:box});
const page=(lines:ReturnType<typeof line>[])=>({blocks:[{paragraphs:[{lines}]}],text:lines.map(l=>l.text).join('\n')} as unknown as Page);
afterEach(()=>vi.unstubAllGlobals());
const candidatePage=(text='1111 1111',bbox={x0:18,y0:9,x1:108,y1:27})=>page([{...line(text),words:text.split(' ').map(t=>({...word(t),bbox}))}]);
function setup(candidate=candidatePage()){
 const canvases:{width:number;height:number;getContext:()=>{drawImage:()=>void}}[]=[];
 vi.stubGlobal('document',{createElement:()=>{const c={width:0,height:0,getContext:()=>({drawImage:()=>{}})};canvases.push(c);return c;}});
 const worker={setParameters:vi.fn(async()=>{}),recognize:vi.fn(async()=>({data:candidate}))} as unknown as Worker;
 return {worker,canvases};
}
it('bounds numeric retries, preserves other lines, and releases temporary canvases',async()=>{
 const {worker,canvases}=setup();const input=page([line(),line(),line(),line('ordinary words')]);
 const output=await rescanNumericLines(worker,input,{width:1000,height:500} as HTMLCanvasElement,new AbortController().signal);
 expect(worker.recognize).toHaveBeenCalledTimes(2);
 expect(output.text).toContain('1111 1111');expect(output.text).toContain('ordinary words');expect(input.text).not.toContain('1111');
 expect(canvases.every(c=>c.width===0&&c.height===0)).toBe(true);
 expect(worker.setParameters).toHaveBeenLastCalledWith({tessedit_pageseg_mode:'3'});
});
it('rejects nonnumeric alternate recognition instead of inventing digits',async()=>{
 const {worker}=setup(page([line('not digits')]));const input=page([line()]);
 expect(await rescanNumericLines(worker,input,{width:1000,height:500} as HTMLCanvasElement,new AbortController().signal)).toBe(input);
});
it('does not rescan ordinary text and resets parameters on cancellation',async()=>{
 const {worker}=setup();const source={width:1000,height:500} as HTMLCanvasElement;
 await rescanNumericLines(worker,page([line('ordinary words')]),source,new AbortController().signal);
 expect(worker.recognize).not.toHaveBeenCalled();
 const abort=new AbortController();abort.abort();
 await expect(rescanNumericLines(worker,page([line()]),source,abort.signal)).rejects.toThrow('cancelled');
 expect(worker.setParameters).toHaveBeenLastCalledWith({tessedit_pageseg_mode:'3'});
});

it('rejects adjacent numeric rows and columns and multiple output lines',async()=>{
 for(const candidate of [candidatePage('1111 1111',{x0:18,y0:0,x1:108,y1:7}),candidatePage('1111 1111',{x0:0,y0:9,x1:108,y1:27}),page([line(),line()])]){
  const {worker}=setup(candidate);const input=page([line()]);
  expect(await rescanNumericLines(worker,input,{width:1000,height:500} as HTMLCanvasElement,new AbortController().signal)).toBe(input);
 }
});
it('retains successful OCR when optional recognition or parameter configuration fails',async()=>{
 const input=page([line()]);const source={width:1000,height:500} as HTMLCanvasElement;
 for(const fail of ['recognize','setParameters'] as const){
  const {worker,canvases}=setup();vi.mocked(worker[fail]).mockRejectedValue(new Error('fixture failure'));
  expect(await rescanNumericLines(worker,input,source,new AbortController().signal)).toBe(input);
  expect(canvases.every(c=>c.width===0&&c.height===0)).toBe(true);
 }
});
