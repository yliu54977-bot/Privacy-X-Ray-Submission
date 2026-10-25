import type { LocalImage } from "../../types";
export const MAX_PIXELS = 16_000_000;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export function validateDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_PIXELS
  )
    throw new Error("Choose an image with no more than 16 million pixels.");
}
export async function loadImage(file: File): Promise<LocalImage> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error("Choose PNG, JPG, WebP or a PDF page. HEIC, GIF, Office files and other formats need conversion first.");
  if (file.size > MAX_FILE_BYTES)
    throw new Error("Choose an image smaller than 20 MB.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png =
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
  const jpeg =
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (
    (file.type === 'image/webp' && !webp) ||
    (file.type === "image/png" && !png) ||
    (file.type === "image/jpeg" && !jpeg)
  )
    throw new Error("The file content must be a valid PNG, JPG or WebP image.");
  const previewUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = previewUrl;
    await img.decode();
    validateDimensions(img.naturalWidth, img.naturalHeight);
    if (file.type === 'image/webp') {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Image conversion is unavailable.');
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value =>
          value ? resolve(value) : reject(new Error('Image conversion failed.')), 'image/png'));
        URL.revokeObjectURL(previewUrl);
        return loadImage(new File([blob], 'converted-webp-frame.png', { type: 'image/png' }));
      } finally { canvas.width = canvas.height = 0; }
    }
    return {
      id: crypto.randomUUID(),
      file,
      previewUrl,
      width: img.naturalWidth,
      height: img.naturalHeight,
      mimeType: file.type as 'image/png' | 'image/jpeg',
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    if (error instanceof Error && error.message.startsWith("Choose"))
      throw error;
    throw new Error(
      "This image could not be decoded. Choose another PNG, JPG or WebP.",
    );
  }
}
