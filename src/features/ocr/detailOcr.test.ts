import { describe, expect, it } from 'vitest';
import type { OcrWord } from '../../types';
import { ocrDetailTiles, mergeDetailWords, wordsAsText, completeDetailWord } from './detailOcr';
const word=(text:string,x=10,y=10,confidence=0.9,width=100):OcrWord=>({id:'old',lineId:'old',text,confidence,box:{x,y,width,height:24}});
describe('native detail OCR',()=>{
  it('covers a normal large image with bounded, overlapping original-pixel crops',()=>{
    const tiles=ocrDetailTiles(4000,4000);
    expect(tiles).toHaveLength(18);
    expect(tiles.every(t=>t.width*t.height<=1600*800&&t.x>=0&&t.y>=0&&t.x+t.width<=4000&&t.y+t.height<=4000)).toBe(true);
    for(const x of [0,1200,2500,3999])for(const y of [0,1200,2500,3999])expect(tiles.some(t=>t.x<=x&&t.y<=y&&t.x+t.width>x&&t.y+t.height>y)).toBe(true);
  });
  it('caps unusually long images while retaining far-edge inspection',()=>{
    const tiles=ocrDetailTiles(100000,100);
    expect(tiles).toHaveLength(18);expect(tiles.at(-1)!.x+tiles.at(-1)!.width).toBe(100000);
  });
  it('adds new high-confidence text without duplicating overlapping words',()=>{
    const result=mergeDetailWords([word('Email'),word('alex@example.test',120)], [word('Email',11),word('alex@example.test',121),word('827364',300)]);
    expect(result.map(w=>w.text)).toEqual(['Email','alex@example.test','827364']);
    expect(new Set(result.map(w=>w.id)).size).toBe(3);
    expect(wordsAsText(result)).toBe('Email alex@example.test 827364');
  });
  it('joins improved segmentation and rejects weak conflicting crop text',()=>{
    const original=[word('alex',10,10,0.8,30),word('@example.test',45,10,0.8,80)];
    expect(mergeDetailWords(original,[word('alex@example.test',10,10,0.9,115)]).map(w=>w.text)).toEqual(['alex@example.test']);
    expect(mergeDetailWords([word('827364',10,10,0.92)],[word('8273',10,10,0.7)]).map(w=>w.text)).toEqual(['827364']);
    expect(mergeDetailWords([], [word('noise',10,10,0.4)])).toHaveLength(0);
  });
  it('replaces weaker conflicting OCR only with a clearly stronger reading',()=>{
    expect(mergeDetailWords([word('823364',10,10,0.65)],[word('827364',10,10,0.93)]).map(w=>w.text)).toEqual(['827364']);
  });
  it('does not conflate equal words at distinct image positions and rebuilds line IDs',()=>{
    const result=mergeDetailWords([word('Name',10,10)],[word('Name',10,100)]);
    expect(result).toHaveLength(2);expect(result[0]!.lineId).not.toBe(result[1]!.lineId);expect(wordsAsText(result)).toBe('Name\nName');
  });
  it('rejects crop-edge fragments but permits words at real image boundaries',()=>{
    expect(completeDetailWord(word('partial',0),{x:1280,y:0,width:1600,height:1000},4000,1000)).toBe(false);
    expect(completeDetailWord(word('edge',0),{x:0,y:0,width:1600,height:1000},4000,1000)).toBe(true);
    expect(completeDetailWord(word('partial',1510,10,0.9,90),{x:0,y:0,width:1600,height:1000},4000,1000)).toBe(false);
  });
});

it('never discards a full identifier for a confident partial crop token',()=>{
 const original=word('alex@example.test',100,100,.9,200);
 expect(mergeDetailWords([original],[word('alex',100,100,.99,40)]).map(w=>w.text)).toEqual(['alex@example.test']);
});
it('preserves deskewed line relationships when a detail pass contributes no words',()=>{
 const words=[word('First',100,200,.9,40),word('Second',500,200-400*Math.tan(Math.PI/18),.9,40)];
 const merged=mergeDetailWords(words,[],{rotation:'none',width:2000,height:2000,readingAngle:10});
 expect(merged[0]!.lineId).toBe(merged[1]!.lineId);
 expect(wordsAsText(merged)).toBe('First Second');
});

it('allows several real detail tokens to replace a badly segmented overview region together',()=>{
 const original=word('E',100,100,0,200);
 const result=mergeDetailWords([original],[word('Email:',100,100,.95,60),word('beta@example.test',160,100,.95,140)]);
 expect(result.map(w=>w.text)).toEqual(['Email:','beta@example.test']);
});
it('does not count duplicated fragments twice when checking replacement coverage',()=>{
 const original=word('complete@example.test',100,100,.9,200);
 const result=mergeDetailWords([original],[word('complete',100,100,.99,40),word('complete',100,100,.99,40)]);
 expect(result.map(w=>w.text)).toEqual(['complete@example.test']);
});

it('recovers a collapsed wide overview line without demanding coverage of whitespace',()=>{
 const old=word('E',10,10,.4,450);
 const detail=[word('Archive',10,10,.95,130),word('entry',170,10,.95,100),word('731820',320,10,.95,140)];
 expect(mergeDetailWords([old],detail).map(w=>w.text)).toEqual(['Archive','entry','731820']);
 expect(mergeDetailWords([old],detail.slice(0,2)).some(w=>w.text==='E')).toBe(true);
 expect(mergeDetailWords([{...old,text:'complete-identifier'}],detail).some(w=>w.text==='complete-identifier')).toBe(true);
 expect(mergeDetailWords([old],detail.map(w=>({...w,box:{...w.box,y:60}}))).some(w=>w.text==='E')).toBe(true);
});

it('keeps short punctuation in its text row without joining the next row',()=>{
 const result=mergeDetailWords([word('Archive',10,10),{...word('-',120,21,.9,8),box:{x:120,y:21,width:8,height:2}},word('entry',140,10),word('Next',10,50)],[]);
 expect(result.slice(0,3).every(w=>w.lineId===result[0]!.lineId)).toBe(true);
 expect(result[3]!.lineId).not.toBe(result[0]!.lineId);
});
