import type { OcrWord, PixelRect } from '../../types';

export type LocatedLine = { text: string; words: { word: OcrWord; start: number; end: number }[] };
export function locatedLine(words: readonly OcrWord[]): LocatedLine {
  let text = '';
  const positioned = words.map(word => {
    if (text) text += ' ';
    const start = text.length; text += word.text;
    return { word, start, end: text.length };
  });
  return { text, words: positioned };
}
const bounds = (words: readonly OcrWord[]): PixelRect => {
  const x = Math.min(...words.map(w => w.box.x)), y = Math.min(...words.map(w => w.box.y));
  return { x, y, width: Math.max(...words.map(w => w.box.x + w.box.width)) - x,
    height: Math.max(...words.map(w => w.box.y + w.box.height)) - y };
};

/** Follow a nearby address column; labels, large gaps and unrelated prose end the block. */
export function addressContinuation(lines: readonly LocatedLine[], first: readonly OcrWord[],
  firstRow: number, labelX: number, hasLabel: (text: string) => boolean): OcrWord[] {
  if (!first.length) return [];
  const result = [...first], initial = bounds(first);
  const heights = first.map(w => w.box.height).sort((a, b) => a - b);
  const h = heights[Math.floor(heights.length / 2)]!;
  let previous = initial, rowCount = 1;
  for (const line of lines.slice(firstRow + 1)) {
    const lineBounds = bounds(line.words.map(w => w.word));
    // A different column can sit on the same baseline; it is not a continuation.
    if (lineBounds.y < previous.y + h * 0.65) continue;
    if (lineBounds.y - (previous.y + previous.height) > h * 1.25 || result.length > 160) break;
    const start = line.words.findIndex(item => item.word.box.x >= Math.min(initial.x, labelX) - h * 0.65 &&
      item.word.box.x <= initial.x + h * 2);
    if (start < 0) continue;
    const run: OcrWord[] = [];
    for (const item of line.words.slice(start)) {
      const last = run.at(-1);
      if (last && item.word.box.x - (last.box.x + last.box.width) > h * 2.5) break;
      // Do not cross into a new field or a second address column.
      const candidate = locatedLine([...run, item.word]).text;
      if (hasLabel(candidate)) { run.length = 0; break; }
      run.push(item.word);
    }
    const value = locatedLine(run).text.trim();
    if (!run.length || !isAddressContinuation(value)) break;
    result.push(...run); previous = bounds(run); rowCount++;
    // Address blocks are bounded to six physical rows.
    if (rowCount >= 6 || previous.y - initial.y > h * 10) break;
  }
  return result;
}

function isAddressContinuation(value: string): boolean {
  const compact = value.replace(/\s/g, '');
  if (!value || value.length > 180 || /[:：@]/.test(value) || /\b(?:thank|please|total|balance|invoice|customer|payment|signature|issued|valid|expires|confidential|example only|do not)\b/i.test(value)) return false;
  if (/\p{Script=Han}/u.test(value))
    return /[省市区县镇乡村街路巷弄号栋幢楼室户园庄里]|单元/u.test(compact) && !/[。！？]/u.test(value);
  if (/^(?:\d{5}(?:-\d{4})?|\d{6})$/.test(compact)) return true;
  if (/^(?:apt\.?|apartment|unit|suite|ste\.?|floor|fl\.?|building|bldg\.?|po\s*box|p\.?o\.?\s*box)\s*#?\s*[\p{L}\d-]/iu.test(value)) return true;
  if (/\b(?:\d{5}(?:-\d{4})?|[A-Z]\d[A-Z]\s*\d[A-Z]\d|[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i.test(value) && /\p{L}/u.test(value)) return true;
  if (/^\d{1,6}\s+.*\b(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|way|boulevard|blvd)\b/i.test(value)) return true;
  // A short title-cased locality/country under an explicit address is plausible,
  // but long sentences and all-digit identifiers are not address continuations.
  return /^(?:[\p{Lu}][\p{L}.'’-]*,?\s*){1,5}$/u.test(value);
}
