import type { PixelRect } from '../../types';

function valid(box: PixelRect, width: number, height: number): boolean {
  return [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
    box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 &&
    box.x + box.width <= width && box.y + box.height <= height;
}

function sameRow(a: PixelRect, b: PixelRect): boolean {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const centerDistance = Math.abs(a.y + a.height / 2 - b.y - b.height / 2);
  return overlap >= Math.min(a.height, b.height) * 0.5 &&
    centerDistance <= Math.max(a.height, b.height) * 0.6;
}

function union(a: PixelRect, b: PixelRect): PixelRect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/**
 * Cover selected OCR text as continuous runs rather than isolated glyphs.
 * Inputs use upright original-image pixels. Wrapped rows and distant columns
 * remain separate. Missing/invalid locations are never invented or repaired.
 * Only the small coverage margin is clipped at the image boundary.
 */
export function coveringTextRegions(
  boxes: readonly PixelRect[], width: number, height: number,
): readonly PixelRect[] {
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) return [];
  const rows: PixelRect[][] = [];
  for (const box of boxes.filter(box => valid(box, width, height))
    .sort((a, b) => a.y + a.height / 2 - b.y - b.height / 2 || a.x - b.x)) {
    // Assemble the baseline before splitting horizontal runs. A short digit can
    // sort before the taller word between it and the start of the line.
    const row = rows.find(row => row.some(neighbor => sameRow(neighbor, box)));
    if (row) row.push(box); else rows.push([box]);
  }
  const runs: PixelRect[] = [];
  for (const row of rows) {
    let current: PixelRect | undefined;
    let previous: PixelRect | undefined;
    for (const box of row.sort((a, b) => a.x - b.x)) {
      const gap = previous ? box.x - previous.x - previous.width : Infinity;
      const maximumGap = Math.max(4, Math.max(previous?.height ?? 0, box.height) * 0.9);
      if (current && gap <= maximumGap) current = union(current, box);
      else {
        if (current) runs.push(current);
        current = { ...box };
      }
      previous = box;
    }
    if (current) runs.push(current);
  }
  return runs.map(box => {
    const padding = Math.min(8, Math.max(2, box.height * 0.12));
    const x = Math.max(0, box.x - padding), y = Math.max(0, box.y - padding);
    return { x, y, width: Math.min(width, box.x + box.width + padding) - x,
      height: Math.min(height, box.y + box.height + padding) - y };
  });
}
