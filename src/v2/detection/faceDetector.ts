import { localAssetUrl } from '../../localAssets';
import type { PrivacyDetector, UniversalFinding } from '../contracts';
import type { PixelRect } from '../../types';

export function expandedFaceBox(box: { originX: number; originY: number; width: number; height: number },
  offsetX: number, offsetY: number, width: number, height: number): PixelRect | null {
  if (![box.originX, box.originY, box.width, box.height, offsetX, offsetY].every(Number.isFinite) || box.width <= 0 || box.height <= 0) return null;
  const x = Math.max(0, Math.floor(offsetX + box.originX - box.width * 0.18));
  const y = Math.max(0, Math.floor(offsetY + box.originY - box.height * 0.25));
  const right = Math.min(width, Math.ceil(offsetX + box.originX + box.width * 1.18));
  const bottom = Math.min(height, Math.ceil(offsetY + box.originY + box.height * 1.18));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
/** Overlapping but nearby people must not be collapsed into a single face. */
export function sameFaceRegion(a: PixelRect, b: PixelRect): boolean {
  const intersection = Math.max(0, Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)) *
    Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  return intersection / Math.min(a.width*a.height,b.width*b.height) > 0.5 &&
    Math.abs(a.x+a.width/2-b.x-b.width/2) <= Math.min(a.width,b.width)*0.35 &&
    Math.abs(a.y+a.height/2-b.y-b.height/2) <= Math.min(a.height,b.height)*0.35;
}
type FaceModel = { maxTiles?:number; detect(pixels:ImageData): {detections: {boundingBox?: {originX:number;originY:number;width:number;height:number};categories: {score:number}[]}[]} | Promise<{detections: {boundingBox?: {originX:number;originY:number;width:number;height:number};categories: {score:number}[]}[]}> };
let model: Promise<FaceModel> | undefined;
async function localModel() {
  if (!model) model = (async () => {
    const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const base = localAssetUrl('vision/');
    const primary = await FaceDetector.createFromOptions(await FilesetResolver.forVisionTasks(`${base}wasm`), {
      baseOptions: { modelAssetPath: `${base}blaze_face_short_range.tflite`, delegate: 'CPU' },
      runningMode: 'IMAGE', minDetectionConfidence: 0.6,
    });
    let fallback: FaceModel | undefined;
    return {
      get maxTiles() { return fallback?.maxTiles; },
      async detect(pixels: ImageData) {
        if (fallback) return fallback.detect(pixels);
        try { return primary.detect(pixels); }
        catch {
          // Some MediaPipe builds initialize successfully but require WebGL
          // when detect() first processes pixels. Recover at both boundaries.
          fallback = await (await import('./cpuFaceModel')).cpuFaceModel();
          try { primary.close(); } catch { /* Already failed runtime. */ }
          return fallback.detect(pixels);
        }
      },
    };
  })().catch(async () => (await import('./cpuFaceModel')).cpuFaceModel()).catch(error => { model = undefined; throw error; });
  return model;
}

export function scaleFaceBox(box: { originX: number; originY: number; width: number; height: number }, sx: number, sy: number) {
  return { originX: box.originX * sx, originY: box.originY * sy, width: box.width * sx, height: box.height * sy };
}
export async function faceOverview(source: NonNullable<import('../contracts').DetectionInput['imagePixels']>, width: number, height: number): Promise<ImageData> {
  const scale = Math.min(1, 1024 / Math.max(width, height));
  const canvas = document.createElement('canvas'), tile = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d'), tileCtx = tile.getContext('2d');
  if (!ctx || !tileCtx) throw new Error('Face overview is unavailable.');
  try {
    for (let y = 0; y < height; y += 1024) for (let x = 0; x < width; x += 1024) {
      const w = Math.min(1024, width - x), h = Math.min(1024, height - y);
      tile.width = w; tile.height = h;
      tileCtx.putImageData(await source.readPixels({ x, y, width: w, height: h }), 0, 0);
      ctx.drawImage(tile, x * canvas.width / width, y * canvas.height / height, w * canvas.width / width, h * canvas.height / height);
    }
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally { canvas.width = canvas.height = tile.width = tile.height = 0; }
}

export function faceTiles(width: number, height: number): PixelRect[] {
  const result: PixelRect[] = [];
  const seen = new Set<string>();
  for (const size of [1024, 384, 192]) {
    const w = Math.min(size, width), h = Math.min(size, height);
    const positions = (extent: number, span: number) => {
      const values = [0];
      while (values[values.length - 1]! + span < extent)
        values.push(Math.min(extent - span, values[values.length - 1]! + Math.floor(span * (0.5))));
      return values;
    };
    for (const y of positions(height, h)) for (const x of positions(width, w))
      { const key = `${x}:${y}:${w}:${h}`;
        if (!seen.has(key)) { seen.add(key); result.push({ x, y, width: w, height: h }); } }
  }
  // Uniformly sample the bounded pass budget rather than inspecting only the top-left corner.
  return result.length <= 192 ? result : Array.from({ length: 192 }, (_, i) => result[Math.round(i * (result.length - 1) / 191)]!);
}
export function rotateFacePixels(pixels: ImageData, turns: number): ImageData {
  const quarter = turns % 2 !== 0;
  const width = quarter ? pixels.height : pixels.width, height = quarter ? pixels.width : pixels.height;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < pixels.height; y++) for (let x = 0; x < pixels.width; x++) {
    const rx = turns === 1 ? pixels.height - 1 - y : turns === 2 ? pixels.width - 1 - x : y;
    const ry = turns === 1 ? x : turns === 2 ? pixels.height - 1 - y : pixels.width - 1 - x;
    const source = (y * pixels.width + x) * 4, target = (ry * width + rx) * 4;
    for (let channel = 0; channel < 4; channel++) data[target + channel] = pixels.data[source + channel]!;
  }
  return new ImageData(data, width, height);
}
export function unrotateFaceBox(box: { originX: number; originY: number; width: number; height: number }, turns: number, width: number, height: number) {
  if (turns === 1) return { originX: box.originY, originY: height - box.originX - box.width, width: box.height, height: box.width };
  if (turns === 2) return { originX: width - box.originX - box.width, originY: height - box.originY - box.height, width: box.width, height: box.height };
  if (turns === 3) return { originX: width - box.originY - box.height, originY: box.originX, width: box.height, height: box.width };
  return box;
}

