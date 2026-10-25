import type { PixelRect } from "../types";

export function clipRect(
  rect: PixelRect,
  width: number,
  height: number,
): PixelRect | null {
  if (
    ![
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      rect.x + rect.width,
      rect.y + rect.height,
    ].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return null;
  const x = Math.max(0, rect.x),
    y = Math.max(0, rect.y),
    right = Math.min(width, rect.x + rect.width),
    bottom = Math.min(height, rect.y + rect.height);
  return right > x && bottom > y
    ? { x, y, width: right - x, height: bottom - y }
    : null;
}
