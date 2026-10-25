import { MAX_FILE_BYTES } from '../image/loadImage';
export interface PdfPageImage { file: File; pageNumber: number; pageCount: number }

/** Rasterize one selected page locally. Source PDF and other pages are never exported as safe. */
export async function renderPdfPage(file: File, pageNumber = 1): Promise<PdfPageImage> {
  if (file.size > MAX_FILE_BYTES) throw new Error('Choose a PDF smaller than 20 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('The file is not a readable PDF.');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const base = new URL(`${import.meta.env.BASE_URL}pdf/`, location.origin).href;
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({ data: bytes,
    cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`,
    wasmUrl: `${base}wasm/`, enableXfa: false });
  let encrypted = false;
  task.onPassword = () => { encrypted = true; throw new Error('Encrypted PDF requires local conversion.'); };
  let document: Awaited<typeof task.promise> | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    document = await task.promise;
    if (document.numPages > 200) throw new Error('Choose a PDF with no more than 200 pages.');
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > document.numPages)
      throw new Error('Choose a page within this PDF.');
    const page = await document.getPage(pageNumber);
    const natural = page.getViewport({ scale: 1 });
    if (!Number.isFinite(natural.width * natural.height) || natural.width <= 0 || natural.height <= 0)
      throw new Error('The PDF page has invalid dimensions.');
    const scale = Math.min(2, 3000 / Math.max(natural.width, natural.height), Math.sqrt(6_000_000 / (natural.width * natural.height)));
    const viewport = page.getViewport({ scale });
    canvas = window.document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(value =>
      value ? resolve(value) : reject(new Error('The PDF page could not be converted.')), 'image/png'));
    return { file: new File([blob], 'selected-pdf-page.png', { type: 'image/png' }), pageNumber, pageCount: document.numPages };
  } catch (error) {
    if (encrypted) throw new Error('Password-protected PDFs are not supported. Open it locally and export the required page as PNG or JPG.');
    throw new Error(error instanceof Error ? `PDF import failed: ${error.message}` : 'The PDF could not be opened.');
  } finally {
    if (canvas) canvas.width = canvas.height = 0;
    await task.destroy().catch(() => {});
  }
}