/** Locations only. Multi-scale, overlapping windows and orientation recovery; no identity inference. */
export const localFaceDetector: PrivacyDetector = {
  capability: { id: 'local_face_regions', family: 'visual_object', name: 'Browser-local face regions',
    status: 'implemented', verified: true, requiresImagePixels: true, supportedTypeIds: [],
    limitation: 'Bounded multi-scale face search (192 tiles); bounded full-image overview and rotation recovery; face-sized confirmation. Tiny, profile or occluded faces can still be missed. No identity recognition.' },
  async detect(input) {
    if (!input.imagePixels) return [];
    const detector = await localModel();
    const candidates: { box: PixelRect; score: number; turns: number }[] = [];
    const detect = async (pixels: ImageData, region: PixelRect, turns = 0) => {
      const result = await detector.detect(turns ? rotateFacePixels(pixels, turns) : pixels);
      for (const face of result.detections) {
        const score = face.categories[0]?.score ?? 0;
        if (!face.boundingBox || !Number.isFinite(score) || score < 0.6) continue;
        const original = unrotateFaceBox(face.boundingBox, turns, pixels.width, pixels.height);
        const mapped = scaleFaceBox(original, region.width / pixels.width, region.height / pixels.height);
        const box = expandedFaceBox(mapped, region.x, region.y, input.imageWidth, input.imageHeight);
        if (box) candidates.push({ box, score, turns });
      }
    };
    for (const region of faceTiles(input.imageWidth, input.imageHeight)) {
      await detect(await input.imagePixels.readPixels(region), region);
      // Yield between CPU passes so controls and progress remain responsive.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    // Always inspect an overview. Large card photos previously skipped this path,
    // while their portrait could be cut across every small tile.
    const region = { x: 0, y: 0, width: input.imageWidth, height: input.imageHeight };
    const pixels = input.imageWidth * input.imageHeight <= 4_000_000
      ? await input.imagePixels.readPixels(region)
      : await faceOverview(input.imagePixels, input.imageWidth, input.imageHeight);
    await detect(pixels, region);
    for (const turns of [1, 2, 3]) { await detect(pixels, region, turns); await new Promise<void>(resolve => setTimeout(resolve, 0)); }
    const selected: typeof candidates = [];
    for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
      if (selected.some(other => sameFaceRegion(candidate.box, other.box))) continue;
      selected.push(candidate);
    }
    // Each tile result is only a proposal. Recheck its face-sized context at
    // higher confidence so isolated letters/logos are not accepted on one weak pass.
    const verified: typeof selected = [];
    for (const candidate of selected.slice(0, 48)) {
      const a = candidate.box;
      const left = Math.max(0, Math.floor(a.x - a.width * 0.2)), top = Math.max(0, Math.floor(a.y - a.height * 0.2));
      const crop = { x: left, y: top, width: Math.min(input.imageWidth, Math.ceil(a.x + a.width * 1.2)) - left,
        height: Math.min(input.imageHeight, Math.ceil(a.y + a.height * 1.2)) - top };
      if (crop.width * crop.height > 4_000_000) continue;
      const source = await input.imagePixels.readPixels(crop);
      const confirmed = await detector.detect(candidate.turns ? rotateFacePixels(source, candidate.turns) : source);
      for (const face of confirmed.detections) {
        const score = face.categories[0]?.score ?? 0;
        if (!face.boundingBox || !Number.isFinite(score) || score < 0.8) continue;
        const raw = unrotateFaceBox(face.boundingBox, candidate.turns, crop.width, crop.height);
        const box = expandedFaceBox(raw, crop.x, crop.y, input.imageWidth, input.imageHeight);
        if (!box) continue;
        const intersection = Math.max(0, Math.min(a.x + a.width, box.x + box.width) - Math.max(a.x, box.x)) *
          Math.max(0, Math.min(a.y + a.height, box.y + box.height) - Math.max(a.y, box.y));
        if (intersection / Math.min(a.width * a.height, box.width * box.height) < 0.45) continue;
        if (!verified.some(other => sameFaceRegion(box, other.box))) verified.push({ box, score, turns: candidate.turns });
      }
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return verified.map(({ box, score }, i): UniversalFinding => {
      const id = `face:${input.imageId}:${i}`;
      return { id, source: { kind: 'image', id: input.imageId }, status: 'UNKNOWN_POTENTIALLY_SENSITIVE',
        label: 'Possible face region', categoryIds: ['biometrics','visual_environmental'], boxes: [box],
        entityClassificationConfidence: score,
        uncertaintyReason: 'A local model found a possible face. Confirm and adjust the region; other faces may be missed. No person was identified.',
        evidence: [{ id: `${id}:e`, detectorId: 'local_face_regions', method: 'visual_object', source: 'image',
          explanation: 'Multi-scale local proposal confirmed in a face-sized crop at a higher model threshold; mapped to original pixels.', boxes: [box] }] };
    });
  },
};
