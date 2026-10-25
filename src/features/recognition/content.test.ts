import { describe, expect, it } from 'vitest';
import type { OcrResult, OcrWord, RedactionRect } from '../../types';
import type { UniversalDetectionResult } from '../../v2/contracts';
import { recognizeContent, selectionBoxes } from './content';
const word = (id: string, x = 10, text = 'Ordinary', confidence = .9): OcrWord => ({ id, lineId: 'line', groupId: 'p', text, confidence,
  box: { x, y: 20, width: 60, height: 20 } });
const ocr = (words: readonly OcrWord[], readingAngle = 0): OcrResult => ({ imageId: 'image', width: 500, height: 500,
  language: 'eng', text: words.map(w => w.text).join(' '), words, readingAngle });

describe('all-content recognition', () => {
  it('retains ordinary words, punctuation and uncertain text without classification', () => {
    const result = recognizeContent(ocr([word('a'), word('b', 90, '!', .3)]));
    expect(result.words.map(w => w.text)).toEqual(['Ordinary', '!']);
    expect(result.words[1]?.uncertain).toBe(true);
    expect(result.words[0]?.source).toBe('tesseract');
    expect(result.lines[0]?.text).toBe('Ordinary !');
  });
  it('deduplicates overlapping hypotheses and exposes conflicting text without mutating input', () => {
    const input = ocr([word('a', 10, 'O12', .3), word('b', 11, '012', .9), word('c', 200, '012')]);
    const result = recognizeContent(input);
    expect(result.words).toHaveLength(2);
    expect(result.words[0]).toMatchObject({ text: '012', alternatives: ['O12'], uncertain: true, originalWordIds: ['a', 'b'] });
    expect(result.diagnostics.duplicateWords).toBe(1);
    expect(input.words[0]?.text).toBe('O12');
  });
  it('splits columns but masks groups through word boxes without masking their whitespace', () => {
    const result = recognizeContent(ocr([word('a'), word('b', 300)]));
    expect(result.lines).toHaveLength(2);
    expect(result.groups).toHaveLength(1);
    const boxes = selectionBoxes(result, [{ kind: 'group', id: result.groups[0]!.id }], 'image');
    expect(boxes).toHaveLength(2);
    expect(boxes.every(b => b.width < 100)).toBe(true);
    expect(result.words.every(w => result.lines.some(l => l.id === w.lineId))).toBe(true);
  });
  it('orders rotated text in reading space while retaining original pixel geometry', () => {
    const a = { ...word('a', 20, 'First'), box: { x: 20, y: 100, width: 20, height: 50 } };
    const b = { ...word('b', 20, 'Second'), box: { x: 20, y: 40, width: 20, height: 50 } };
    const result = recognizeContent(ocr([b, a], 90));
    expect(result.lines[0]?.text).toBe('First Second');
    expect(result.words[0]?.box).toEqual(b.box);
  });
  it('clips edge boxes and rejects invalid/empty geometry without inventing locations', () => {
    const result = recognizeContent(ocr([word('a', -20), word('b', 600), word('c', NaN), word('d', 100, ' ')]));
    expect(result.words).toHaveLength(1);
    expect(result.words[0]?.box).toEqual({ x: 0, y: 20, width: 40, height: 20 });
    expect(result.diagnostics.invalidWords).toBe(3);
  });
  it('deduplicates parent/child selections and rejects stale source identities and unknown IDs', () => {
    const result = recognizeContent(ocr([word('a')]));
    const selected = [{ kind: 'word' as const, id: result.words[0]!.id }, { kind: 'line' as const, id: result.lines[0]!.id }];
    expect(selectionBoxes(result, selected, 'image')).toHaveLength(1);
    expect(selectionBoxes(result, selected, 'new-image')).toEqual([]);
    expect(selectionBoxes(result, [{ kind: 'word', id: 'unknown' }], 'image')).toEqual([]);
    const mask: RedactionRect = { ...selectionBoxes(result, selected, 'image')[0]!, id: 'mask', imageId: 'image', source: 'manual', shouldRedact: true };
    expect(selectionBoxes(result, selected, 'image', [mask])).toEqual([]);
    expect(selectionBoxes(result, selected, 'image', [{ ...mask, imageId: 'old' }])).toHaveLength(1);
  });
  it('preserves source-scoped face and QR regions, ignoring unlocated and unrelated fields', () => {
    const visual: UniversalDetectionResult = { source: { kind: 'image', id: 'image' }, coverage: { source: { kind: 'image', id: 'image' }, areas: [], warnings: ['Faces may be missed.'] },
      findings: ['face', 'qr', 'unlocated'].map((id, i) => ({ id, source: { kind: 'image', id: 'image' }, status: 'UNCERTAIN', categoryIds: [], label: id,
        boxes: i < 2 ? [{ x: 100 * i, y: 200, width: 50, height: 50 }] : undefined,
        evidence: [{ id, detectorId: id, source: 'image', method: 'visual_object', explanation: 'Local detector' }] })) };
    const result = recognizeContent(ocr([]), visual);
    expect(result.visualRegions).toHaveLength(2);
    expect(selectionBoxes(result, [{ kind: 'visual', id: result.visualRegions[0]!.id }], 'image')).toHaveLength(1);
    expect(result.warnings).toContain('Faces may be missed.');
    expect(recognizeContent(ocr([]), { ...visual, source: { kind: 'image', id: 'other' } }).visualRegions).toEqual([]);
  });
  it('creates stable, source-scoped IDs without embedding text values', () => {
    const input = ocr([word('a')]);
    expect(recognizeContent(input)).toEqual(recognizeContent(input));
    expect(recognizeContent(input).words[0]?.id).not.toContain('Ordinary');
  });
});
it('flags narrow Chinese word geometry and closes intraline segmentation gaps for line selection', () => {
  const input = ocr([
    { ...word('a', 20, '图'), box: { x: 20, y: 20, width: 26, height: 28 } },
    { ...word('b', 62, '书'), box: { x: 62, y: 20, width: 14, height: 28 } },
  ]);
  const content = recognizeContent(input);
  expect(content.words[1]?.geometryUncertain).toBe(true);
  expect(content.words[1]?.uncertain).toBe(true);
  expect(content.words[1]?.box).toEqual(input.words[1]?.box);
  const boxes = selectionBoxes(content, [{ kind: 'line', id: content.lines[0]!.id }], 'image');
  expect(boxes).toEqual([{ x: 13, y: 13, width: 81, height: 42 }]);
});
it('does not join distinct horizontal lines when selecting a paragraph', () => {
  const content = recognizeContent(ocr([word('a'), { ...word('b'), lineId: 'second', box: { x: 10, y: 50, width: 60, height: 20 } }]));
  expect(selectionBoxes(content, [{ kind: 'group', id: content.groups[0]!.id }], 'image')).toHaveLength(2);
  expect(content.words[0]?.groupId).toBe(content.groups[0]?.id);
});
it('does not reuse selection IDs after rescanning the same image', () => {
  const first = recognizeContent({ ...ocr([word('a')]), recognitionId: 'first' });
  const second = recognizeContent({ ...ocr([word('a')]), recognitionId: 'second' });
  expect(selectionBoxes(second, [{ kind: 'word', id: first.words[0]!.id }], 'image')).toEqual([]);
});
it('removes redundant child masks when selecting a complete line as well as its words', () => {
  const content = recognizeContent(ocr([word('a'), word('b', 75)]));
  const boxes = selectionBoxes(content, [{ kind: 'line', id: content.lines[0]!.id },
    ...content.words.map(w => ({ kind: 'word' as const, id: w.id }))], 'image');
  expect(boxes).toHaveLength(1);
});

