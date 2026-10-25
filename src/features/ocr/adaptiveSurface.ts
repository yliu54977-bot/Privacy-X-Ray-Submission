/** Local-mean thresholding for a weak OCR fallback only. Handles a paper/background
 * boundary without treating the whole page as one dark object. Does not change source pixels. */
export function adaptiveTextSurface(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = source;
  if (width * height > 6_000_000) throw new Error('OCR preprocessing exceeds its pixel budget.');
  const pixels = source.getContext('2d')!.getImageData(0, 0, width, height);
  const stride = width + 1;
  // 6 MP * 255 fits Uint32. One integral array; no full-size variance array.
  const sums = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      row += Math.round(.2126 * pixels.data[at]! + .7152 * pixels.data[at + 1]! + .0722 * pixels.data[at + 2]!);
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1]! + row;
    }
  }
  const radius = Math.max(8, Math.min(64, Math.round(Math.min(width, height) / 80)));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const left = Math.max(0, x - radius), right = Math.min(width, x + radius + 1);
    const top = Math.max(0, y - radius), bottom = Math.min(height, y + radius + 1);
    const mean = (sums[bottom * stride + right]! - sums[top * stride + right]! -
      sums[bottom * stride + left]! + sums[top * stride + left]!) / ((right - left) * (bottom - top));
    const at = (y * width + x) * 4;
    const gray = .2126 * pixels.data[at]! + .7152 * pixels.data[at + 1]! + .0722 * pixels.data[at + 2]!;
    pixels.data[at] = pixels.data[at + 1] = pixels.data[at + 2] = gray < mean - 12 ? 0 : 255;
    pixels.data[at + 3] = 255;
  }
  const output = document.createElement('canvas'); output.width = width; output.height = height;
  output.getContext('2d')!.putImageData(pixels, 0, 0);
  return output;
}
