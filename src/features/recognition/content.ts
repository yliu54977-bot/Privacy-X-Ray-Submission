import type { OcrResult, OcrWord, PixelRect, RedactionRect } from '../../types';
import type { UniversalDetectionResult } from '../../v2/contracts';
import { readingBox } from '../../v2/detection/readingGeometry';

/** Browser-session data only. Never serialize to storage, telemetry or server APIs. */
export interface RecognizedContent {
  readonly imageId: string;
  readonly width: number;
  readonly height: number;
  readonly readingAngle: number;
  /** Original OCR transcript; display locally, not a reconstructed or corrected claim. */
  readonly text: string;
  readonly words: readonly RecognizedWord[];
  readonly lines: readonly TextSelection[];
  readonly groups: readonly TextSelection[];
  readonly visualRegions: readonly VisualSelection[];
  readonly warnings: readonly string[];
  readonly diagnostics: { readonly duplicateWords: number; readonly invalidWords: number };
}
export interface RecognizedWord extends OcrWord {
  readonly source: 'tesseract';
  readonly originalWordIds: readonly string[];
  readonly uncertain: boolean;
  /** Conflicting overlapping OCR hypotheses, never silently rewritten into the text. */
  readonly alternatives: readonly string[];
  /** Narrow CJK segments may omit strokes despite correct OCR text. */
  readonly geometryUncertain: boolean;
}
export interface TextSelection {
  readonly id: string;
  readonly kind: 'line' | 'group';
  readonly text: string;
  readonly wordIds: readonly string[];
  readonly lineIds: readonly string[];
  /** Per-word geometry, deliberately not one rectangle spanning whitespace/columns. */
  readonly boxes: readonly PixelRect[];
  readonly confidence: number;
  readonly uncertain: boolean;
  readonly source: 'tesseract';
}
export interface VisualSelection {
  readonly id: string;
  readonly kind: 'visual';
  readonly label: string;
  /** Locally decoded text, when supplied. Never open URLs automatically. */
  readonly text?: string;
  readonly source: readonly string[];
  readonly findingIds: readonly string[];
  readonly boxes: readonly PixelRect[];
  readonly uncertain: true;
}
export type ContentSelection = { readonly kind: 'word' | 'line' | 'group' | 'visual'; readonly id: string };

function clip(box: PixelRect, width: number, height: number): PixelRect | null {
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) return null;
  const x = Math.max(0, box.x), y = Math.max(0, box.y);
  const right = Math.min(width, box.x + box.width), bottom = Math.min(height, box.y + box.height);
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
function overlap(a: PixelRect, b: PixelRect): number {
  const area = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return area / (a.width * a.height + b.width * b.height - area);
}
const rectKey = (b: PixelRect) => `${b.x},${b.y},${b.width},${b.height}`;

