import { localAssetUrl } from '../../localAssets';
import { textSlopeCorrection } from './textSlope';
import { orientationRegions, insideRegion } from './localOrientation';
import { ocrDetailTiles, mergeDetailWords, wordsAsText, completeDetailWord } from './detailOcr';
import type { OcrRotation } from './ocrGeometry';
import { createWorker, PSM } from "tesseract.js";
import type { LocalImage, OcrResult, OcrWord } from "../../types";
import { rescanNumericLines } from './rescanNumericLines';
import { textInkBounds } from './textInkBounds';
import { adaptiveTextSurface } from './adaptiveSurface';
import { fragmentedLatinText } from './recognitionQuality';
import { ocrCanvasSize, originalPixelBox } from './ocrGeometry';
export interface ScanImageOptions {
  /** v2 opt-in. Static Chinese model is served from the same origin. */
  readonly mixedChineseEnglish?: boolean;
  readonly enhanceLowContrast?: boolean;
  readonly upscaleSmallText?: boolean;
  /** v2 opt-in. Bounded retries only when the first pass is weak. */
  readonly adaptiveRescan?: boolean;
  /** Selection-first OCR: no document-keyword scoring; bounded source processing. */
  readonly generalContent?: boolean;
  /** Bounded native-detail crops for large, sparse or small-text images. */
  readonly detailRescan?: boolean;
  /** Optional in-memory diagnostic hook; callers must not persist or transmit its data. */
  readonly onOrientationAttempt?: (angle: number, score: number, selected: boolean) => void;
  /** Development-only scalar timing; contains no image or recognized text. */
  readonly onMeasuredSlopeTiming?: (milliseconds: number, selected: boolean) => void;
}

