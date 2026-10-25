import { hasSidewaysText, orientationQuality } from './ocrOrientationQuality';
import { rememberOcrOrientation } from './ocrOrientation';
import { ocrDetailTiles, mergeDetailWords, wordsAsText, completeDetailWord } from './detailOcr';
import { createWorker, PSM } from "tesseract.js";
import type { LocalImage, OcrResult, OcrWord } from "../../types";
import type { OcrRotation } from './ocrGeometry';
import { ocrCanvasSize, originalPixelBox, uprightOcrBox } from './ocrGeometry';
export interface ScanImageOptions {
  /** v2 opt-in. Static Chinese model is served from the same origin. */
  readonly mixedChineseEnglish?: boolean;
  readonly enhanceLowContrast?: boolean;
  readonly upscaleSmallText?: boolean;
  /** v2 opt-in. At most four extra passes for weak or sideways first-pass text. */
  readonly adaptiveRescan?: boolean;
  readonly detailRescan?: boolean;
}

function rotatedCanvas(source: HTMLCanvasElement, rotation: Exclude<OcrRotation, 'none'>): HTMLCanvasElement {
  const rotated = document.createElement('canvas');
  const quarter = rotation !== 'upsideDown';
  rotated.width = quarter ? source.height : source.width; rotated.height = quarter ? source.width : source.height;
  const ctx = rotated.getContext('2d');
  if (!ctx) throw new Error('Image scanning is unavailable in this browser.');
  if (rotation === 'upsideDown') { ctx.translate(source.width, source.height); ctx.rotate(Math.PI); }
  else { const clockwise = rotation === 'clockwise';
    ctx.translate(clockwise ? source.height : 0, clockwise ? 0 : source.width);
    ctx.rotate(clockwise ? Math.PI / 2 : -Math.PI / 2); }
  ctx.drawImage(source, 0, 0);
  return rotated;
}