/** No context, taxonomy, policy or sensitive-field prerequisite. Every valid OCR word survives. */
export function recognizeContent(ocr: OcrResult, visual?: UniversalDetectionResult): RecognizedContent {
  if (![ocr.width, ocr.height].every(n => Number.isFinite(n) && n > 0)) throw new Error('Invalid image dimensions.');
  const namespace = `${ocr.imageId}:${ocr.recognitionId ?? 'ocr'}`;
  const words: RecognizedWord[] = [];
  let duplicateWords = 0, invalidWords = 0;
  // Spatial buckets avoid comparing every word against every other word in a dense page.
  const buckets = new Map<string, number[]>();
  const cells = (b: PixelRect) => {
    const keys: string[] = [];
    // Centre + size buckets: highly overlapping boxes must have nearby centres.
    const size = 2 ** Math.ceil(Math.log2(Math.max(b.width, b.height, 1)));
    for (const scale of [size / 2, size, size * 2]) {
      const x = Math.floor((b.x + b.width / 2) / scale), y = Math.floor((b.y + b.height / 2) / scale);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) keys.push(`${scale}:${x + dx}:${y + dy}`);
    }
    return keys;
  };
  for (const raw of ocr.words) {
    const box = clip(raw.box, ocr.width, ocr.height);
    if (!box || !raw.text.trim()) { invalidWords++; continue; }
    const keys = cells(box);
    const candidates = new Set(keys.flatMap(key => buckets.get(key) ?? []));
    const duplicate = [...candidates].find(index => overlap(words[index]!.box, box) >= 0.8);
    const rb = readingBox({ ...raw, box }, raw.readingAngle ?? ocr.readingAngle);
    const geometryUncertain = /^[\u3400-\u9fff]+$/u.test(raw.text) && rb.width / raw.text.length < rb.height * 0.8;
    const confidence = Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0;
    if (duplicate !== undefined) {
      duplicateWords++;
      const previous = words[duplicate]!;
      const preferred = confidence > previous.confidence ? { ...raw, box, confidence } : previous;
      const alternatives = [...new Set([...previous.alternatives, previous.text, raw.text])].filter(text => text !== preferred.text);
      words[duplicate] = { ...preferred, id: previous.id, originalWordIds: [...previous.originalWordIds, raw.id],
        source: 'tesseract', alternatives, geometryUncertain: previous.geometryUncertain || geometryUncertain,
        uncertain: preferred.confidence < 0.7 || alternatives.length > 0 || previous.geometryUncertain || geometryUncertain };
      // The preferred geometry may move slightly; index both hypotheses.
      for (const key of keys) buckets.set(key, [...(buckets.get(key) ?? []), duplicate]);
      continue;
    }
    const index = words.length;
    words.push({ ...raw, box, confidence, id: `${namespace}:text:${index}`, originalWordIds: [raw.id],
      source: 'tesseract', uncertain: confidence < 0.7 || geometryUncertain, geometryUncertain, alternatives: [] });
    for (const key of keys) buckets.set(key, [...(buckets.get(key) ?? []), index]);
  }
  const wordIndexes = new Map(words.map((word, index) => [word.id, index]));
  const rawLines = new Map<string, RecognizedWord[]>();
  for (const word of words) rawLines.set(word.lineId, [...(rawLines.get(word.lineId) ?? []), word]);
  const lines: TextSelection[] = [];
  const lineGroups = new Map<string, string>();
  const makeSelection = (id: string, kind: 'line' | 'group', members: readonly RecognizedWord[], lineIds: readonly string[]): TextSelection => ({
    id, kind, text: members.map(w => w.text).join(' '), wordIds: members.map(w => w.id), lineIds,
    boxes: members.map(w => w.box), confidence: members.reduce((n, w) => n + w.confidence, 0) / members.length,
    uncertain: members.some(w => w.uncertain), source: 'tesseract',
  });
  for (const members of rawLines.values()) {
    const ordered = [...members].sort((a, b) => readingBox(a, a.readingAngle ?? ocr.readingAngle).x - readingBox(b, b.readingAngle ?? ocr.readingAngle).x);
    let row: RecognizedWord[] = [];
    const flush = () => {
      if (!row.length) return;
      const id = `${namespace}:line:${lines.length}`;
      const line = makeSelection(id, 'line', row, [id]);
      lines.push(line);
      // No invented semantic paragraph: only the engine's actual paragraph metadata.
      lineGroups.set(id, row[0]!.groupId ?? id);
      for (const word of row) words[wordIndexes.get(word.id)!] = { ...word, lineId: id };
      row = [];
    };
    for (const word of ordered) {
      const previous = row.at(-1);
      if (previous) {
        const a = readingBox(previous, previous.readingAngle ?? ocr.readingAngle), b = readingBox(word, word.readingAngle ?? ocr.readingAngle);
        const sameBaseline = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > Math.min(a.height, b.height) * 0.3;
        if (!sameBaseline || b.x - a.x - a.width > Math.max(a.height, b.height) * 3) flush();
      }
      row.push(word);
    }
    flush();
  }
  const groupMembers = new Map<string, TextSelection[]>();
  for (const line of lines) {
    const key = lineGroups.get(line.id)!;
    groupMembers.set(key, [...(groupMembers.get(key) ?? []), line]);
  }
  const byId = new Map(words.map(w => [w.id, w]));
  const groups = [...groupMembers.values()].map((members, i) => ({
    ...makeSelection(`${namespace}:group:${i}`, 'group', members.flatMap(line => line.wordIds.map(id => byId.get(id)!)), members.map(line => line.id)),
    text: members.map(line => line.text).join('\n'),
  }));
  for (const group of groups) for (const id of group.wordIds) {
    const index = wordIndexes.get(id)!; words[index] = { ...words[index]!, groupId: group.id };
  }
  const visualRegions: VisualSelection[] = [];
  if (visual?.source.kind === 'image' && visual.source.id === ocr.imageId) for (const finding of visual.findings) {
    if (finding.source.kind !== 'image' || finding.source.id !== ocr.imageId) continue;
    const evidence = finding.evidence.filter(e => e.source === 'image');
    if (!evidence.length) continue;
    const boxes = [...new Map((finding.boxes ?? []).flatMap(b => {
      const valid = clip(b, ocr.width, ocr.height); return valid ? [[rectKey(valid), valid] as const] : [];
    })).values()];
    if (!boxes.length) continue; // No invented boxes for unlocated content.
    const existing = visualRegions.find(r => r.boxes.length === boxes.length && r.boxes.every(a => boxes.some(b => overlap(a, b) >= 0.8)));
    if (existing) {
      const i = visualRegions.indexOf(existing);
      visualRegions[i] = { ...existing, findingIds: [...existing.findingIds, finding.id], source: [...new Set([...existing.source, ...evidence.map(e => e.detectorId)])] };
    } else visualRegions.push({ id: `${namespace}:visual:${visualRegions.length}`, kind: 'visual', label: finding.label, text: finding.value,
      findingIds: [finding.id], source: evidence.map(e => e.detectorId), boxes, uncertain: true });
  }
  return { imageId: ocr.imageId, width: ocr.width, height: ocr.height, readingAngle: ocr.readingAngle ?? 0, text: ocr.text, words, lines, groups, visualRegions,
    diagnostics: { duplicateWords, invalidWords }, warnings: ['Recognition can miss or misread content. Inspect the whole image and add manual masks where needed.',
      ...(visual?.source.id === ocr.imageId ? visual.coverage.warnings : [])] };
}

