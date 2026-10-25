import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { LocalImage, PrivacyAction, RedactionRect } from "../../types";
import type { SharingContextV2, UniversalFinding } from "../contracts";
import { privacyKnowledgeBase } from "../privacyKnowledgeBase";
import { sampleImage } from "../../features/image/sampleImage";
import { loadImage } from "../../features/image/loadImage";
import { redactImage } from "../../features/export/redactImage";
import { downloadPng } from "../../features/export/downloadPng";
import {
  UniversalReview,
  InspectionOverview,
  SharingContextForm,
  UniversalMaskEditor,
  FinalImageReview,
  contextPresets,
} from "./index";
import type { FinalImageReviewProps } from "./FinalImageReview";
import { effectiveAction, imageBoxes } from "./reviewModel";
import { mockReview } from "./mockData";
import "./universal.css";

/** Isolated B UI harness. All authoritative transitions below are demo-only, for A to replace. */
function Demo() {
  const [image, setImage] = useState<LocalImage>(),
    [kind, setKind] = useState<"tuition" | "order">("tuition"),
    [large, setLarge] = useState(false);
  const [context, setContext] = useState<SharingContextV2>(contextPresets[0]);
  const [masks, setMasks] = useState<readonly RedactionRect[]>([]),
    [overrides, setOverrides] = useState<Record<string, PrivacyAction>>({});
  const [selected, setSelected] = useState<string | null>(null),
    [revision, setRevision] = useState(0),
    [located, setLocated] = useState<ReadonlySet<string>>(new Set());
  const [preview, setPreview] = useState<FinalImageReviewProps["preview"]>(),
    [blob, setBlob] = useState<Blob>(),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState<string>();
  const [zeroWarning, setZeroWarning] = useState(false);
  const sequence = useRef(0),
    version = useRef(0);
  const data = image ? mockReview(image, large, kind) : undefined;
  useEffect(
    () => () => {
      sequence.current++;
      version.current++;
    },
    [],
  );
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.previewUrl);
    },
    [image],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  function invalidate(clearLocations = true) {
    version.current++;
    setRevision(version.current);
    setPreview(undefined);
    setBlob(undefined);
    setError(undefined);
    setBusy(false);
    if (clearLocations) setLocated(new Set());
    setZeroWarning(false);
  }
  async function load(next: "tuition" | "order") {
    const run = ++sequence.current;
    invalidate();
    setLoading(true);
    setImage(undefined);
    setSelected(null);
    setMasks([]);
    setOverrides({});
    setContext(next === "tuition" ? contextPresets[0] : contextPresets[1]);
    setLarge(false);
    try {
      const img = await loadImage(await sampleImage(next));
      if (run !== sequence.current) {
        URL.revokeObjectURL(img.previewUrl);
        return;
      }
      setKind(next);
      setImage(img);
      const initial = mockReview(img, false, next);
      setMasks(
        initial.result.findings
          .filter(
            (f) => effectiveAction(f, initial.recommendations, {}) === "MASK",
          )
          .flatMap((f) =>
            imageBoxes(f, img).map((box, i) => ({
              ...box,
              id: `${f.id}-${i}`,
              fieldId: f.id,
              source: "recommendation" as const,
              shouldRedact: true,
              imageId: img.id,
            })),
          ),
      );
    } catch {
      if (run === sequence.current)
        setError("The fictional image could not load. Try again.");
    } finally {
      if (run === sequence.current) setLoading(false);
    }
  }
  function decide(f: UniversalFinding, action: PrivacyAction) {
    if (!image || f.source.id !== image.id) return;
    invalidate();
    setOverrides((previous) => ({ ...previous, [f.id]: action }));
    setMasks((previous) => [
      ...previous.filter(
        (m) => m.source !== "recommendation" || m.fieldId !== f.id,
      ),
      ...(action === "MASK"
        ? imageBoxes(f, image).map((box, i) => ({
            ...box,
            id: `${f.id}-${i}`,
            fieldId: f.id,
            source: "recommendation" as const,
            shouldRedact: true,
            imageId: image.id,
          }))
        : []),
    ]);
  }
  function remove(maskId: string) {
    const target = masks.find((m) => m.id === maskId);
    if (!target) return;
    invalidate();
    if (target.source === "recommendation") {
      setMasks((previous) =>
        previous.filter(
          (m) => m.source !== "recommendation" || m.fieldId !== target.fieldId,
        ),
      );
      setOverrides((previous) => ({ ...previous, [target.fieldId]: "REVIEW" }));
      setError(
        "Suggested mask removed. Choose whether to keep this information visible or mask it.",
      );
    } else setMasks((previous) => previous.filter((m) => m.id !== maskId));
  }
  const unlocated =
    data?.result.findings.filter(
      (f) =>
        effectiveAction(f, data.recommendations, overrides) === "MASK" &&
        imageBoxes(f, image).length === 0,
    ) ?? [];
  const ready =
    !!data &&
    !data.result.findings.some(
      (f) => effectiveAction(f, data.recommendations, overrides) === "REVIEW",
    ) &&
    unlocated.every((f) => located.has(f.id));
  async function generate() {
    if (!image || !ready) return;
    const current = version.current;
    setBusy(true);
    try {
      const output = await redactImage(image, masks);
      if (current !== version.current) return;
      setBlob(output);
      setPreview({
        url: URL.createObjectURL(output),
        imageId: image.id,
        revision: current,
        width: image.width,
        height: image.height,
      });
    } catch {
      if (current === version.current)
        setError("The final image could not be prepared. Try again.");
    } finally {
      if (current === version.current) setBusy(false);
    }
  }
  function download() {
    if (!blob || !ready) return;
    if (!masks.some((m) => m.shouldRedact)) {
      setZeroWarning(true);
      return;
    }
    downloadPng(blob);
  }
  return (
    <div className="uv-shell">
      <header className="uv-header">
        <div className="uv-brand">
          <span>▧</span>Privacy X-Ray
        </div>
        <span className="uv-demo-badge">V2 UI demo · simulated inspection</span>
      </header>
      <main className="uv-main">
        <div className="uv-intro">
          <p className="uv-eyebrow">SHARE WITH INTENTION</p>
          <h1>A clearer view of what you share.</h1>
          <p>
            Review the information, understand the limits and decide what your
            recipient needs.
          </p>
          <p className="uv-muted">
            This isolated demo uses fictional data and static mock
            recommendations. It does not run OCR or interpret context text. PNG
            rendering uses the existing local exporter.
          </p>
        </div>
        <div className="uv-demo-controls">
          <button disabled={loading} onClick={() => void load("tuition")}>
            Load tuition UI sample
          </button>
          <button disabled={loading} onClick={() => void load("order")}>
            Load order UI sample
          </button>
          {image && (
            <button
              onClick={() => {
                invalidate();
                setLarge(!large);
                setSelected(null);
              }}
            >
              Show {large ? "sample" : "240 mock"} findings
            </button>
          )}
        </div>
        {loading && <p role="status">Loading fictional screenshot…</p>}
        {error && (
          <p className="uv-warning" role="alert">
            {error}
          </p>
        )}
        {!image && !loading && (
          <section className="uv-panel">
            <h2>Choose a fictional sample</h2>
            <p>
              The existing v1 app remains at <a href="/">the main entry</a>.
              This UI development page does not change that workflow.
            </p>
          </section>
        )}
        {image && data && (
          <>
          <InspectionOverview result={data.result} recommendations={data.recommendations} overrides={overrides}/>
          <div className="uv-layout">
            <div className="uv-column">
              <UniversalMaskEditor
                key={image.id}
                image={image}
                masks={masks}
                findings={data.result.findings}
                recommendations={data.recommendations}
                overrides={overrides}
                selectedFindingId={selected}
                onSelectFindingId={setSelected}
                onAddManual={(imageId, rect) => {
                  if (imageId !== image.id) return;
                  invalidate();
                  setMasks((previous) => [
                    ...previous,
                    {
                      ...rect,
                      id: crypto.randomUUID(),
                      imageId,
                      source: "manual",
                      shouldRedact: true,
                    },
                  ]);
                }}
                onUpdateMask={(imageId, maskId, rect) => {
                  if (imageId !== image.id) return;
                  invalidate();
                  setMasks((previous) =>
                    previous.map((m) =>
                      m.id === maskId ? { ...m, ...rect } : m,
                    ),
                  );
                }}
                onDeleteMask={(imageId, maskId) => {
                  if (imageId === image.id) remove(maskId);
                }}
              />
              <div className="uv-active-context">
                <strong>Applied context:</strong> {context.recipient.name} ·{" "}
                {context.purpose}
                <br />
                Mock recommendations stay illustrative when context changes; no
                real policy interpretation runs here.
              </div>
              <SharingContextForm
                key={`${image.id}:${context.id}`}
                value={context}
                taxonomy={privacyKnowledgeBase}
                requiresConfirmation
                onApply={(next) => {
                  invalidate();
                  setContext(next);
                  setOverrides({});
                  setMasks((previous) => [
                    ...previous.filter((m) => m.source === "manual"),
                    ...data.result.findings
                      .filter(
                        (f) =>
                          effectiveAction(f, data.recommendations, {}) ===
                          "MASK",
                      )
                      .flatMap((f) =>
                        imageBoxes(f, image).map((box, i) => ({
                          ...box,
                          id: `${f.id}-${i}`,
                          fieldId: f.id,
                          source: "recommendation" as const,
                          shouldRedact: true,
                          imageId: image.id,
                        })),
                      ),
                  ]);
                  setSelected(null);
                }}
              />
              {unlocated.length > 0 && (
                <section
                  className="uv-unlocated"
                  aria-label="Manually located information"
                >
                  <h3>Confirm manually located masks</h3>
                  <p>
                    These MASK choices have no precise boxes. Draw and inspect a
                    manual mask for each, then confirm. Editing masks clears
                    these confirmations.
                  </p>
                  {unlocated.map((f) => (
                    <label className="uv-check" key={f.id}>
                      <input
                        type="checkbox"
                        checked={located.has(f.id)}
                        disabled={
                          !masks.some(
                            (m) => m.source === "manual" && m.shouldRedact,
                          )
                        }
                        onChange={(e) => {
                          const next = new Set(located);
                          if (e.target.checked) next.add(f.id);
                          else next.delete(f.id);
                          invalidate(false);
                          setLocated(next);
                        }}
                      />
                      I located and manually masked: {f.label}
                    </label>
                  ))}
                </section>
              )}
              <FinalImageReview
                originalUrl={image.previewUrl}
                imageId={image.id}
                revision={revision}
                ready={ready}
                busy={busy}
                error={error}
                preview={preview}
                onPreview={() => void generate()}
                onDownload={download}
              />
              {zeroWarning && (
                <section
                  className="uv-panel"
                  role="region"
                  aria-label="No Redactions Selected"
                >
                  <h3>No Redactions Selected</h3>
                  <p>
                    No information is currently masked. The exported image will
                    contain all the original visible information. Please review
                    the screenshot carefully before sharing it.
                  </p>
                  <div className="uv-actions">
                    <button onClick={() => setZeroWarning(false)}>
                      Go Back
                    </button>
                    <button
                      onClick={() => {
                        if (blob && ready) {
                          downloadPng(blob);
                          setZeroWarning(false);
                        }
                      }}
                    >
                      Export Without Redactions
                    </button>
                  </div>
                </section>
              )}
            </div>
            <UniversalReview
              key={image.id}
              result={data.result}
              taxonomy={privacyKnowledgeBase}
              recommendations={data.recommendations}
              overrides={overrides}
              selectedFindingId={selected}
              onSelectFinding={(f) => {
                setSelected(f.id);
                document
                  .querySelector(".uv-mask-editor")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              onDecision={decide}
            />
          </div>
          </>
        )}
        <p className="uv-muted">
          Browser-local demo. No account or cloud AI. Download before leaving;
          this session is temporary.
        </p>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Demo />);