function recognizedWords(data: { blocks?: readonly { paragraphs: readonly { lines: readonly {
  words: readonly { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }[] }[] | null },
  image: LocalImage, canvas: HTMLCanvasElement, rotation: OcrRotation = 'none'): OcrWord[] {
  const words: OcrWord[] = [];
  let lineIndex = 0;
  for (const block of data.blocks ?? [])
    for (const paragraph of block.paragraphs)
      for (const line of paragraph.lines) {
        const lineId = `line-${lineIndex++}`;
        for (const word of line.words) {
          const b = word.bbox;
          const mapped = uprightOcrBox(b, canvas.width, canvas.height, rotation);
          const quarter = rotation === 'clockwise' || rotation === 'counterclockwise';
          const box = originalPixelBox(mapped, image.width, image.height,
            quarter ? canvas.height : canvas.width, quarter ? canvas.width : canvas.height);
          if (!box) continue;
          words.push({ id: `word-${words.length}`, lineId, text: word.text,
            confidence: Math.max(0, Math.min(1, word.confidence / 100)), box });
        }
      }
  return words;
}

const meanConfidence = (words: readonly OcrWord[]) => words.reduce((sum, word) =>
  sum + word.confidence, 0) / Math.max(1, words.length);
/** Decoding uses the displayed image orientation. Only static model assets are fetched. */
export async function scanImage(
  image: LocalImage,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
  options: ScanImageOptions = {},
): Promise<OcrResult> {
  const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.origin).href;
  const languages = options.mixedChineseEnglish ? ['eng', 'chi_sim'] : ['eng'];
  let passStart=0, passSpan=1, lastProgress=0;
  const report=(value:number)=>{lastProgress=Math.max(lastProgress,Math.max(0,Math.min(1,value)));onProgress(lastProgress);};
  const worker = await createWorker(languages, 1, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core`,
    langPath: base.slice(0, -1),
    cacheMethod: "none",
    workerBlobURL: false,
    logger: (message) => {
      if (message.status === "recognizing text") report(passStart+message.progress*passSpan);
    },
  });
  let overviewCanvas:HTMLCanvasElement|undefined;
  const abort = () => {
    void worker.terminate();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw new Error("Scan cancelled.");
    const img = new Image();
    img.src = image.previewUrl;
    await img.decode();
    const canvas = document.createElement("canvas");
    overviewCanvas=canvas;
    const scale = Math.min(2, 3000 / Math.max(image.width, image.height),
      Math.sqrt(6_000_000 / (image.width * image.height)));
    const size = options.upscaleSmallText ? {
      width: Math.max(1, Math.round(image.width * scale)), height: Math.max(1, Math.round(image.height * scale)),
    } : ocrCanvasSize(image.width, image.height);
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image scanning is unavailable in this browser.");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
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
    const details=options.detailRescan&&Math.max(image.width,image.height)>2000&&canvas.width/image.width<1.25?ocrDetailTiles(image.width,image.height):[];
    const overviewBudget=options.adaptiveRescan?5:1;
    const totalBudget=overviewBudget+details.length;
    passSpan=1/totalBudget;
    let selectedRotation:OcrRotation='none';
    let { data } = await worker.recognize(
      canvas,
      {},
      { blocks: true, text: true },
    );
    let words = recognizedWords(data, image, canvas);
    const quality = (candidate: readonly OcrWord[], rotation: OcrRotation = 'none') =>
      orientationQuality(candidate, image.width, image.height, rotation);
    if (options.adaptiveRescan && canvas.width * canvas.height <= 6_000_000 &&
      (words.length < 4 || quality(words, selectedRotation) < 12 || meanConfidence(words) < 0.75 || hasSidewaysText(words))) {
      const possibleRotation = words.length < 4 || meanConfidence(words) < 0.75 || hasSidewaysText(words);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      const attempts: { surface: HTMLCanvasElement; rotation: OcrRotation }[] =
        [{ surface: canvas, rotation: 'none' }];
      passStart=1/totalBudget;
      for (const attempt of attempts) {
        if (signal.aborted) throw new Error('Scan cancelled.');
        const candidate = (await worker.recognize(attempt.surface, {}, { blocks: true, text: true })).data;
        const recognized = recognizedWords(candidate, image, attempt.surface, attempt.rotation);
        if (quality(recognized, attempt.rotation) > quality(words, selectedRotation) * 1.15) { data = candidate; words = recognized; }
      }
      if (quality(words, selectedRotation) < 12 || possibleRotation) {
        let rotationPass=2;
        for (const rotation of ['upsideDown', 'clockwise', 'counterclockwise'] as const) {
          passStart=rotationPass++/totalBudget;
          if (signal.aborted) throw new Error('Scan cancelled.');
          const surface = rotatedCanvas(canvas, rotation);
          try {
            const candidate = (await worker.recognize(surface, {}, { blocks: true, text: true })).data;
            const recognized = recognizedWords(candidate, image, surface, rotation);
            if (quality(recognized, rotation) > quality(words, selectedRotation) * 1.15 ||
              (recognized.length >= 3 && quality(recognized, rotation) >= quality(words, selectedRotation) * 0.8 && meanConfidence(recognized) > 0.82 &&
                meanConfidence(recognized) > meanConfidence(words) + 0.12)) {
              data = candidate; words = recognized; selectedRotation=rotation;
            }
          } finally {
            surface.width = surface.height = 0;
          }
        }
      }
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    }
    if(details.length){
      await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT});
      for(let i=0;i<details.length;i++){
        if(signal.aborted)throw new Error('Scan cancelled.');
        const region=details[i]!;
        const tile=document.createElement('canvas');
        const detailScale=1.8;
        tile.width=Math.round(region.width*detailScale);tile.height=Math.round(region.height*detailScale);
        const context=tile.getContext('2d');
        if(!context)throw new Error('Detailed text scanning is unavailable.');
        context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
        context.drawImage(img,region.x,region.y,region.width,region.height,0,0,tile.width,tile.height);
        let surface=tile;
        try{
          if(selectedRotation!=='none')surface=rotatedCanvas(tile,selectedRotation);
          passStart=(overviewBudget+i)/totalBudget;
          const candidate=(await worker.recognize(surface,{},{blocks:true,text:true})).data;
          const local=recognizedWords(candidate,{...image,width:region.width,height:region.height},surface,selectedRotation);
          const mapped=local.filter(word=>completeDetailWord(word,region,image.width,image.height)).map(word=>({...word,box:{...word.box,x:word.box.x+region.x,y:word.box.y+region.y}}));
          words=mergeDetailWords(words,mapped,{rotation:selectedRotation,width:image.width,height:image.height});
        }finally{surface.width=surface.height=0;tile.width=tile.height=0;}
      }
      await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});
    }
    report(1);
    return rememberOcrOrientation({
      imageId: image.id,
      width: image.width,
      height: image.height,
      language: languages.join('+'),
      text: details.length ? wordsAsText(words) : data.text,
      words,
    },selectedRotation);
  } finally {
    if(overviewCanvas)overviewCanvas.width=overviewCanvas.height=0;
    signal.removeEventListener("abort", abort);
    await worker.terminate();
  }
}
