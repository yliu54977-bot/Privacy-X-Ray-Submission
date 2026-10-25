import type { OcrWord, PixelRect } from '../../types';
import type { DetectionInput, PrivacyDetector } from '../contracts';

const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_READ_PIXELS = 4_000_000;
type Run = { start: number; end: number };
type Profile = { start: number; end: number; edges: number[]; unit: number };
type Track = { first: number; last: number; count: number; min: number; max: number; firstProfile: Profile; profile: Profile };

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 1;
}
function varying(values: number[]): boolean {
  const average = values.reduce((sum, n) => sum + n, 0) / values.length;
  return values.filter(n => Math.abs(n - average) > Math.max(0.5, average * 0.18)).length >= 4;
}

/** Long, irregular, alternating runs are proposals, never a decoded barcode. */
function profiles(gray: Uint8Array, width: number, axisLength: number, line: number,
  vertical: boolean, threshold: number): Profile[] {
  const pixel = (position: number) => gray[vertical ? position * width + line : line * width + position]!;
  const runs: Run[] = [];
  let start = -1;
  for (let position = 0; position <= axisLength; position++) {
    const dark = position < axisLength && pixel(position) < threshold;
    if (dark && start < 0) start = position;
    if (!dark && start >= 0) { runs.push({ start, end: position }); start = -1; }
  }
  if (runs.length < 18) return [];
  const lengths = runs.flatMap((run, i) => [run.end - run.start,
    ...(i ? [run.start - runs[i - 1]!.end] : [])]).filter(n => n <= 40);
  const maxGap = Math.max(7, median(lengths) * 5);
  const groups: Run[][] = [];
  let group: Run[] = [];
  for (const run of runs) {
    if (run.end - run.start > maxGap || (group.length && run.start - group.at(-1)!.end > maxGap)) {
      if (group.length) groups.push(group);
      group = [];
    }
    if (run.end - run.start <= maxGap) group.push(run);
  }
  if (group.length) groups.push(group);
  return groups.slice(0, 64).flatMap(items => {
    if (items.length < 18) return [];
    const first = items[0]!.start, end = items.at(-1)!.end;
    const barWidths = items.map(run => run.end - run.start);
    const gapWidths = items.slice(1).map((run, i) => run.start - items[i]!.end);
    const darkWidth = barWidths.reduce((sum, n) => sum + n, 0);
    if (end - first < 60 || darkWidth / (end - first) < 0.22 || darkWidth / (end - first) > 0.78 ||
      (!varying(barWidths) && !varying(gapWidths))) return [];
    let darkSum = 0, lightSum = 0;
    for (let x = first; x < end; x++) {
      if (pixel(x) < threshold) darkSum += pixel(x); else lightSum += pixel(x);
    }
    if (lightSum / (end - first - darkWidth) - darkSum / darkWidth < 32) return [];
    return [{ start: first, end, edges: items.flatMap(run => [run.start - first, run.end - first]),
      unit: median([...barWidths, ...gapWidths]) }];
  });
}

function matching(a: Profile, b: Profile): boolean {
  const lengthA = a.end - a.start, lengthB = b.end - b.start;
  if (a.edges.length !== b.edges.length || Math.abs(a.start - b.start) > Math.max(5, lengthA * 0.025) ||
    Math.abs(lengthA - lengthB) > lengthA * 0.04) return false;
  const tolerance = Math.max(1.25, Math.min(a.unit, b.unit) * 0.65);
  return a.edges.filter((edge, i) => Math.abs(edge / lengthA * lengthB - b.edges[i]!) <= tolerance).length /
    a.edges.length >= 0.94;
}

/** EAN-style guards can extend past the dense barcode body. Follow only runs
 * whose two edges match actual bars, for at most a short fraction of its height. */
function guardEdge(gray: Uint8Array, width: number, lineCount: number, vertical: boolean,
  threshold: number, profile: Profile, start: number, direction: number, limit: number): number {
  let edge = start;
  for (let distance = 1; distance <= limit; distance++) {
    const line = start + distance * direction;
    if (line < 0 || line >= lineCount) break;
    const runs: Run[] = [];
    let runStart = -1;
    for (let position = profile.start; position <= profile.end; position++) {
      const dark = position < profile.end && gray[vertical ? position * width + line : line * width + position]! < threshold;
      if (dark && runStart < 0) runStart = position;
      if (!dark && runStart >= 0) { runs.push({ start: runStart - profile.start, end: position - profile.start }); runStart = -1; }
    }
    if (runs.length < 2 || runs.some(run => !profile.edges.some((begin, index) => index % 2 === 0 &&
      Math.abs(begin - run.start) <= 1 && Math.abs(profile.edges[index + 1]! - run.end) <= 1))) break;
    edge = line;
  }
  return edge;
}

