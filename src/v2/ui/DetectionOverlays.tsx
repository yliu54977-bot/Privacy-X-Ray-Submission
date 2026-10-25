import { useRef } from "react";
import type { LocalImage, PrivacyAction } from "../../types";
import type { UniversalFinding } from "../contracts";
import { imageBoxes } from "./reviewModel";

export interface DetectionOverlaysProps {
  image: Pick<LocalImage, "id" | "width" | "height">;
  findings: readonly UniversalFinding[];
  actions: Readonly<Record<string, PrivacyAction>>;
  selectedId?: string | null;
  pointerEnabled?: boolean;
  disabled?: boolean;
  onSelect?(id: string): void;
}
/** SVG coordinates stay in original pixels. Arrows move focus without changing decisions. */
export function DetectionOverlays({
  image,
  findings,
  actions,
  selectedId,
  pointerEnabled,
  disabled,
  onSelect,
}: DetectionOverlaysProps) {
  const refs = useRef(new Map<string, SVGGElement>());
  const located = findings.filter((f) => imageBoxes(f, image).length > 0);
  const active = located.some((f) => f.id === selectedId)
    ? selectedId
    : located[0]?.id;
  return (
    <g className="uv-detection-overlays" aria-label="Detected information">
      {located.map((f, index) => {
        const action = actions[f.id] ?? "REVIEW";
        return (
          <g
            key={f.id}
            ref={(node) => {
              if (node) refs.current.set(f.id, node);
              else refs.current.delete(f.id);
            }}
            role={onSelect ? "button" : undefined}
            tabIndex={
              onSelect && !disabled ? (active === f.id ? 0 : -1) : undefined
            }
            aria-label={`${f.label}: ${action}`}
            aria-pressed={selectedId === f.id}
            aria-disabled={disabled || undefined}
            className={`uv-detection uv-detection-${action.toLowerCase()} ${selectedId === f.id ? "uv-detection-selected" : ""}`}
            onFocus={() => {
              if (!disabled) onSelect?.(f.id);
            }}
            onPointerDown={(e) => {
              if (
                pointerEnabled &&
                onSelect &&
                !disabled &&
                e.button === 0 &&
                e.isPrimary !== false
              ) {
                e.stopPropagation();
                onSelect(f.id);
              }
            }}
            onKeyDown={(e) => {
              if (disabled || !onSelect) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(f.id);
                return;
              }
              const next =
                e.key === "ArrowRight" || e.key === "ArrowDown"
                  ? (index + 1) % located.length
                  : e.key === "ArrowLeft" || e.key === "ArrowUp"
                    ? (index + located.length - 1) % located.length
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? located.length - 1
                        : -1;
              if (next >= 0) {
                e.preventDefault();
                onSelect(located[next].id);
                refs.current.get(located[next].id)?.focus();
              }
            }}
          >
            <title>
              {f.label}: {action}. Use arrow keys to select another finding.
            </title>
            {imageBoxes(f, image).map((box, i) => (
              <rect
                key={i}
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill="none"
                vectorEffect="non-scaling-stroke"
                pointerEvents={
                  pointerEnabled && onSelect && !disabled ? "stroke" : "none"
                }
              />
            ))}
          </g>
        );
      })}
    </g>
  );
}
