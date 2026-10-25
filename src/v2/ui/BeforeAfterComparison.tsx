import { useId, useRef, useState } from "react";
import type { PointerEvent } from "react";
export interface BeforeAfterComparisonProps {
  originalUrl: string;
  redactedUrl: string;
  width: number;
  height: number;
  onReady(): void;
  onError(): void;
}
/** This only compares supplied images. It never modifies or re-encodes export pixels. */
export function BeforeAfterComparison(props: BeforeAfterComparisonProps) {
  const key = JSON.stringify([
    props.originalUrl,
    props.redactedUrl,
    props.width,
    props.height,
  ]);
  return <ComparisonImages key={key} {...props} />;
}
function ComparisonImages({
  originalUrl,
  redactedUrl,
  width,
  height,
  onReady,
  onError,
}: BeforeAfterComparisonProps) {
  const id = useId(),
    [position, setPosition] = useState(50),
    [failed, setFailed] = useState(false);
  const pointer = useRef<number | null>(null);
  const readiness = useRef({
    original: false,
    png: false,
    failed: false,
    reported: false,
  });
  function loaded(which: "original" | "png", image: HTMLImageElement) {
    if (
      image.naturalWidth !== width ||
      image.naturalHeight !== height ||
      width <= 0 ||
      height <= 0
    ) {
      invalid();
      return;
    }
    readiness.current[which] = true;
    if (
      readiness.current.original &&
      readiness.current.png &&
      !readiness.current.failed &&
      !readiness.current.reported
    ) {
      readiness.current.reported = true;
      onReady();
    }
  }
  function positionAt(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width > 0)
      setPosition(
        Math.round(
          Math.max(
            0,
            Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100),
          ),
        ),
      );
  }
  function invalid() {
    readiness.current.failed = true;
    setFailed(true);
    onError();
  }
  return (
    <section
      className="uv-comparison"
      aria-label="Before and after image comparison"
    >
      <div
        className="uv-comparison-stage"
        style={{ aspectRatio: `${width}/${height}` }}
        onPointerDown={(e) => {
          if (
            e.button !== 0 ||
            e.isPrimary === false ||
            pointer.current !== null ||
            failed
          )
            return;
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          positionAt(e);
        }}
        onPointerMove={(e) => {
          if (
            pointer.current === e.pointerId &&
            e.currentTarget.hasPointerCapture(e.pointerId)
          )
            positionAt(e);
        }}
        onPointerUp={(e) => {
          if (pointer.current !== e.pointerId) return;
          positionAt(e);
          pointer.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={(e) => {
          if (pointer.current === e.pointerId) {
            pointer.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onLostPointerCapture={(e) => {
          if (pointer.current === e.pointerId) pointer.current = null;
        }}
      >
        <img
          src={originalUrl}
          alt="Original screenshot, before redaction"
          draggable={false}
          onLoad={(e) => loaded("original", e.currentTarget)}
          onError={invalid}
        />
        <img
          className="uv-comparison-after"
          src={redactedUrl}
          alt="Final redacted PNG for v2 review"
          draggable={false}
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          onLoad={(e) => loaded("png", e.currentTarget)}
          onError={invalid}
        />
        <span
          className="uv-comparison-line"
          style={{ left: `${position}%` }}
          aria-hidden="true"
        >
          <span>↔</span>
        </span>
        <span className="uv-comparison-label uv-comparison-label-after">
          Redacted PNG
        </span>
        <span className="uv-comparison-label uv-comparison-label-before">
          Original
        </span>
      </div>
      <label htmlFor={id}>
        Reveal redacted image
        <input
          id={id}
          type="range"
          min="0"
          max="100"
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          aria-valuetext={`${position}% redacted image shown`}
        />
      </label>
      <p className="uv-muted">
        Drag the slider or use arrow keys. The original remains visible for
        comparison; the download uses only the permanently redacted PNG. Move to
        100% to inspect the complete result.
      </p>
      {failed && (
        <p role="alert">
          Comparison could not load matching images. Do not download until a
          current preview is available.
        </p>
      )}
    </section>
  );
}
