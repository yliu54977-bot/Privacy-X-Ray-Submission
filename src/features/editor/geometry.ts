import type { PixelRect } from "../../types";
export interface Point {
  x: number;
  y: number;
}
export type Handle = "nw" | "ne" | "sw" | "se";
const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
export function imagePoint(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): Point {
  return {
    x: clamp(((clientX - bounds.left) * width) / bounds.width, width),
    y: clamp(((clientY - bounds.top) * height) / bounds.height, height),
  };
}
export function createRect(a: Point, b: Point): PixelRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}
export function moveRect(
  rect: PixelRect,
  delta: Point,
  width: number,
  height: number,
): PixelRect {
  const w = Math.min(rect.width, width),
    h = Math.min(rect.height, height);
  return {
    x: clamp(rect.x + delta.x, width - w),
    y: clamp(rect.y + delta.y, height - h),
    width: w,
    height: h,
  };
}
export function resizeRect(
  rect: PixelRect,
  handle: Handle,
  point: Point,
  width: number,
  height: number,
): PixelRect {
  const opposite = {
    x: handle.endsWith("w") ? rect.x + rect.width : rect.x,
    y: handle.startsWith("n") ? rect.y + rect.height : rect.y,
  };
  return createRect(
    { x: clamp(opposite.x, width), y: clamp(opposite.y, height) },
    { x: clamp(point.x, width), y: clamp(point.y, height) },
  );
}
export function validRect(rect: PixelRect): boolean {
  return (
    Object.values(rect).every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0
  );
}
