import type { OcrWord } from '../../types';

/** Temporary reading-space box. The stored word box always remains in source pixels. */
export function readingBox(word: OcrWord, angle = 0) {
  if (!angle) return word.box;
  const radians = angle * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  const { x, y, width, height } = word.box;
  const corners = [[x, y], [x + width, y], [x, y + height], [x + width, y + height]]
    .map(([px, py]) => ({ x: px! * c - py! * s, y: px! * s + py! * c }));
  const left = Math.min(...corners.map(point => point.x));
  const top = Math.min(...corners.map(point => point.y));
  return { x: left, y: top, width: Math.max(...corners.map(point => point.x)) - left,
    height: Math.max(...corners.map(point => point.y)) - top };
}
