import { useId, useState } from "react";
import type { RedactionEditorProps } from "../../types";

/** Keyboard alternative to pointer drawing. Only geometry intentions cross B's event boundary. */
export function PrecisionControls({
  image,
  masks,
  disabled,
  onAddManual,
  onUpdateMask,
  onDeleteMask,
}: Omit<RedactionEditorProps, "highlights">) {
  const id = useId(),
    [selected, setSelected] = useState("new"),
    [message, setMessage] = useState("");
  const current = masks.filter((m) => m.imageId === image.id),
    mask = current.find((m) => m.id === selected);
  const box = mask ?? {
    x: 0,
    y: 0,
    width: Math.max(1, Math.floor(image.width / 4)),
    height: Math.max(1, Math.floor(image.height / 4)),
  };
  return (
    <details className="uv-panel">
      <summary>Keyboard and precise region controls</summary>
      <p className="uv-muted">
        Add or edit a real image region without dragging. Measurements use the
        original image, from its top-left corner.
      </p>
      <label htmlFor={`${id}-region`}>
        Region
        <select
          id={`${id}-region`}
          value={mask?.id ?? "new"}
          disabled={disabled}
          onChange={(e) => {
            setSelected(e.target.value);
            setMessage("");
          }}
        >
          <option value="new">New manual region</option>
          {current.map((m, i) => (
            <option key={m.id} value={m.id}>
              Region {i + 1} ·{" "}
              {m.source === "manual" ? "Manual" : "Field-linked"}
            </option>
          ))}
        </select>
      </label>
      <form
        key={`${image.id}:${mask?.id ?? "new"}:${box.x}:${box.y}:${box.width}:${box.height}`}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const rect = {
            x: Number(data.get("x")),
            y: Number(data.get("y")),
            width: Number(data.get("width")),
            height: Number(data.get("height")),
          };
          if (
            ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ||
            rect.x < 0 ||
            rect.y < 0 ||
            rect.width <= 0 ||
            rect.height <= 0 ||
            rect.x + rect.width > image.width ||
            rect.y + rect.height > image.height
          ) {
            setMessage(
              "Keep the region inside the original image with a positive width and height.",
            );
            return;
          }
          if (mask) onUpdateMask(image.id, mask.id, rect);
          else onAddManual(image.id, rect);
          setMessage(
            mask
              ? "Region updated. Check the final image again."
              : "Manual region added. Check its position on the image.",
          );
        }}
      >
        <fieldset disabled={disabled}>
          <legend className="uv-sr-only">Original-pixel region geometry</legend>
          <div className="uv-form-grid">
            {(
              [
                { key: "x", label: "Left edge", max: image.width },
                { key: "y", label: "Top edge", max: image.height },
                { key: "width", label: "Width", max: image.width },
                { key: "height", label: "Height", max: image.height },
              ] as const
            ).map(({ key, label, max }) => (
              <label key={key} htmlFor={`${id}-${key}`}>
                {label} (original pixels)
                <input
                  id={`${id}-${key}`}
                  name={key}
                  type="number"
                  step="any"
                  min={key === "x" || key === "y" ? 0 : 0.01}
                  max={max}
                  required
                  defaultValue={box[key]}
                />
              </label>
            ))}
          </div>
          <div className="uv-actions">
            <button type="submit">
              {mask ? "Apply region changes" : "Add manual region"}
            </button>
            {mask && (
              <button
                type="button"
                onClick={() => {
                  onDeleteMask(image.id, mask.id);
                  setSelected("new");
                  setMessage(
                    "Region removed. Review linked information again if needed.",
                  );
                }}
              >
                Remove this region
              </button>
            )}
          </div>
        </fieldset>
      </form>
      <p role="status">{message}</p>
    </details>
  );
}
