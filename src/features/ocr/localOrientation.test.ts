import {expect,it} from 'vitest';
import {orientationRegions} from './localOrientation';
import type {OcrWord} from '../../types';
const w=(x:number,y:number,text='a',confidence=.6):OcrWord=>({id:`${x}-${y}`,lineId:'row',text,confidence,box:{x,y,width:20,height:22}});
it('targets bounded low-confidence fragmented vertical text',()=>{
 const words=Array.from({length:8},(_,i)=>w(100,100+i*28));
 const regions=orientationRegions(words,1000,1000);expect(regions).toHaveLength(1);
 expect(regions[0]!.x).toBeLessThan(100);expect(regions[0]!.y+regions[0]!.height).toBeGreaterThan(318);
});
it('does not schedule ordinary horizontal lines, separated table rows, digits or confident Chinese columns',()=>{
 for(const words of [Array.from({length:8},(_,i)=>w(100+i*28,100)),Array.from({length:8},(_,i)=>w(100,100+i*90)),Array.from({length:8},(_,i)=>w(100,100+i*28,'7')),Array.from({length:8},(_,i)=>w(100,100+i*28,'字',.96))])expect(orientationRegions(words,1000,1000)).toHaveLength(0);
});
it('caps candidates and clips crop padding at the source edges',()=>{
 const words=Array.from({length:10},(_,c)=>Array.from({length:8},(_,i)=>w(c*90, i*28))).flat();
 const regions=orientationRegions(words,1000,1000);expect(regions).toHaveLength(4);expect(regions.every(r=>r.x>=0&&r.y>=0&&r.x+r.width<=1000&&r.y+r.height<=1000)).toBe(true);
});
it('keeps overlapping segmented glyphs and provides two glyphs of crop-end recovery',()=>{
 const words=[w(100,100,'中'),w(100,128,'文'),w(100,150,'方'),w(100,166,'向'),w(100,182,'测')];
 const [region]=orientationRegions(words,500,500);
 expect(region).toBeDefined();expect(region!.y).toBeLessThanOrEqual(60);
 expect(region!.y+region!.height).toBeGreaterThanOrEqual(244);
});
