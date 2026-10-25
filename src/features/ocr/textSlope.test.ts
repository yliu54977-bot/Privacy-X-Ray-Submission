import {describe,it,expect} from 'vitest';
import type {OcrWord} from '../../types';
import {textSlopeCorrection} from './textSlope';
function rows(angles:number[]):OcrWord[]{return angles.flatMap((angle,row)=>Array.from({length:5},(_,col)=>({id:`${row}-${col}`,lineId:`l${row}`,text:'fictional',confidence:.9,box:{x:40+col*80,y:30+row*100+col*80*Math.tan(angle*Math.PI/180),width:60,height:24}})));}
describe('evidence-backed slope correction',()=>{
 it('corrects agreeing positive and negative slopes',()=>{expect(textSlopeCorrection(rows([6,6,6,6]))).toBe(-6);expect(textSlopeCorrection(rows([-7,-7,-7]))).toBe(7);});
 it('does not rescan horizontal text',()=>expect(textSlopeCorrection(rows([0,0,0,0]))).toBeUndefined());
 it('rejects insufficient and inconsistent lines',()=>{expect(textSlopeCorrection(rows([6,6]))).toBeUndefined();expect(textSlopeCorrection(rows([6,-6,6,-6]))).toBeUndefined();});
 it('rejects uncertain OCR and extreme orientation',()=>{expect(textSlopeCorrection(rows([6,6,6]).map(w=>({...w,confidence:.2})))).toBeUndefined();expect(textSlopeCorrection(rows([30,30,30]))).toBeUndefined();});
 it('does not connect distant table columns',()=>{const words=rows([6,6,6]).map(w=>({...w,box:{...w.box,x:w.box.x+Number(w.id.split('-')[1])*200}}));expect(textSlopeCorrection(words)).toBeUndefined();});
});