function rotatedCanvas(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const radians = degrees * Math.PI / 180;
  const rotated = document.createElement('canvas');
  rotated.width = Math.round(Math.abs(source.width * Math.cos(radians)) +
    Math.abs(source.height * Math.sin(radians)));
  rotated.height = Math.round(Math.abs(source.width * Math.sin(radians)) +
    Math.abs(source.height * Math.cos(radians)));
  const ctx = rotated.getContext('2d');
  if (!ctx) throw new Error('Image scanning is unavailable in this browser.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, rotated.width, rotated.height);
  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return rotated;
}

function recognizedWords(data: { blocks?: readonly { paragraphs: readonly { lines: readonly {
  words: readonly { text: string; confidence: number; symbols?: readonly { bbox: {x0:number;y0:number;x1:number;y1:number} }[]; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }[] }[] | null },
  image: LocalImage, canvas: HTMLCanvasElement, surface: HTMLCanvasElement = canvas,
  degrees = 0, pixels?: Uint8ClampedArray): OcrWord[] {
  const words: OcrWord[] = [];
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians), sine = Math.sin(radians);
  let lineIndex = 0;
  let groupIndex = 0;
  for (const block of data.blocks ?? [])
    for (const paragraph of block.paragraphs) {
      const groupId = `paragraph-${groupIndex++}`;
      for (const line of paragraph.lines) {
        const lineId = `line-${lineIndex++}`;
        for (const word of line.words) {
          // Symbol extents can reveal strokes omitted by the engine's word-level box.
          // Keep evidence-based geometry, not an inferred box from the recognized string.
          const valid = (b: typeof word.bbox) => [b.x0,b.y0,b.x1,b.y1].every(Number.isFinite) && b.x1 > b.x0 && b.y1 > b.y0;
          const extents = [word.bbox, ...(word.symbols ?? []).map(symbol=>symbol.bbox)].filter(valid);
          if (!extents.length) continue;
          const rawBox = { x0: Math.min(...extents.map(b=>b.x0)), y0: Math.min(...extents.map(b=>b.y0)),
            x1: Math.max(...extents.map(b=>b.x1)), y1: Math.max(...extents.map(b=>b.y1)) };
          const map = (b: typeof rawBox) => {
          const mapped = degrees === 0 ? b : (() => {
            const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]
              .map(([x, y]) => ({ x: canvas.width / 2 + cosine * (x! - surface.width / 2) +
                sine * (y! - surface.height / 2),
                y: canvas.height / 2 - sine * (x! - surface.width / 2) +
                  cosine * (y! - surface.height / 2) }));
            return { x0: Math.min(...corners.map(point => point.x)),
              y0: Math.min(...corners.map(point => point.y)),
              x1: Math.max(...corners.map(point => point.x)),
              y1: Math.max(...corners.map(point => point.y)) };
          })();
          return originalPixelBox(mapped, image.width, image.height, canvas.width, canvas.height);
          };
          const box = map(rawBox);
          if (!box) continue;
          const coverageBox = pixels ? map(textInkBounds(pixels, surface.width, surface.height, rawBox)) : undefined;
          words.push({ id: `word-${words.length}`, lineId, groupId, text: word.text,
            readingAngle: degrees, confidence: Math.max(0, Math.min(1, word.confidence / 100)), box, ...(coverageBox ? {coverageBox} : {}) });
        }
      }
  }
  return words;
}

function wordQuality(words: readonly OcrWord[]): number {
  return words.reduce((sum, word) => sum +
    (word.confidence >= 0.55 && /[\p{L}\p{N}]/u.test(word.text)
      ? Math.min(20, word.text.length) * word.confidence *
        (word.text.length === 1 && !/[\u4e00-\u9fff]/u.test(word.text) ? 0.25 : 1) : 0), 0);
}
const meanConfidence = (words: readonly OcrWord[]) => words.reduce((sum, word) =>
  sum + word.confidence, 0) / Math.max(1, words.length);
const documentCue = /\b(?:student|university|college|campus|card|identification|institute|school|name|account|payment|order|email|phone|address)\b|学\s*生|大\s*学|校\s*园|姓\s*名|订\s*单/giu;
function recognitionScore(words: readonly OcrWord[]): number {
  const text = words.map(word => word.text).join(' ');
  const cues = new Set([...text.matchAll(documentCue)].map(match => match[0].toLowerCase()));
  return wordQuality(words) + Math.min(4, cues.size) * 24;
}
function needsOrientation(words: readonly OcrWord[]): boolean {
  const text = words.map(word => word.text).join(' ');
  const cues = [...text.matchAll(documentCue)].length;
  const score = recognitionScore(words);
  const confidence = meanConfidence(words);
  return words.length === 0 || confidence < 0.68 ||
    (cues === 0 && score < 70) ||
    (words.length >= 5 && score < 100 && confidence < 0.9);
}
/** Decoding uses the displayed image orientation. Only static model assets are fetched. */
export async function scanImage(
  image: LocalImage,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
  options: ScanImageOptions = {},
): Promise<OcrResult> {
  const base = localAssetUrl('ocr/');
  const languages = options.mixedChineseEnglish ? ['eng', 'chi_sim'] : ['eng'];
  if (signal.aborted) throw new Error("Scan cancelled.");
  let canvas: HTMLCanvasElement | undefined;
  let decoded: HTMLImageElement | undefined;
  let passIndex=0,lastProgress=0;
  const passBudget=options.detailRescan?38:11;
  const report=(value:number)=>{lastProgress=Math.max(lastProgress,Math.min(1,value));onProgress(lastProgress);};
  const worker = await createWorker(languages, 1, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core`,
    langPath: base.slice(0, -1),
    cacheMethod: "none",
    workerBlobURL: false,
    logger: (message) => {
      if (message.status === "recognizing text") { report((passIndex+message.progress)/passBudget); if(message.progress===1)passIndex++; }
    },
  });
  const abort = () => {
    void worker.terminate();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw new Error("Scan cancelled.");
    const img = new Image(); decoded=img;
    img.src = image.previewUrl;
    await img.decode();
    canvas = document.createElement("canvas");
    const surfaceCanvas = canvas;
    const boundedScale = Math.min(2, 3000 / Math.max(image.width, image.height),
      Math.sqrt(6_000_000 / (image.width * image.height)));
    const scale = options.generalContent || options.detailRescan ? boundedScale : Math.max(1, boundedScale);
    const size = options.upscaleSmallText ? {
      width: Math.round(image.width * scale), height: Math.round(image.height * scale),
    } : ocrCanvasSize(image.width, image.height);
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image scanning is unavailable in this browser.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Composite transparency consistently before OCR; export still retains source alpha outside masks.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if(!options.detailRescan)img.src = '';
    if (options.enhanceLowContrast) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let darkest = 255;
      let lightest = 0;
      for (let i = 0; i < pixels.data.length; i += 4) {
        const gray = 0.2126 * pixels.data[i]! + 0.7152 * pixels.data[i + 1]! +
          0.0722 * pixels.data[i + 2]!;
        darkest = Math.min(darkest, gray);
        lightest = Math.max(lightest, gray);
      }
      // Leave ordinary high-contrast/color screenshots intact; stretch only compressed luminance.
      if (lightest - darkest >= 15 && lightest - darkest < 140) {
        for (let i = 0; i < pixels.data.length; i += 4) {
          const gray = 0.2126 * pixels.data[i]! + 0.7152 * pixels.data[i + 1]! +
            0.0722 * pixels.data[i + 2]!;
          const enhanced = Math.max(0, Math.min(255, (gray - darkest) * 255 / (lightest - darkest)));
          pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = enhanced;
        }
        ctx.putImageData(pixels, 0, 0);
      }
    }
    let { data } = await worker.recognize(
      canvas,
      {},
      { blocks: true, text: true },
    );
    const originalUprightData = data;
    let words = recognizedWords(data, image, canvas);
    let readingAngle = 0;
    const scoreWords = options.generalContent ? wordQuality : recognitionScore;
    const weak = options.generalContent
      ? (items: readonly OcrWord[]) => items.length === 0 || meanConfidence(items) < 0.75 || wordQuality(items) < 12 || fragmentedLatinText(items)
      : needsOrientation;
    if (options.adaptiveRescan && (options.generalContent || image.width * image.height <= 3_000_000) &&
      canvas.width * canvas.height <= 6_000_000 &&
      weak(words)) {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      let bestScore = scoreWords(words);
      const tryAngle = async (degrees: number, input = surfaceCanvas) => {
        if (signal.aborted) throw new Error('Scan cancelled.');
        const surface = degrees ? rotatedCanvas(input, degrees) : input;
        try {
          const candidate = (await worker.recognize(surface, {}, { blocks: true, text: true })).data;
          const recognized = recognizedWords(candidate, image, surfaceCanvas, surface, degrees);
          const score = scoreWords(recognized);
          const selected = score > bestScore + 8 || (score > bestScore && meanConfidence(recognized) > meanConfidence(words) + 0.12);
          if (import.meta.env.DEV) options.onOrientationAttempt?.(degrees, score, selected);
          if (selected) {
            data = candidate; words = recognized; bestScore = score; readingAngle = degrees;
          }
        } finally { if (surface !== input) surface.width = surface.height = 0; }
      };
      await tryAngle(0);
      // A sparse pass can appear confident while reading sideways glyphs. Check all
      // cardinal orientations whenever the initial pass was weak.
      const cardinal = canvas.width < canvas.height ? [-90, 90, 180] : [180, -90, 90];
      for (const angle of cardinal) {
        await tryAngle(angle);
        if (!weak(words)) break;
      }
      if (weak(words)) {
        const adaptive = options.generalContent ? adaptiveTextSurface(surfaceCanvas) : undefined;
        try {
          if (adaptive) await tryAngle(0, adaptive);
          // Thresholding can make tilted misspellings appear confident. If the original
          // surface needed this fallback, complete both bounded deskew probes before
          // selecting the best candidate; do not trust the thresholded confidence alone.
          for (const angle of [-10, 10]) {
            await tryAngle(angle, adaptive ?? surfaceCanvas);
            if (!adaptive && !weak(words)) break;
          }
        } finally { if (adaptive) adaptive.width = adaptive.height = 0; }
      }
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    }
    // Confident OCR can still misread coherent slanted text. Probe one measured
    // correction only when several lines agree; retain the existing result unless
    // recognition improves without losing a substantial amount of text.
    if (options.generalContent && options.adaptiveRescan && Math.abs(readingAngle)<15) {
      const correction=textSlopeCorrection(words);
      if (correction!==undefined && Math.abs(correction-readingAngle)>=1.5) {
        const started=performance.now();
        const surface=rotatedCanvas(surfaceCanvas,correction);
        try {
          if(signal.aborted) throw new Error('Scan cancelled.');
          const candidate=(await worker.recognize(surface,{}, {blocks:true,text:true})).data;
          const alternative=recognizedWords(candidate,image,surfaceCanvas,surface,correction);
          const selected=wordQuality(alternative)>wordQuality(words) &&
            meanConfidence(alternative)>meanConfidence(words)+.015 &&
            alternative.length>=words.length*.85;
          if(import.meta.env.DEV) options.onOrientationAttempt?.(correction,wordQuality(alternative),selected);
          if(selected){data=candidate;words=alternative;readingAngle=correction;}
          if(import.meta.env.DEV) options.onMeasuredSlopeTiming?.(performance.now()-started,selected);
        } finally {surface.width=surface.height=0;}
      }
    }
    if (options.generalContent) {
      const geometrySurface = readingAngle ? rotatedCanvas(surfaceCanvas, readingAngle) : surfaceCanvas;
      try {
        data = await rescanNumericLines(worker,data,geometrySurface,signal);
        const pixels = geometrySurface.getContext('2d')!.getImageData(0,0,geometrySurface.width,geometrySurface.height).data;
        words = recognizedWords(data, image, surfaceCanvas, geometrySurface, readingAngle, pixels);
      } finally { if (geometrySurface !== surfaceCanvas) geometrySurface.width = geometrySurface.height = 0; }
    }
    let detailed=false;
    const details=options.detailRescan && Math.max(image.width,image.height)>2000 && canvas.width/image.width<1.25 &&
      (words.length<24 || weak(words) || words.some(w=>Math.min(w.box.width,w.box.height)<24)) ? ocrDetailTiles(image.width,image.height) : [];
    if(details.length){
      let detailAngle=readingAngle;
      let checkedNativeAngle=false;
      try{
        await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
        for(let i=0;i<details.length;i++){
          if(signal.aborted)throw new Error('Scan cancelled.');
          const region=details[i]!,tile=document.createElement('canvas');
          tile.width=Math.round(region.width*1.8);tile.height=Math.round(region.height*1.8);
          let surface=tile;
          try{
            const ctx=tile.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,tile.width,tile.height);
            ctx.drawImage(img,region.x,region.y,region.width,region.height,0,0,tile.width,tile.height);
            if(detailAngle)surface=rotatedCanvas(tile,detailAngle);
            let candidate=(await worker.recognize(surface,{}, {blocks:true,text:true})).data;
            if(signal.aborted)throw new Error('Scan cancelled.');
            // A very reduced overview can mistake compression artifacts for a slight
            // skew. Validate that angle once on real native pixels before applying
            // it to every crop. Cardinal orientation recovery is retained.
            if(!checkedNativeAngle && detailAngle!==0 && Math.abs(detailAngle)!==90 && Math.abs(detailAngle)!==180 && candidate.text.trim()){
              checkedNativeAngle=true;
              const upright=(await worker.recognize(tile,{}, {blocks:true,text:true})).data;
              const current=recognizedWords(candidate,{...image,width:region.width,height:region.height},tile,surface,detailAngle);
              const alternative=recognizedWords(upright,{...image,width:region.width,height:region.height},tile);
              if(wordQuality(alternative)>wordQuality(current)+8 && meanConfidence(alternative)>=meanConfidence(current)){
                surface.width=surface.height=0;surface=tile;candidate=upright;detailAngle=0;
                readingAngle=0;
                // Restore the actual upright overview, not the geometrically
                // inflated boxes from the rejected skew hypothesis. Otherwise
                // full-token crop protection can lock in those weak readings.
                words=recognizedWords(originalUprightData,image,surfaceCanvas);
              }
            }
            const pixels=surface.getContext('2d')!.getImageData(0,0,surface.width,surface.height).data;
            const local=recognizedWords(candidate,{...image,width:region.width,height:region.height},tile,surface,detailAngle,pixels);
            const mapped=local.filter(w=>completeDetailWord(w,region,image.width,image.height)).map(w=>({...w,
              groupId:`detail-${i}:${w.groupId}`,box:{...w.box,x:w.box.x+region.x,y:w.box.y+region.y},
              ...(w.coverageBox?{coverageBox:{...w.coverageBox,x:w.coverageBox.x+region.x,y:w.coverageBox.y+region.y}}:{})}));
            const rotation:OcrRotation=detailAngle===90?'clockwise':detailAngle===-90?'counterclockwise':Math.abs(detailAngle)===180?'upsideDown':'none';
            words=mergeDetailWords(words,mapped,{rotation,width:image.width,height:image.height,readingAngle});detailed=true;
          }finally{surface.width=surface.height=0;tile.width=tile.height=0;}
        }
      }catch{if(signal.aborted)throw new Error('Scan cancelled.'); /* Keep successful overview/detail words if optional OCR fails. */}
      finally{try{await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});}catch{/* Disposed below. */}}
    }
    if(options.generalContent && options.detailRescan && readingAngle===0){
      const regions=orientationRegions(words,image.width,image.height);
      try{
        if(regions.length)await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
        for(const [index,region] of regions.entries()){
          const original=words.filter(w=>insideRegion(w,region));
          const tile=document.createElement('canvas');
          const scale=Math.min(2,2400/Math.max(region.width,region.height));
          tile.width=Math.round(region.width*scale);tile.height=Math.round(region.height*scale);
          try{
            const tc=tile.getContext('2d')!;tc.fillStyle='#fff';tc.fillRect(0,0,tile.width,tile.height);
            tc.drawImage(img,region.x,region.y,region.width,region.height,0,0,tile.width,tile.height);
            let best:OcrWord[]|undefined,bestScore=wordQuality(original);
            for(const angle of [-90,90]){
              if(signal.aborted)throw new Error('Scan cancelled.');
              const surface=rotatedCanvas(tile,angle);
              try{
                const candidate=(await worker.recognize(surface,{}, {blocks:true,text:true})).data;
                const pixels=surface.getContext('2d')!.getImageData(0,0,surface.width,surface.height).data;
                const local=recognizedWords(candidate,{...image,width:region.width,height:region.height},tile,surface,angle,pixels);
                const score=wordQuality(local);
                if(score>bestScore+Math.max(1,bestScore*.2)&&meanConfidence(local)>=.82&&meanConfidence(local)>meanConfidence(original)+.08){
                  bestScore=score;best=local.map(w=>({...w,id:`orientation-${index}:${w.id}`,lineId:`orientation-${index}:${w.lineId}`,groupId:`orientation-${index}:${w.groupId}`,
                    box:{...w.box,x:w.box.x+region.x,y:w.box.y+region.y},
                    ...(w.coverageBox?{coverageBox:{...w.coverageBox,x:w.coverageBox.x+region.x,y:w.coverageBox.y+region.y}}:{})}));
                }
              }finally{surface.width=surface.height=0;}
            }
            if(best?.length){const replaced=new Set(original);words=[...words.filter(w=>!replaced.has(w)),...best];detailed=true;}
          }finally{tile.width=tile.height=0;}
        }
      }catch{if(signal.aborted)throw new Error('Scan cancelled.'); /* Optional region recovery preserves the original scan on failure. */}
      finally{try{await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});}catch{/* Released below. */}}
    }
    report(1);
    return {
      recognitionId: crypto.randomUUID(),
      imageId: image.id,
      width: image.width,
      height: image.height,
      language: languages.join('+'),
      text: detailed ? wordsAsText(words) : data.text,
      words,
      readingAngle,
    };
  } finally {
    if(decoded)decoded.src='';
    if (canvas) canvas.width = canvas.height = 0;
    signal.removeEventListener("abort", abort);
    await worker.terminate();
  }
}
