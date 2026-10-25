import { expect,it } from 'vitest';
import { completeDetailGrid } from './detailGrid';
for(const [width,height] of [[3100,4600],[850,12000],[12000,850],[4000,4000],[2000,8000]])it(`covers ${width}x${height} without skipping intermediate regions`,()=>{
 const tiles=completeDetailGrid(width!,height!)!;
 expect(tiles.length).toBeLessThanOrEqual(18);
 expect(tiles.every(t=>t.width*t.height<=1_280_000&&Math.max(t.width,t.height)<=3000&&t.x>=0&&t.y>=0&&t.x+t.width<=width!&&t.y+t.height<=height!)).toBe(true);
 const edges=[...new Set([0,height!,...tiles.flatMap(t=>[t.y,t.y+t.height])])].sort((a,b)=>a-b);
 for(let i=1;i<edges.length;i++){
  const y=(edges[i-1]!+edges[i]!)/2;
  const row=tiles.filter(t=>t.y<=y&&t.y+t.height>=y).sort((a,b)=>a.x-b.x);
  let end=0;for(const tile of row){expect(tile.x).toBeLessThanOrEqual(end);end=Math.max(end,tile.x+tile.width);}expect(end).toBe(width);
 }
});
it('refuses impossible aspect ratios and invalid dimensions without unbounded allocation',()=>{
 expect(completeDetailGrid(100000,100)).toBeUndefined();
 for(const n of [0,-1,Infinity,NaN])expect(completeDetailGrid(n,100)).toBeUndefined();
});