it('expands selected narrow CJK strokes without altering OCR localization or manual masks', () => {
  const raw = { ...word('a', 62, '书'), box: { x: 62, y: 20, width: 14, height: 28 } };
  const content = recognizeContent(ocr([raw]));
  const selected = selectionBoxes(content, [{ kind: 'word', id: content.words[0]!.id }], 'image');
  expect(content.words[0]!.box).toEqual(raw.box);
  expect(selected[0]!.x).toBeLessThanOrEqual(46);
  expect(selected[0]!.x + selected[0]!.width).toBeGreaterThanOrEqual(90);
});
it('clips safety margins at all image edges and keeps rotated geometry in source pixels', () => {
  const content = recognizeContent(ocr([{...word('a'),box:{x:0,y:0,width:20,height:40}},
    {...word('b'),lineId:'b',box:{x:490,y:480,width:10,height:20}}],90));
  for (const b of selectionBoxes(content,content.words.map(w=>({kind:'word',id:w.id})), 'image')) {
    expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x+b.width).toBeLessThanOrEqual(500);expect(b.y+b.height).toBeLessThanOrEqual(500);
  }
});

it('does not deduplicate distinct glyphs whose safety extents overlap',()=>{
 const a={...word('a',40,'下'),box:{x:40,y:20,width:15,height:28},coverageBox:{x:20,y:20,width:65,height:28}};
 const b={...word('b',60,'午'),box:{x:60,y:20,width:20,height:28},coverageBox:{x:20,y:20,width:65,height:28}};
 const result=recognizeContent(ocr([a,b]));
 expect(result.words.map(w=>w.text)).toEqual(['下','午']);expect(result.diagnostics.duplicateWords).toBe(0);
 expect(selectionBoxes(result,result.words.map(w=>({kind:'word',id:w.id})),'image')[0]!.x).toBeLessThan(20);
});

it('keeps locally recovered vertical text ordered and selectable alongside horizontal text',()=>{
 const ocr:OcrResult={imageId:'mixed',width:500,height:500,language:'eng',text:'Top First Second',readingAngle:0,
  words:[{id:'top',lineId:'horizontal',text:'Top',confidence:.95,box:{x:20,y:20,width:50,height:20}},
   {id:'second',lineId:'vertical',text:'Second',confidence:.94,readingAngle:-90,box:{x:300,y:170,width:20,height:70}},
   {id:'first',lineId:'vertical',text:'First',confidence:.94,readingAngle:-90,box:{x:300,y:100,width:20,height:60}}]};
 const content=recognizeContent(ocr);const line=content.lines.find(l=>l.text==='First Second')!;
 expect(line).toBeDefined();expect(content.words).toHaveLength(3);
 const masks=selectionBoxes(content,[{kind:'line',id:line.id}],ocr.imageId);
 expect(masks).toHaveLength(1);expect(masks[0]!.x).toBeGreaterThan(280);
 expect(masks[0]!.y).toBeLessThan(100);expect(masks[0]!.y+masks[0]!.height).toBeGreaterThan(240);
 expect(content.words.find(w=>w.text==='First')!.box).toEqual(ocr.words[2]!.box);
});
