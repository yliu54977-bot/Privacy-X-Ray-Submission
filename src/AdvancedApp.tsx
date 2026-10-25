import { useEffect, useReducer, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  ContextSelector,
  RecommendationReview,
  RedactionEditor,
} from "./features/editor";
import { loadImage } from "./features/image/loadImage";
import { sampleImage } from "./features/image/sampleImage";
import { scanImage } from "./features/ocr/scanImage";
import { extractPrivacyFields } from "./features/ocr/extractPrivacyFields";
import { scanImageV2 } from './v2/detection/scanImageV2';
import { detectUniversalPrivacy } from './v2/detection/detectUniversalPrivacy';
import { toEditorFields } from './v2/integration/toEditorFields';
import { universalPolicyRecommendations } from './v2/integration/policyAdapter';
import { privacyKnowledgeBase } from './v2/privacyKnowledgeBase';
import { FinalImageReview, SharingContextForm, UniversalMaskEditor, UniversalReview, InspectionOverview, ProcessingFeedback } from './v2/ui';
import type { InspectionStage } from "./v2/ui";
import { imageBoxes } from './v2/ui/reviewModel';
import { summarizeOcrDiagnostics } from './v2/detection/diagnostics';
import { openBrowserImagePixels } from './v2/detection/imagePixels';
import { initialState, sessionReducer } from "./state/sessionReducer";
import { hasEditingChanges } from "./state/hasEditingChanges";

import { MaterialInspection } from "./v2/ui/MaterialInspection";
import { PdfPageSelection } from "./v2/ui/PdfPageSelection";
import { OcrTextReview } from "./v2/ui/OcrTextReview";
import { usePngPreview } from "./features/export/usePngPreview";
import { downloadPng } from "./features/export/downloadPng";