/** Resolves selections to actual leaf regions; never masks the whitespace between columns. */
export function selectionBoxes(content: RecognizedContent, selections: readonly ContentSelection[], imageId: string,
  masks: readonly RedactionRect[] = []): readonly PixelRect[] {
  if (imageId !== content.imageId) return [];
  // OCR locations remain unchanged. Selection geometry adds a visible, editable safety
  // margin rather than pretending the recognition boxes describe every glyph stroke.
  const protectedWord = (word: RecognizedWord): PixelRect => {
    const rb = readingBox(word, word.readingAngle ?? content.readingAngle);
    const extent = word.coverageBox ? clip(word.coverageBox, content.width, content.height) ?? word.box : word.box;
    const height = Math.min(128, rb.height);
    const along = Math.max(1, height * (word.geometryUncertain ? .6 : .18));
    const across = Math.max(1, height * .18);
    const angle = (word.readingAngle ?? content.readingAngle) * Math.PI / 180;
    const xPad = Math.abs(Math.cos(angle)) * along + Math.abs(Math.sin(angle)) * across;
    const yPad = Math.abs(Math.sin(angle)) * along + Math.abs(Math.cos(angle)) * across;
    return { x: extent.x - xPad, y: extent.y - yPad,
      width: extent.width + 2 * xPad, height: extent.height + 2 * yPad };
  };
  const lineBoxes = (line: TextSelection) => {
    const members = content.words.filter(word => line.wordIds.includes(word.id));
    // Join using unpadded geometry, so padding cannot connect separate columns/rows.
    const joined = joinNearbyBoxes(members.map(word => word.box), members[0]?.readingAngle ?? content.readingAngle);
    return joined.map(box => {
      const protectedMembers = members.filter(word => word.box.x >= box.x && word.box.y >= box.y &&
        word.box.x + word.box.width <= box.x + box.width + .001 &&
        word.box.y + word.box.height <= box.y + box.height + .001).map(protectedWord);
      const x = Math.min(box.x, ...protectedMembers.map(b => b.x));
      const y = Math.min(box.y, ...protectedMembers.map(b => b.y));
      return { x, y, width: Math.max(box.x + box.width, ...protectedMembers.map(b => b.x + b.width)) - x,
        height: Math.max(box.y + box.height, ...protectedMembers.map(b => b.y + b.height)) - y };
    });
  };
  const boxes = selections.flatMap(selection => selection.kind === 'word'
    ? content.words.filter(w => w.id === selection.id).map(protectedWord)
    : (selection.kind === 'line' ? content.lines : selection.kind === 'group' ? content.groups : content.visualRegions)
      .filter(item => item.id === selection.id).flatMap(item => selection.kind === 'visual' ? item.boxes : selection.kind === 'group'
        ? content.lines.filter(line => (item as TextSelection).lineIds.includes(line.id)).flatMap(lineBoxes)
        : lineBoxes(item as TextSelection)));
  const unique = new Map<string, PixelRect>();
  for (const box of boxes) {
    // One original-pixel guard plus outward rounding protects antialiased edges.
    const x = Math.max(0, Math.floor(box.x) - 1), y = Math.max(0, Math.floor(box.y) - 1);
    const rect = { x, y, width: Math.min(content.width, Math.ceil(box.x + box.width) + 1) - x,
      height: Math.min(content.height, Math.ceil(box.y + box.height) + 1) - y };
    if (!masks.some(m => m.imageId === imageId && m.shouldRedact && m.x <= rect.x && m.y <= rect.y &&
      m.x + m.width >= rect.x + rect.width && m.y + m.height >= rect.y + rect.height)) unique.set(rectKey(rect), rect);
  }
  const selected: PixelRect[] = [];
  for (const box of [...unique.values()].sort((a, b) => b.width * b.height - a.width * a.height)) {
    if (!selected.some(parent => parent.x <= box.x && parent.y <= box.y &&
      parent.x + parent.width >= box.x + box.width && parent.y + parent.height >= box.y + box.height)) selected.push(box);
  }
  return selected;
}


