import { BeforeAfterComparison } from "./BeforeAfterComparison";
import { useRef, useState } from "react";
import "./universal.css";

/** URL lifecycle, revision and PNG generation remain owned by A/C. */
export interface FinalImageReviewProps {
  originalUrl?: string;
  imageId: string;
  revision: number;
  ready: boolean;
  busy?: boolean;
  error?: string;
  preview?: {
    url: string;
    imageId: string;
    revision: number;
    width: number;
    height: number;
  };
  onPreview(): void;
  onDownload(): void;
}
function snapshotIdentity(props: FinalImageReviewProps) {
  const p = props.preview;
  return p &&
    p.imageId === props.imageId &&
    p.revision === props.revision &&
    props.ready
    ? JSON.stringify([
        p.imageId,
        p.revision,
        p.url,
        props.originalUrl ?? "",
        p.width,
        p.height,
      ])
    : "";
}
export function FinalImageReview(props: FinalImageReviewProps) {
  return <CurrentImageReview key={snapshotIdentity(props)} {...props} />;
}
function CurrentImageReview(props: FinalImageReviewProps) {
  const p = props.preview;
  const current =
    !!p &&
    p.imageId === props.imageId &&
    p.revision === props.revision &&
    props.ready;
  const identity = snapshotIdentity(props);
  const [attempt, setAttempt] = useState(0);
  const token = `${identity}:${attempt}`;
  const activeIdentity = useRef(token);
  activeIdentity.current = token;
  const [loaded, setLoaded] = useState(""),
    [reviewed, setReviewed] = useState(""),
    [failed, setFailed] = useState("");
  const previewFailed = !!identity && failed === token;
  const valid = current && loaded === token && !previewFailed;
  function loadedCurrent() {
    if (activeIdentity.current === token) {
      setLoaded(token);
    }
  }
  function failedCurrent() {
    if (activeIdentity.current === token) {
      setLoaded("");
      setReviewed("");
      setFailed(token);
    }
  }
  return (
    <section className="uv-panel uv-final" aria-label="Final image review">
      <p className="uv-eyebrow">FINAL CHECK</p>
      <h2>Inspect what you will share</h2>
      <p>
        Resolve every REVIEW finding and manually locate information without
        boxes. A MASK choice alone does not prove that pixels have been covered.
      </p>
      {!props.ready && (
        <p className="uv-warning">
          Resolve outstanding decisions and confirm any manually located
          information before previewing.
        </p>
      )}
      <button
        type="button"
        className="uv-primary"
        disabled={!props.ready || props.busy || (current && !previewFailed)}
        onClick={() => {
          if (previewFailed) {
            setAttempt((n) => n + 1);
          } else props.onPreview();
        }}
      >
        {props.busy
          ? "Preparing final image…"
          : previewFailed
            ? "Reload PNG preview"
            : "Generate final PNG preview"}
      </button>
      {props.busy && <p role="status">Preparing the current redacted image.</p>}
      {props.error && <p role="alert">{props.error}</p>}
      {current && (
        <>
          <p>
            Actual PNG · {p.width} × {p.height} original pixels. Inspect the
            entire image.
          </p>
          {props.originalUrl ? (
            <BeforeAfterComparison
              key={token}
              originalUrl={props.originalUrl}
              redactedUrl={p.url}
              width={p.width}
              height={p.height}
              onReady={loadedCurrent}
              onError={failedCurrent}
            />
          ) : (
            <img
              key={token}
              src={p.url}
              alt="Final redacted PNG for v2 review"
              onLoad={(event) => {
                if (
                  event.currentTarget.naturalWidth === p.width &&
                  event.currentTarget.naturalHeight === p.height
                )
                  loadedCurrent();
                else failedCurrent();
              }}
              onError={failedCurrent}
            />
          )}
          {failed === token && (
            <p role="alert">
              The final image could not be displayed. Reload the preview or
              choose the image again before downloading.
            </p>
          )}
          <label className="uv-check">
            <input
              type="checkbox"
              disabled={!valid}
              checked={valid && reviewed === token}
              onChange={(e) => setReviewed(e.target.checked ? token : "")}
            />
            I checked the final image, including information the inspection may
            have missed.
          </label>
          <button
            type="button"
            disabled={!valid || reviewed !== token || props.busy}
            onClick={() => {
              if (valid && reviewed === token && !props.busy)
                props.onDownload();
            }}
          >
            Download reviewed PNG
          </button>
        </>
      )}
    </section>
  );
}
