import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { PixelRect } from "../../types";
import type { EditorProps } from "./contracts";
import {
  createRect,
  imagePoint,
  moveRect,
  resizeRect,
  validRect,
} from "./geometry";
import type { Handle, Point } from "./geometry";
import "./editor.css";

type Drag = {
  imageId: string;
  start: Point;
  draft: PixelRect;
  original: PixelRect;
  maskId?: string;
  handle?: Handle;
};
export function RedactionEditor({
  image,
  masks,
  highlights,
  selectedFieldId,
  decisions,
  renderFindingOverlay,
  onSelectHighlight,
  disabled = false,
  onAddManual,
  onUpdateMask,
  onDeleteMask,
}: EditorProps) {
  const pointer = useRef<number | null>(null);
  useEffect(() => {
    pointer.current = null;
    setDrag(null);
  }, [image.id, disabled]);
  const [mode, setMode] = useState<"draw" | "select">("draw");
  const [selection, setSelection] = useState<{
    imageId: string;
    id: string;
  } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = masks.filter((m) => m.imageId === image.id);
  const selected =
    selection?.imageId === image.id
      ? current.find((m) => m.id === selection.id)
      : undefined;
  const activeDrag = drag?.imageId === image.id ? drag : null;
  const ready = loaded === image.previewUrl && error !== image.previewUrl;
  function point(event: PointerEvent<SVGSVGElement>) {
    return imagePoint(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      image.width,
      image.height,
    );
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (
      disabled ||
      !ready ||
      event.button !== 0 ||
      event.isPrimary === false ||
      pointer.current !== null
    )
      return;
    const target = event.target as SVGElement;
    const id = target.getAttribute("data-mask");
    const handle = target.getAttribute("data-handle") as Handle | null;
    const mask = current.find((m) => m.id === id);
    const p = point(event);
    if (mask?.source === "recommendation" && mode === "select")
      onSelectHighlight?.(mask.fieldId);
    if (mask && (mode === "select" || handle)) {
      setSelection({ imageId: image.id, id: mask.id });
      setDrag({
        imageId: image.id,
        start: p,
        original: mask,
        draft: mask,
        maskId: mask.id,
        handle: handle ?? undefined,
      });
    } else if (mode === "draw") {
      setSelection(null);
      const rect = createRect(p, p);
      setDrag({ imageId: image.id, start: p, original: rect, draft: rect });
    } else {
      setSelection(null);
      return;
    }
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function draft(event: PointerEvent<SVGSVGElement>, d: Drag) {
    const p = point(event);
    return d.handle
      ? resizeRect(d.original, d.handle, p, image.width, image.height)
      : d.maskId
        ? moveRect(
            d.original,
            { x: p.x - d.start.x, y: p.y - d.start.y },
            image.width,
            image.height,
          )
        : createRect(d.start, p);
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (!activeDrag || pointer.current !== event.pointerId) return;
    pointer.current = null;
    const rect = draft(event, activeDrag);
    setDrag(null);
    if (!disabled && ready && validRect(rect)) {
      if (activeDrag.maskId) {
        const original = activeDrag.original;
        if (
          rect.x !== original.x ||
          rect.y !== original.y ||
          rect.width !== original.width ||
          rect.height !== original.height
        )
          onUpdateMask(image.id, activeDrag.maskId, rect);
      } else onAddManual(image.id, rect);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  const handles: Handle[] = ["nw", "ne", "sw", "se"];
  return (
    <section className="px-editor" aria-label="Screenshot redaction editor">
      <div className="px-toolbar">
        <div>
          <button
            type="button"
            aria-pressed={mode === "draw"}
            disabled={disabled}
            onClick={() => setMode("draw")}
          >
            Add Mask
          </button>
          <button
            type="button"
            aria-pressed={mode === "select"}
            disabled={disabled}
            onClick={() => setMode("select")}
          >
            Select / Edit
          </button>
        </div>
        <button
          type="button"
          disabled={disabled || !selected}
          onClick={() => {
            if (selected) {
              onDeleteMask(image.id, selected.id);
              setSelection(null);
            }
          }}
        >
          Delete Selected
        </button>
      </div>
      <p className="px-help">
        Drag to add a mask. Select a region to move it or drag a corner to
        resize.
      </p>
      <div className="px-stage">
        <div
          className="px-image-wrap"
          style={{ aspectRatio: `${image.width} / ${image.height}` }}
        >
          <img
            key={image.previewUrl}
            src={image.previewUrl}
            alt="Original screenshot for privacy review"
            draggable={false}
            onLoad={() => {
              setLoaded(image.previewUrl);
              setError(null);
            }}
            onError={() => setError(image.previewUrl)}
          />
          {ready && (
            <svg
              viewBox={`0 0 ${image.width} ${image.height}`}
              aria-label="Mask editing surface"
              className={`px-overlay px-${mode}`}
              onPointerDown={start}
              onPointerMove={(e) => {
                if (activeDrag && !disabled && pointer.current === e.pointerId)
                  setDrag({ ...activeDrag, draft: draft(e, activeDrag) });
              }}
              onPointerUp={finish}
              onPointerCancel={(e) => {
                if (pointer.current === e.pointerId) {
                  pointer.current = null;
                  setDrag(null);
                }
              }}
              onLostPointerCapture={(e) => {
                if (pointer.current === e.pointerId) {
                  pointer.current = null;
                  setDrag(null);
                }
              }}
            >
              {highlights
                .filter((f) => f.imageId === image.id)
                .flatMap((f) =>
                  f.boxes.map((box, i) => (
                    <rect
                      key={`${f.id}-${i}`}
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      className={`px-highlight ${decisions?.[f.id]?.action === "REVIEW" ? "px-review" : ""} ${f.id === selectedFieldId ? "px-field-selected" : ""}`}
                      vectorEffect="non-scaling-stroke"
                    />
                  )),
                )}
              {current.map((mask) => {
                const box =
                  activeDrag?.maskId === mask.id ? activeDrag.draft : mask;
                return (
                  <rect
                    key={mask.id}
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    data-mask={mask.id}
                    fill={mask.shouldRedact ? "#000" : "transparent"}
                    className={
                      selected?.id === mask.id
                        ? "px-mask px-selected"
                        : "px-mask"
                    }
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
              {activeDrag && !activeDrag.maskId && (
                <rect
                  x={activeDrag.draft.x}
                  y={activeDrag.draft.y}
                  width={activeDrag.draft.width}
                  height={activeDrag.draft.height}
                  fill="#000"
                  opacity="0.85"
                  pointerEvents="none"
                />
              )}
              {highlights
                .filter(
                  (f) => f.imageId === image.id && f.id === selectedFieldId,
                )
                .flatMap((f) =>
                  f.boxes.map((box, i) => (
                    <rect
                      key={`selected-${f.id}-${i}`}
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      fill="none"
                      stroke="#8054df"
                      strokeWidth="3"
                      pointerEvents="none"
                      vectorEffect="non-scaling-stroke"
                    />
                  )),
                )}
              {renderFindingOverlay?.(mode === "select" && !disabled)}
              {selected &&
                handles.map((handle) => {
                  const box =
                    activeDrag?.maskId === selected.id
                      ? activeDrag.draft
                      : selected;
                  const size = image.width / 65;
                  return (
                    <rect
                      key={handle}
                      data-mask={selected.id}
                      data-handle={handle}
                      x={
                        (handle.endsWith("w") ? box.x : box.x + box.width) -
                        size / 2
                      }
                      y={
                        (handle.startsWith("n") ? box.y : box.y + box.height) -
                        size / 2
                      }
                      width={size}
                      height={size}
                      className="px-handle"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
            </svg>
          )}
          {!ready && (
            <div
              className="px-image-status"
              role={error === image.previewUrl ? "alert" : "status"}
            >
              {error === image.previewUrl
                ? "Image preview could not load. Choose another image."
                : "Loading image preview…"}
            </div>
          )}
        </div>
      </div>
      <div className="px-footer">
        {image.width} × {image.height} original pixels ·{" "}
        {current.filter((m) => m.shouldRedact).length} active masks
      </div>
      <div className="px-region-list" aria-label="Mask regions">
        {current.map((mask, index) => (
          <button
            type="button"
            key={mask.id}
            disabled={disabled}
            aria-pressed={selected?.id === mask.id}
            onClick={() => {
              setMode("select");
              setSelection({ imageId: image.id, id: mask.id });
            }}
          >
            Region {index + 1} ·{" "}
            {mask.source === "manual" ? "Manual" : "Field-linked"}
            {mask.shouldRedact ? "" : " · Not masked"}
          </button>
        ))}
      </div>
    </section>
  );
}
