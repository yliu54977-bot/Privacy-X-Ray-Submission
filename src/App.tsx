import { lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react';
import type { LocalImage } from './types';
import { initialState, selectionSessionReducer } from './state/sessionReducer';
import { RedactionEditor } from './features/editor';
import { loadImage } from './features/image/loadImage';
import { sampleImage } from './features/image/sampleImage';
import { scanContent } from './features/recognition/scanContent';
import { detectUniversalPrivacy } from './v2/detection/detectUniversalPrivacy';
import { openBrowserImagePixels } from './v2/detection/imagePixels';
import { toEditorFields } from './v2/integration/toEditorFields';
import { usePngPreview } from './features/export/usePngPreview';
import { downloadPng } from './features/export/downloadPng';
import { PdfPageSelection } from './v2/ui/PdfPageSelection';
import { OcrTextReview } from './v2/ui/OcrTextReview';
import './simple.css';

// Retain the previous interface only for integration/regression review, never as the default flow.
const AdvancedApp = lazy(() => import('./AdvancedApp'));
export default function App() {
  return new URLSearchParams(location.search).get('review') === 'advanced'
    ? <Suspense fallback={<p>Loading review…</p>}><AdvancedApp /></Suspense> : <SimpleApp />;
}
export function SimpleApp() {
  const [state, dispatch] = useReducer(selectionSessionReducer, { ...initialState, reviewMode: 'universal' as const });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pdf, setPdf] = useState<{ file: File; page: number; total: number } | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const png = usePngPreview(state, dispatch);
  const image = state.image;
  const busy = loading || state.scan.status === 'running';
  const activeMasks = state.masks.filter(mask => mask.shouldRedact);
  const matching = state.fields.filter(field => `${field.label} ${field.value}`.toLowerCase().includes(query.toLowerCase()));
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(matching.length / 20));
  const currentPage = Math.min(page, pages - 1);
  useEffect(() => { setPage(0); }, [query, image?.id]);
  useEffect(() => {
    return () => { sequence.current++; controller.current?.abort(); };
  }, []);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.previewUrl); }, [image?.previewUrl]);

  async function recognize(target: LocalImage) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const requestId = crypto.randomUUID();
    dispatch({ type: 'SCAN_STARTED', imageId: target.id, requestId });
    setProgress(0); setStage('Reading text'); setError('');
    try {
      const ocr = await scanContent(target, value => { if (!abort.signal.aborted) setProgress(value); }, abort.signal);
      if (abort.signal.aborted) return;
      setStage('Inspecting image regions');
      let pixels: Awaited<ReturnType<typeof openBrowserImagePixels>> | undefined;
      try { pixels = await openBrowserImagePixels(target, abort.signal); } catch { /* Coverage reports unavailable pixels. */ }
      let result;
      try { result = await detectUniversalPrivacy({ imageId: target.id, imageWidth: target.width,
        imageHeight: target.height, ocr, ...(pixels ? { imagePixels: pixels } : {}) }); }
      finally { pixels?.dispose(); }
      if (abort.signal.aborted) return;
      const fields = toEditorFields(result, ocr);
      dispatch({ type: 'SCAN_COMPLETED', imageId: target.id, requestId, ocr, fields, universalResult: result });
      // Selection reducer starts every finding unchecked without invoking a policy.
    } catch {
      if (!abort.signal.aborted) dispatch({ type: 'SCAN_FAILED', imageId: target.id, requestId,
        error: 'Recognition could not finish. Try again or draw a mask over the image.' });
    }
  }
  async function choose(file: File, pageNumber = 1) {
    if (activeMasks.length && !window.confirm('Replace this image and remove its masks?')) return;
    const request = ++sequence.current;
    setLoading(true); setError('');
    try {
      const rendered = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
        ? await (await import('./features/documents/renderPdfPage')).renderPdfPage(file, pageNumber) : null;
      const next = await loadImage(rendered?.file ?? file);
      if (request !== sequence.current) { URL.revokeObjectURL(next.previewUrl); return; }
      dispatch({ type: 'IMAGE_LOADED', image: next });
      setPdf(rendered ? { file, page: rendered.pageNumber, total: rendered.pageCount } : null);
      setSelected(null); setQuery(''); setPreviewLoaded(null);
      void recognize(next);
    } catch (cause) { if (request === sequence.current) setError(cause instanceof Error ? cause.message : 'This file could not be opened.'); }
    finally { if (request === sequence.current) setLoading(false); }
  }
  function selectField(fieldId: string, checked: boolean) {
    if (!image) return;
    dispatch({ type: 'UPDATE_FIELD_DECISION', imageId: image.id, fieldId, decision: checked ? 'MASK' : 'KEEP' });
    setSelected(fieldId);
  }
  return <div className="app-shell simple-app">
    <header className="app-header"><a href="#" className="app-brand"><span className="brand-icon">▧</span>Privacy X-Ray</a><span className="local-pill">● Stays on your device</span></header>
    <main className="app-main">
      <section className="app-intro"><p className="eyebrow">UPLOAD · SELECT · HIDE</p><h1>Choose what to hide.</h1><p>We recognize text and image regions. You choose what gets covered.</p></section>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (file) void choose(file);
      }} />
      {error && <p className="app-error" role="alert">{error}</p>}
      {!image ? <section className="welcome" onDragOver={event => event.preventDefault()} onDrop={event => {
        event.preventDefault(); if (loading) return;
        if (event.dataTransfer.files.length !== 1) { setError('Choose one file at a time.'); return; }
        void choose(event.dataTransfer.files[0]!);
      }}><div className="welcome-icon">▧</div><h2>Start with an image or PDF</h2><p>Upload a file. Recognition starts automatically.</p>
        <button className="app-button primary" disabled={loading} onClick={() => input.current?.click()}>{loading ? 'Opening file…' : 'Choose Image or PDF'}</button>
        <p className="limits">PNG, JPG, WebP or PDF · up to 20 MB</p>
        <button className="app-button" disabled={loading} onClick={() => { void sampleImage('tuition').then(choose).catch(() => setError('The sample could not be opened.')); }}>Try a sample</button>
        <details className="simple-limits"><summary>File limits</summary><p>Images: up to 16 million pixels. PDF: one selected page at a time. WebP: one still frame. Convert HEIC, Office files and video before uploading.</p></details>
      </section> : <>
        <div className="workspace-heading"><span>1. Your image</span><button className="app-button" disabled={loading} onClick={() => input.current?.click()}>Choose another file</button></div>
        {pdf && <PdfPageSelection page={pdf.page} total={pdf.total} disabled={busy} onOpen={number => void choose(pdf.file, number)} />}
        <div className="app-workspace simple-workspace"><section>
          <RedactionEditor image={image} masks={state.masks} highlights={state.fields} decisions={state.decisions}
            selectedFieldId={selected} onSelectHighlight={setSelected} disabled={busy}
            onAddManual={(imageId, rect) => dispatch({ type: 'ADD_MANUAL_MASK', mask: { ...rect, id: crypto.randomUUID(), imageId, source: 'manual', shouldRedact: true } })}
            onUpdateMask={(imageId, maskId, rect) => dispatch({ type: 'UPDATE_MASK', imageId, maskId, rect })}
            onDeleteMask={(imageId, maskId) => {
              const fieldId = state.masks.find(mask => mask.id === maskId)?.fieldId;
              dispatch({ type: 'DELETE_MASK', imageId, maskId });
              if (fieldId) dispatch({ type: 'UPDATE_FIELD_DECISION', imageId, fieldId, decision: 'KEEP' });
            }} />
          <p className="simple-hint">Missed something? Drag over the image to add a mask. Use Select / Edit to move or resize it.</p>
          <section className="simple-preview" aria-label="PNG preview"><h2>3. Preview and download</h2>
            <button className="app-button primary" disabled={busy || !activeMasks.length || !png.readyToPreview || png.rendering || !!png.previewUrl}
              onClick={() => void png.generate()}>{png.rendering ? 'Preparing PNG…' : 'Preview covered image'}</button>
            {!activeMasks.length && <p>Select information or draw a mask first.</p>}
            {png.error && <p role="alert">{png.error}</p>}
            {png.previewUrl && <><img className="simple-result" src={png.previewUrl} alt="Covered PNG preview" onLoad={() => setPreviewLoaded(png.previewUrl)}
              onError={() => { setPreviewLoaded(null); setError('The preview could not be displayed.'); }} />
              <button className="app-button primary" disabled={previewLoaded !== png.previewUrl || busy || png.rendering} onClick={() => {
                if (png.previewBlob && previewLoaded === png.previewUrl) { try { downloadPng(png.previewBlob); } catch { setError('Download could not start.'); } }
              }}>Download PNG</button><p>The selected areas are permanently covered in the downloaded PNG.</p></>}
          </section>
        </section><aside className="simple-selection" aria-label="Choose information to hide"><h2>2. What would you like to hide?</h2>
          {state.scan.status === 'running' ? <div role="status"><p>{stage}…</p><progress max={1} value={progress} aria-label="Recognition progress"/><p>First use loads local models. Your image is not uploaded.</p></div> : <>
            {state.scan.error && <p role="alert">{state.scan.error}</p>}
            <p>{state.fields.length} optional category or visual matches. All recognized text is selectable below.</p>
            <div className="simple-selection-actions"><button className="app-button" disabled={!state.fields.some(field => field.boxes.length)} onClick={() => state.fields.filter(field => field.boxes.length).forEach(field => selectField(field.id, true))}>Select all</button>
              <button className="app-button" disabled={!state.fields.some(field => state.decisions[field.id]?.action === 'MASK')} onClick={() => state.fields.forEach(field => selectField(field.id, false))}>Clear selection</button></div>
            {state.fields.length > 8 && <label className="simple-search">Find information<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>}
            <div className="simple-findings">{matching.slice(currentPage * 20, (currentPage + 1) * 20).map(field => <div key={field.id} className={`simple-finding ${selected === field.id ? 'is-selected' : ''}`}>
              <label><input type="checkbox" checked={state.decisions[field.id]?.action === 'MASK'} disabled={!field.boxes.length} onChange={event => selectField(field.id, event.target.checked)} />
                <span><strong>{field.label.replace(/^Possible /, '')}</strong><span className="simple-value">{field.value || 'Image region'}</span></span></label>
              {field.boxes.length ? <button type="button" className="simple-locate" aria-label={`Locate ${field.label}`} onClick={() => setSelected(field.id)}>Show</button> : <p>No exact location. Draw a mask over this information.</p>}
            </div>)}</div>
            {!matching.length && <p>No category matches. Review recognized text below or draw masks on the image.</p>}
            {pages > 1 && <nav aria-label="Finding pages"><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span> {currentPage + 1} / {pages} </span><button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
            <button className="app-button" onClick={() => {
              if (activeMasks.some(mask => mask.source === 'recommendation') &&
                !window.confirm('Scan again and reset your selected information? Manually drawn masks will stay.')) return;
              void recognize(image);
            }}>Scan again</button>
            {state.ocr && <OcrTextReview key={state.scan.requestId} allContent ocr={state.ocr} findings={state.universalResult?.findings ?? []} masks={state.masks} onMask={boxes => boxes.forEach(rect => dispatch({ type: 'ADD_MANUAL_MASK', mask: { ...rect, id: crypto.randomUUID(), imageId: image.id, source: 'manual', shouldRedact: true } }))} />}
            <details className="simple-limits"><summary>What might be missed?</summary>{Math.max(image.width,image.height)>2000 && <p>Small text in very large images may still be missed. Check it before sharing.</p>}<p>Detection can miss text, handwriting, faces, signatures and background details. Check the whole image.</p>
              {state.universalResult?.coverage.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
            </details>
          </>}
        </aside></div>
      </>}
      <footer className="app-footer"><span>Processed on your device.</span><span>Check the image before sharing.</span></footer>
    </main>
  </div>;
}