/** Close gaps inside an OCR row for whole-line/group selection, never across columns.
 * Raw word locations are retained; the selection layer adds safety margins. This does not certify missed glyphs. */
function joinNearbyBoxes(input: readonly PixelRect[], angle: number): PixelRect[] {
  const vertical = Math.abs(Math.sin(angle * Math.PI / 180)) > Math.abs(Math.cos(angle * Math.PI / 180));
  const output: PixelRect[] = [];
  for (const box of input) {
    const previous = output.at(-1);
    if (previous) {
      const horizontalGap = Math.max(0, box.x - previous.x - previous.width, previous.x - box.x - box.width);
      const verticalGap = Math.max(0, box.y - previous.y - previous.height, previous.y - box.y - box.height);
      const verticalOverlap = Math.min(box.y + box.height, previous.y + previous.height) - Math.max(box.y, previous.y);
      const horizontalOverlap = Math.min(box.x + box.width, previous.x + previous.width) - Math.max(box.x, previous.x);
      const sameRow = verticalOverlap > Math.min(box.height, previous.height) * .5 &&
        horizontalGap <= Math.min(box.height, previous.height) * .75;
      const sameColumn = horizontalOverlap > Math.min(box.width, previous.width) * .5 &&
        verticalGap <= Math.min(box.width, previous.width) * .75;
      if (vertical ? sameColumn : sameRow) {
        const x = Math.min(box.x, previous.x), y = Math.min(box.y, previous.y);
        output[output.length - 1] = { x, y, width: Math.max(box.x + box.width, previous.x + previous.width) - x,
          height: Math.max(box.y + box.height, previous.y + previous.height) - y };
        continue;
      }
    }
    output.push(box);
  }
  return output;
}