export default function App() {
  const [state, dispatch] = useReducer(sessionReducer, { ...initialState, reviewMode: 'universal' as const });
  const [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [progress, setProgress] = useState(0),
    [selectedFieldId, setSelectedFieldId] = useState<string | null>(null),
    [reviewRevision, setReviewRevision] = useState<number | null>(null),
    [unlocatedIntent, setUnlocatedIntent] = useState<string | null>(null),
    [manualLocationChecked, setManualLocationChecked] = useState(false);
  const [pdfSource, setPdfSource] = useState<File | null>(null);
  const [pdfPage, setPdfPage] = useState<{ page: number; total: number } | null>(null);
  const [inspectionStage, setInspectionStage] = useState<InspectionStage>("idle");
  const png = usePngPreview(state, dispatch);
  const [previewLoaded, setPreviewLoaded] = useState<Blob | null>(null);
  const [zeroMaskPrompt, setZeroMaskPrompt] = useState<Blob | null>(null);
  useEffect(() => {
    setPreviewLoaded(null);
    setZeroMaskPrompt(null);
    setReviewRevision(null);
  }, [png.previewBlob]);
  useEffect(() => { setManualLocationChecked(false); }, [state.revision]);
  useEffect(() => { setUnlocatedIntent(null); }, [state.image?.id, state.sharingContextV2?.id]);
  const fileInput = useRef<HTMLInputElement>(null),
    scanController = useRef<AbortController | null>(null),
    loadSequence = useRef(0);
  const hasChanges = hasEditingChanges(state);
  useEffect(() => {
    const url = state.image?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [state.image?.previewUrl]);
  useEffect(
    () => () => {
      loadSequence.current++;
      scanController.current?.abort();
    },
    [],
  );
  async function choose(file: File, pageNumber = 1) {
    if (
      hasChanges &&
      !window.confirm(
        "Replace this image? Your masks and review decisions will be removed.",
      )
    )
      return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const page = isPdf ? await (await import('./features/documents/renderPdfPage')).renderPdfPage(file, pageNumber) : null;
      const image = await loadImage(page?.file ?? file);
      if (sequence !== loadSequence.current) {
        URL.revokeObjectURL(image.previewUrl);
        return;
      }
      scanController.current?.abort();
      dispatch({ type: "IMAGE_LOADED", image });
      setPdfSource(page ? file : null);
      setPdfPage(page ? { page: page.pageNumber, total: page.pageCount } : null);
      setInspectionStage("idle");
      setSelectedFieldId(null);
      setReviewRevision(null);
      setUnlocatedIntent(null);
    } catch (e) {
      if (sequence === loadSequence.current)
        setError(
          e instanceof Error ? e.message : "The image could not be loaded.",
        );
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  function inputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void choose(file);
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    if (loading) return;
    if (event.dataTransfer.files.length !== 1) {
      setError("Choose one screenshot at a time.");
      return;
    }
    const file = event.dataTransfer.files[0];
    if (file) void choose(file);
  }
  async function sample(kind: "tuition" | "order") {
    try {
      await choose(await sampleImage(kind));
    } catch {
      setError("The sample could not be loaded.");
    }
  }
  async function scan() {
    if (!state.image || state.scan.status === "running") return;
    const image = state.image,
      requestId = crypto.randomUUID(),
      controller = new AbortController();
    scanController.current?.abort();
    scanController.current = controller;
    dispatch({ type: "SCAN_STARTED", imageId: image.id, requestId });
    setProgress(0);
    setInspectionStage("ocr");
    setError(null);
    setReviewRevision(null);
    try {
      const ocr = await (state.reviewMode === 'universal' ? scanImageV2 : scanImage)(
        image,
        (p) => {
          if (!controller.signal.aborted) setProgress(p);
        },
        controller.signal,
      );
      if (!controller.signal.aborted) setInspectionStage('detection');
      let universalResult = null;
      if (state.reviewMode === 'universal') {
        let pixels: Awaited<ReturnType<typeof openBrowserImagePixels>> | undefined;
        try {
          pixels = await openBrowserImagePixels(image, controller.signal);
        } catch { /* OCR-only review remains available; visual coverage reports uninspected. */ }
        try {
          universalResult = await detectUniversalPrivacy({ imageId: image.id,
            imageWidth: image.width, imageHeight: image.height, ocr,
            ...(pixels ? { imagePixels: pixels } : {}) });
        } finally { pixels?.dispose(); }
      }
      if (!controller.signal.aborted) setInspectionStage('policy');
      if (!controller.signal.aborted)
        dispatch({
          type: "SCAN_COMPLETED",
          imageId: image.id,
          requestId,
          ocr,
          fields: universalResult ? toEditorFields(universalResult) : extractPrivacyFields(ocr),
          ...(universalResult ? { universalResult } : {}),
        });
    } catch {
      if (!controller.signal.aborted)
        dispatch({
          type: "SCAN_FAILED",
          imageId: image.id,
          requestId,
          error: "Scanning could not finish. Try again or add masks manually.",
        });
    } finally {
      if (scanController.current === controller) scanController.current = null;
    }
  }
  function newImage() {
    if (
      hasChanges &&
      !window.confirm(
        "Choose a new image? Your manual masks and review decisions will be removed.",
      )
    )
      return;
    loadSequence.current++;
    scanController.current?.abort();
    dispatch({ type: "NEW_IMAGE" });
    setPdfSource(null);
    setPdfPage(null);
    dispatch({ type: 'SELECT_REVIEW_MODE', mode: state.reviewMode ?? 'universal' });
    setInspectionStage("idle");
    setReviewRevision(null);
    setSelectedFieldId(null);
    setUnlocatedIntent(null);
    setError(null);
    setLoading(false);
  }
  const image = state.image,
    universal = state.reviewMode === 'universal' && !!state.universalResult,
    universalRecommendations = state.universalResult && state.sharingContextV2
      ? universalPolicyRecommendations(state.universalResult, state.sharingContextV2) : [],
    universalOverrides = Object.fromEntries(Object.entries(state.decisions)
      .filter(([id, decision]) => decision.action !== state.recommendations
        .find(item => item.fieldId === id && item.imageId === decision.imageId)?.action ||
        decision.action === 'REVIEW' && decision.reviewReason === 'suggested_mask_removed')
      .map(([id, decision]) => [id, decision.action])),
    unresolved = Object.values(state.decisions).filter(
      (d) => d.action === "REVIEW",
    ).length,
    reviewCurrent = reviewRevision === state.revision && !!png.previewUrl && previewLoaded === png.previewBlob;
  const recognitionModes = <div className="recognition-modes">
    <div className="review-mode-choice" role="group" aria-label="Review mode">
      <button type="button" className="app-button" disabled={loading || state.scan.status === 'running'}
        aria-pressed={state.reviewMode === 'universal'} onClick={() => changeMode('universal')}>Universal review (v2)</button>
      <button type="button" className="app-button" disabled={loading || state.scan.status === 'running'}
        aria-pressed={state.reviewMode === 'classic'} onClick={() => changeMode('classic')}>Classic review</button>
    </div>
    <p className="uv-muted">Universal: enhanced English / Chinese text, document patterns and QR inspection.
      Classic: limited English fields. Switching clears scan results and linked masks; manual masks stay.</p>
  </div>;
  function changeMode(mode: 'classic' | 'universal') {
    if (mode === state.reviewMode || state.scan.status === 'running') return;
    dispatch({ type: 'SELECT_REVIEW_MODE', mode });
    setSelectedFieldId(null);
    setUnlocatedIntent(null);
    setReviewRevision(null);
    setInspectionStage('idle');
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="#" className="app-brand">
          <span className="brand-icon">▧</span>Privacy X-Ray
        </a>
        <span className="local-pill">● Browser-local processing</span>
      </header>
      <main className="app-main">
        <section className="app-intro">
          <p className="eyebrow">SHARE WITH INTENTION</p>
          <h1>Share only what they need.</h1>
          <p>
            Review and redact sensitive information before sharing your
            screenshots.
          </p>
        </section>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,application/pdf"
          hidden
          onChange={inputChange}
        />
        {error && (
          <div className="app-error" role="alert">
            {error}
          </div>
        )}
        {!image ? (
          <section
            className="welcome"
            onDragOver={(e) => e.preventDefault()}
            onDrop={drop}
          >
            <div className="welcome-icon">▧</div>
            <h2>Start with an image or PDF</h2>
            <p>Drop a PNG, JPG, WebP or PDF here, or choose a file.</p>
            {recognitionModes}
            <button
              className="app-button primary"
              disabled={loading}
              onClick={() => fileInput.current?.click()}
            >
              {loading ? "Loading screenshot…" : "Choose Image or PDF"}
            </button>
            <p className="limits">Up to 20 MB · images up to 16 million pixels · PDF pages inspected individually</p>
            <p className="uv-muted">WebP is converted to one still PNG frame. HEIC, GIF, Office documents and unsupported files need conversion to PNG, JPG or PDF first.</p>
            <MaterialInspection />
            <div className="sample-buttons">
              <button
                className="app-button"
                disabled={loading}
                onClick={() => void sample("tuition")}
              >
                Try tuition sample
              </button>
              <button
                className="app-button"
                disabled={loading}
                onClick={() => void sample("order")}
              >
                Try order sample
              </button>
            </div>
          </section>
        ) : (
          <>
            {universal && <InspectionOverview result={state.universalResult!} recommendations={universalRecommendations} overrides={universalOverrides}/>}
            {pdfPage && pdfSource && <PdfPageSelection key={`${image.id}:${pdfPage.page}`}
              page={pdfPage.page} total={pdfPage.total} disabled={loading || state.scan.status === 'running'}
              onOpen={page => void choose(pdfSource, page)} />}
            <div className="app-workspace">
              <section>
                <div className="workspace-heading">
                  <span>01 / Image workspace</span>
                  <div>
                    <button
                      className="app-button"
                      disabled={loading}
                      onClick={newImage}
                    >
                      New Image
                    </button>
                    <button
                      className="app-button"
                      disabled={!hasChanges || state.scan.status === "running"}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Reset all changes? Your manual masks and review decisions will be removed.",
                          )
                        ) {
                          dispatch({ type: "RESET_CHANGES" });
                          setSelectedFieldId(null);
                          setReviewRevision(null);
                        }
                      }}
                    >
                      Reset Changes
                    </button>
                  </div>
                </div>
                {state.reviewMode === 'universal' && <ProcessingFeedback status={state.scan.status} stage={state.scan.status === 'complete' ? 'review' : inspectionStage} progress={progress} coverage={state.universalResult?.coverage} recommendations={universalRecommendations} unresolved={unresolved}/>}
                {universal ? <UniversalMaskEditor
                  image={image}
                  masks={state.masks}
                  findings={state.universalResult!.findings}
                  recommendations={universalRecommendations}
                  overrides={universalOverrides}
                  selectedFindingId={selectedFieldId}
                  onSelectFindingId={setSelectedFieldId}
                  disabled={loading || state.scan.status === 'running'}
                  onAddManual={(imageId, rect) => dispatch({ type: 'ADD_MANUAL_MASK',
                    mask: { ...rect, id: crypto.randomUUID(), imageId, source: 'manual', shouldRedact: true } })}
                  onUpdateMask={(imageId, maskId, rect) => dispatch({ type: 'UPDATE_MASK', imageId, maskId, rect })}
                  onDeleteMask={(imageId, maskId) => dispatch({ type: 'DELETE_MASK', imageId, maskId })}
                /> : <RedactionEditor
                  image={image}
                  masks={state.masks}
                  highlights={state.fields}
                  decisions={state.decisions}
                  selectedFieldId={selectedFieldId}
                  disabled={loading}
                  onAddManual={(imageId, rect) =>
                    dispatch({
                      type: "ADD_MANUAL_MASK",
                      mask: {
                        ...rect,
                        id: crypto.randomUUID(),
                        imageId,
                        source: "manual",
                        shouldRedact: true,
                      },
                    })
                  }
                  onUpdateMask={(imageId, maskId, rect) =>
                    dispatch({ type: "UPDATE_MASK", imageId, maskId, rect })
                  }
                  onDeleteMask={(imageId, maskId) =>
                    dispatch({ type: "DELETE_MASK", imageId, maskId })
                  }
                />}
                <div className="processing-note">
                  <strong>
                    Your images are processed locally in your browser and are
                    not uploaded.
                  </strong>
                  <p>
                    Your editing session is temporary. Download your result
                    before leaving.
                  </p>
                </div>
              </section>
              <aside>
                {state.reviewMode === 'universal' ? <SharingContextForm
                  key={`context:${image.id}:${state.sharingContextV2!.id}`}
                  value={state.sharingContextV2!}
                  taxonomy={privacyKnowledgeBase}
                  disabled={loading || state.scan.status === 'running'}
                  requiresConfirmation={!!state.ocr}
                  onApply={context => {
                    dispatch({ type: 'APPLY_UNIVERSAL_CONTEXT', imageId: image.id, context });
                    setSelectedFieldId(null);
                    setUnlocatedIntent(null);
                  }}
                /> : <ContextSelector
                  key={image.id}
                  value={state.context}
                  requiresConfirmation={!!state.ocr}
                  disabled={loading}
                  onChange={(context) => {
                    dispatch({ type: "CHANGE_CONTEXT", context });
                    setSelectedFieldId(null);
                    setReviewRevision(null);
                  }}
                />}
                <section className="scan-panel">
                  {recognitionModes}
                  {state.reviewMode === 'universal' && <p>Universal review · local English and Chinese OCR</p>}
                  <button
                    className="app-button primary full"
                    disabled={loading || state.scan.status === "running"}
                    onClick={() => void scan()}
                  >
                    {state.scan.status === "running"
                      ? "Scanning locally…"
                      : "Scan for Sensitive Information"}
                  </button>
                  {state.scan.status === "running" && (
                    <>
                      <p>First use loads local text and face models. Keep this tab open; your image is not uploaded.</p>
                      <progress
                        value={progress}
                        max={1}
                        aria-label="OCR progress"
                      />
                      <p role="status">
                        Reading screenshot text · {Math.round(progress * 100)}%
                      </p>
                    </>
                  )}
                  <p>
                    {state.reviewMode === 'universal' ? 'English and Chinese' : 'English'} text recognition.
                    Inspect and correct the highlighted regions.
                  </p>
                </section>
                {import.meta.env.DEV && state.reviewMode === 'universal' && state.ocr && state.universalResult &&
                  <details className="review-panel" aria-label="Development OCR diagnostics">
                    <summary>Development OCR diagnostics</summary>
                    <p>Visible text can only be measured against annotated test images. This panel shows counts, not recognized text.</p>
                    <p>{state.ocr.words.length} OCR words · {state.universalResult.findings.length} findings ·
                      {' '}{summarizeOcrDiagnostics(state.ocr, state.universalResult).unclassifiedFindings} unclassified findings ·
                      {' '}{summarizeOcrDiagnostics(state.ocr, state.universalResult).unassignedOcrWords} words not linked to findings.</p>
                  </details>}
                {state.reviewMode === 'universal' && <MaterialInspection ocr={state.ocr} />}
                {state.reviewMode === 'universal' && state.ocr && <OcrTextReview
                  key={`ocr-text:${image.id}:${state.scan.requestId}`}
                  ocr={state.ocr} findings={state.universalResult?.findings ?? []} masks={state.masks}
                  disabled={loading || state.scan.status === 'running'}
                  onMask={boxes => boxes.forEach(box => dispatch({ type: 'ADD_MANUAL_MASK', mask: {
                    ...box, id: crypto.randomUUID(), imageId: image.id, source: 'manual', shouldRedact: true,
                  } }))} />}
                {state.reviewMode === 'universal' && <p className="uv-muted">
                  Recommendations use local evidence and your selected context. Custom descriptions are notes,
                  not interpreted by AI. Confirm what the recipient needs before sharing.
                </p>}
                {universal && <UniversalReview
                  key={`review:${image.id}:${state.sharingContextV2!.id}`}
                  result={state.universalResult!}
                  taxonomy={privacyKnowledgeBase}
                  recommendations={universalRecommendations}
                  overrides={universalOverrides}
                  selectedFindingId={selectedFieldId}
                  status={state.scan.status === 'running' ? 'scanning' : state.scan.status === 'failed' ? 'failed' : 'ready'}
                  error={state.scan.error ?? undefined}
                  onSelectFinding={finding => setSelectedFieldId(finding.id)}
                  onDecision={(finding, decision) => {
                    if (finding.source.kind !== 'image' || finding.source.id !== image.id) return;
                    if (decision === 'MASK' && !imageBoxes(finding, image).length) {
                      setUnlocatedIntent(finding.id);
                      setManualLocationChecked(false);
                      return;
                    }
                    setUnlocatedIntent(null);
                    dispatch({ type: 'UPDATE_FIELD_DECISION', imageId: image.id, fieldId: finding.id, decision });
                  }}
                />}
                {unlocatedIntent && universal && <section className="uv-panel" aria-label="Locate information manually">
                  <h3>Locate this information before masking</h3>
                  <p>A MASK choice has no reliable image location. Add a manual region over the information, inspect its placement, then confirm. No pixels are covered by this choice alone.</p>
                  <label><input type="checkbox" checked={manualLocationChecked}
                    disabled={!state.masks.some(mask => mask.source === 'manual')}
                    onChange={event => setManualLocationChecked(event.target.checked)} />
                    I located and manually masked this information in the image.</label>
                  <button type="button" disabled={!manualLocationChecked || !state.masks.some(mask => mask.source === 'manual')}
                    onClick={() => { dispatch({ type: 'UPDATE_FIELD_DECISION', imageId: image.id,
                      fieldId: unlocatedIntent, decision: 'MASK', allowUnlocatedMask: true });
                      setUnlocatedIntent(null); }}>Confirm manual location</button>
                </section>}
                {universal && Object.values(state.decisions).some(d => d.action === 'REVIEW' && d.reviewReason === 'suggested_mask_removed') &&
                  <p role="alert">Suggested mask removed. Choose whether to keep this information visible or mask it.</p>}
                {!universal && <RecommendationReview
                  fields={state.fields}
                  recommendations={state.recommendations}
                  decisions={state.decisions}
                  selectedFieldId={selectedFieldId}
                  status={state.scan.status}
                  error={state.scan.error}
                  disabled={loading}
                  onSelectField={setSelectedFieldId}
                  onDecision={(imageId, fieldId, decision) =>
                    dispatch({
                      type: "UPDATE_FIELD_DECISION",
                      imageId,
                      fieldId,
                      decision,
                    })
                  }
                />}
                {state.reviewMode === 'classic' && <section className="review-panel">
                  <h2>Preview and download</h2>
                  <p>
                    {unresolved > 0
                      ? `${unresolved} fields still need a decision.`
                      : reviewCurrent
                        ? "You have reviewed the current mask arrangement."
                        : "Check the entire image for details the scan may have missed."}
                  </p>
                  <button
                    className="app-button full"
                    disabled={loading || !png.readyToPreview || png.rendering || !!png.previewUrl}
                    onClick={() => void png.generate()}
                  >
                    {png.rendering ? "Creating PNG…" : "Review redacted image"}
                  </button>
                  {png.error && <p role="alert">{png.error}</p>}
                </section>}
                {state.reviewMode === 'universal' && <FinalImageReview
                  key={image.id}
                  originalUrl={image.previewUrl}
                  imageId={image.id}
                  revision={state.revision}
                  ready={png.readyToPreview && !loading}
                  busy={png.rendering}
                  error={png.error ?? undefined}
                  preview={png.previewUrl ? { url: png.previewUrl, imageId: image.id,
                    revision: state.revision, width: image.width, height: image.height } : undefined}
                  onPreview={() => void png.generate()}
                  onDownload={() => {
                    if (!png.previewBlob || !png.previewUrl || !png.readyToPreview) return;
                    if (!state.masks.some(mask => mask.shouldRedact)) { setZeroMaskPrompt(png.previewBlob); return; }
                    try { downloadPng(png.previewBlob); }
                    catch (e) { setError(e instanceof Error ? e.message : 'Download could not start.'); }
                  }}
                />}
              </aside>
            </div>
            {state.reviewMode !== 'universal' && png.previewUrl && (
              <section className="final-review" aria-label="Redacted image review">
                <h2>Final PNG preview</h2>
                <p>
                  Inspect the entire screenshot. This is the actual {image.width} × {image.height} PNG
                  that will download, with opaque masks permanently drawn into its pixels.
                </p>
                <div className="review-image" style={{ aspectRatio: `${image.width}/${image.height}` }}>
                  <img src={png.previewUrl} alt="Final redacted PNG"
                    onLoad={() => setPreviewLoaded(png.previewBlob ?? null)}
                    onError={() => { setPreviewLoaded(null); setError("The PNG preview could not be displayed."); }} />
                </div>
                <p>
                  <label>
                    <input type="checkbox" checked={reviewCurrent}
                      disabled={previewLoaded !== png.previewBlob}
                      onChange={(event) => setReviewRevision(event.target.checked ? state.revision : null)} />
                    I reviewed the final PNG and checked for information that should be hidden.
                  </label>
                </p>
                <button className="app-button primary" disabled={!reviewCurrent || loading || png.rendering}
                  onClick={() => {
                    if (!reviewCurrent || !png.previewBlob) return;
                    if (!state.masks.some((m) => m.shouldRedact)) {
                      setZeroMaskPrompt(png.previewBlob);
                      return;
                    }
                    try { downloadPng(png.previewBlob); }
                    catch (e) { setError(e instanceof Error ? e.message : "Download could not start."); }
                  }}>
                  Download PNG
                </button>
                {zeroMaskPrompt === png.previewBlob && reviewCurrent && (
                  <dialog open aria-labelledby="zero-mask-title">
                    <h2 id="zero-mask-title">No Redactions Selected</h2>
                    <p>No information is currently masked. The exported image will contain all the original visible information. Please review the screenshot carefully before sharing it.</p>
                    <button className="app-button" autoFocus onClick={() => setZeroMaskPrompt(null)}>Go Back</button>
                    <button className="app-button primary" disabled={loading || png.rendering}
                      onClick={() => {
                        if (!reviewCurrent || !png.previewBlob || loading) return;
                        try { downloadPng(png.previewBlob); setZeroMaskPrompt(null); }
                        catch (e) { setError(e instanceof Error ? e.message : "Download could not start."); }
                      }}>Export Without Redactions</button>
                  </dialog>
                )}
              </section>
            )}
            {state.reviewMode === 'universal' && zeroMaskPrompt === png.previewBlob && png.previewBlob &&
              <dialog open aria-labelledby="universal-zero-mask-title">
                <h2 id="universal-zero-mask-title">No Redactions Selected</h2>
                <p>No information is currently masked. The exported image will contain all original visible information. Review it carefully before sharing.</p>
                <button className="app-button" onClick={() => setZeroMaskPrompt(null)}>Go Back</button>
                <button className="app-button primary" onClick={() => {
                  if (!png.previewBlob || !png.previewUrl || !png.readyToPreview) return;
                  try { downloadPng(png.previewBlob); setZeroMaskPrompt(null); }
                  catch (e) { setError(e instanceof Error ? e.message : 'Download could not start.'); }
                }}>Export Without Redactions</button>
              </dialog>}
          </>
        )}
        <footer className="app-footer">
          <span>No account. No cloud AI.</span>
          <span>Inspect before sharing.</span>
        </footer>
      </main>
    </div>
  );
}