async function inspectAxis(gray: Uint8Array, width: number, height: number, vertical: boolean): Promise<PixelRect[]> {
  const axisLength = vertical ? height : width, lineCount = vertical ? width : height;
  const step = Math.max(1, Math.min(4, Math.floor(lineCount / 700)));
  const boxes: PixelRect[] = [];
  for (const threshold of [80, 128, 176, 216]) {
    // Let loading feedback and cancellation UI paint between bounded inspections.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    let active: Track[] = [];
    const finish = (track: Track) => {
      const across = track.max - track.min, along = track.last - track.first + step;
      if (track.count < 6 || track.count * step / along < 0.8 || along < Math.max(16, across / 18) ||
        across / along < 1.6) return;
      const start = Math.max(0, track.min - 2), end = Math.min(axisLength, track.max + 2);
      const extension = Math.min(32, Math.ceil(along * 0.2));
      const top = guardEdge(gray, width, lineCount, vertical, threshold, track.firstProfile, track.first, -1, extension);
      const bottom = guardEdge(gray, width, lineCount, vertical, threshold, track.profile, track.last, 1, extension);
      const first = Math.max(0, top - step), last = Math.min(lineCount, bottom + step + 1);
      boxes.push(vertical ? { x: first, y: start, width: last - first, height: end - start } :
        { x: start, y: first, width: end - start, height: last - first });
    };
    for (let line = 0; line < lineCount; line += step) {
      const current = profiles(gray, width, axisLength, line, vertical, threshold);
      const used = new Set<Track>();
      for (const profile of current) {
        const track = active.find(candidate => !used.has(candidate) && line - candidate.last <= step * 2 &&
          matching(candidate.profile, profile));
        if (track) {
          track.last = line; track.count++; track.min = Math.min(track.min, profile.start);
          track.max = Math.max(track.max, profile.end); track.profile = profile; used.add(track);
        } else active.push({ first: line, last: line, count: 1, min: profile.start, max: profile.end, firstProfile: profile, profile });
      }
      active = active.filter(track => { if (line - track.last > step * 2) { finish(track); return false; } return true; });
    }
    active.forEach(finish);
  }
  return boxes;
}

function intersection(a: PixelRect, b: PixelRect): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}
function union(a: PixelRect, b: PixelRect): PixelRect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/** Work stays bounded; requests respect the pixel-source limit without rescaling coordinates. */
async function grayscale(input: DetectionInput): Promise<Uint8Array> {
  const { imageWidth: width, imageHeight: height, imagePixels } = input;
  const gray = new Uint8Array(width * height);
  const tileWidth = Math.min(width, 2000), tileHeight = Math.max(1, Math.floor(MAX_READ_PIXELS / tileWidth));
  for (let y = 0; y < height; y += tileHeight) for (let x = 0; x < width; x += tileWidth) {
    const region = { x, y, width: Math.min(tileWidth, width - x), height: Math.min(tileHeight, height - y) };
    const pixels = await imagePixels!.readPixels(region);
    if (pixels.width !== region.width || pixels.height !== region.height || pixels.data.length !== region.width * region.height * 4)
      throw new RangeError('Barcode pixel source returned invalid dimensions.');
    for (let row = 0; row < region.height; row++) for (let column = 0; column < region.width; column++) {
      const at = (row * region.width + column) * 4;
      const alpha = pixels.data[at + 3]! / 255;
      gray[(y + row) * width + x + column] = Math.round((pixels.data[at]! * 0.299 +
        pixels.data[at + 1]! * 0.587 + pixels.data[at + 2]! * 0.114) * alpha + 255 * (1 - alpha));
    }
  }
  return gray;
}

// OCR boxes measure visible glyphs, not font line height. Printed captions can
// sit more than one glyph-height away while remaining directly beside a code.
const captionGapLimit = (glyphHeight: number): number => Math.min(32, Math.max(4, glyphHeight * 1.5));

function captionWords(box: PixelRect, words: readonly OcrWord[]): OcrWord[][] {
  const vertical = box.height > box.width;
  const project = (rect: PixelRect) => vertical ? { x: rect.y, y: rect.x, width: rect.height, height: rect.width } : rect;
  const bar = project(box);
  const nearby = words.filter(word => {
    if (!/^\d[\d -]*$/.test(word.text.trim()) || !Number.isFinite(word.confidence) || word.confidence < 0.55) return false;
    const bounds = project(word.box);
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return false;
    const overlap = Math.max(0, Math.min(bar.x + bar.width, bounds.x + bounds.width) - Math.max(bar.x, bounds.x));
    const gap = Math.max(bar.y - bounds.y - bounds.height, bounds.y - bar.y - bar.height);
    return overlap / bounds.width >= 0.85 && gap >= -2 && gap <= captionGapLimit(bounds.height);
  }).sort((a, b) => project(a.box).x - project(b.box).x);
  // OCR may split one caption across line IDs or reuse a line ID for another
  // column. Local geometry prevents either from losing or absorbing the caption.
  const lines: OcrWord[][] = [];
  for (const word of nearby) {
    const current = project(word.box);
    const line = lines.find(candidate => {
      const previous = project(candidate.at(-1)!.box);
      const overlap = Math.min(previous.y + previous.height, current.y + current.height) - Math.max(previous.y, current.y);
      const gap = current.x - previous.x - previous.width;
      return overlap >= Math.min(previous.height, current.height) * 0.6 && gap >= -2 &&
        gap <= Math.max(12, Math.min(previous.height, current.height) * 1.5);
    });
    if (line) line.push(word); else lines.push([word]);
  }
  return lines.filter(line => {
    if (!/^\d{6,32}$/.test(line.map(word => word.text).join('').replace(/[\s-]/g, ''))) return false;
    const bounds = project(line.map(word => word.box).reduce(union));
    const overlap = Math.max(0, Math.min(bar.x + bar.width, bounds.x + bounds.width) - Math.max(bar.x, bounds.x));
    const gap = Math.max(bar.y - bounds.y - bounds.height, bounds.y - bar.y - bar.height);
    if (bounds.width < bounds.height * 2 || overlap / bounds.width < 0.85 || overlap / bar.width < 0.2 ||
      gap < -2 || gap > captionGapLimit(bounds.height)) return false;
    const spaceTop = Math.min(bar.y + bar.height, bounds.y + bounds.height);
    const spaceBottom = Math.max(bar.y, bounds.y);
    return !words.some(word => !line.includes(word) && (() => {
      const other = project(word.box);
      return other.y >= spaceTop && other.y + other.height <= spaceBottom &&
        Math.min(other.x + other.width, bounds.x + bounds.width) - Math.max(other.x, bounds.x) > 0;
    })());
  });
}

function paddedCaption(box: PixelRect, width: number, height: number): PixelRect {
  // Cover OCR edge rounding and antialiasing without relying on its CSS outline.
  const padding = Math.max(2, Math.min(5, Math.min(box.width, box.height) * 0.12));
  const x = Math.max(0, Math.floor(box.x - padding)), y = Math.max(0, Math.floor(box.y - padding));
  return { x, y, width: Math.min(width, Math.ceil(box.x + box.width + padding)) - x,
    height: Math.min(height, Math.ceil(box.y + box.height + padding)) - y };
}

/** Detects stripe geometry only. No symbol payload, identity or sensitivity is inferred. */
export const barcodeDetector: PrivacyDetector = {
  capability: { id: 'local_barcode_region', family: 'visual_object', name: 'Browser-local barcode region inspection',
    status: 'implemented', verified: true, requiresImagePixels: true, supportedTypeIds: [],
    limitation: 'Possible horizontal or vertical one-dimensional barcode regions in images up to sixteen million pixels; not decoded. Tiny, damaged, strongly tilted or low-contrast codes may be missed.' },
  async detect(input) {
    if (!input.imagePixels) return [];
    if (!Number.isInteger(input.imageWidth) || !Number.isInteger(input.imageHeight) || input.imageWidth <= 0 ||
      input.imageHeight <= 0 || input.imageWidth * input.imageHeight > MAX_IMAGE_PIXELS)
      throw new RangeError('Barcode image exceeds the supported pixel limit.');
    const gray = await grayscale(input);
    const proposals = [...await inspectAxis(gray, input.imageWidth, input.imageHeight, false),
      ...await inspectAxis(gray, input.imageWidth, input.imageHeight, true)].sort((a, b) => b.width * b.height - a.width * a.height);
    const boxes: PixelRect[] = [];
    for (const proposal of proposals) {
      if (boxes.some(box => intersection(box, proposal) / Math.min(box.width * box.height, proposal.width * proposal.height) > 0.7)) continue;
      boxes.push(proposal);
      if (boxes.length === 32) break;
    }
    return boxes.map((box, index) => {
      const id = `barcode-region:${input.imageId}:${index}`;
      const captions = captionWords(box, input.ocr?.words ?? []);
      const captionBoxes = captions.map(line => paddedCaption(line.map(word => word.box).reduce(union), input.imageWidth, input.imageHeight));
      return { id, source: { kind: 'image' as const, id: input.imageId }, status: 'UNKNOWN_POTENTIALLY_SENSITIVE' as const,
        categoryIds: [], label: 'Possible barcode region', boxes: [box, ...captionBoxes],
        uncertaintyReason: 'Parallel bars suggest a barcode, but the symbol has not been decoded. Confirm the region before covering it.',
        evidence: [{ id: `${id}:stripes`, detectorId: 'local_barcode_region', method: 'visual_object' as const,
          source: 'image' as const, explanation: 'Repeated, aligned dark and light bars were found locally. The encoded content was not read.', boxes: [box] },
        ...captions.map((line, captionIndex) => ({ id: `${id}:caption:${captionIndex}`, detectorId: 'local_barcode_region',
          method: 'relationship' as const, source: 'ocr' as const, wordIds: line.map(word => word.id),
          boxes: [captionBoxes[captionIndex]!], explanation: 'A numeric identifier is printed immediately beside the possible barcode. It is included for review; it was read as text, not decoded from the bars.' }))] };
    });
  },
};
