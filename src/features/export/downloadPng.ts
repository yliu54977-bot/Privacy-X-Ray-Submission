const pendingDownloads = new Map<string, number>();

/** Drop this page's temporary download URLs; saved files are not affected. */
export function revokePendingDownloads(): void {
  for (const [url, timer] of pendingDownloads) {
    window.clearTimeout(timer);
    URL.revokeObjectURL(url);
  }
  pendingDownloads.clear();
}

/** Start a local download. The caller must require a reviewed, current preview first. */
export function downloadPng(blob: Blob, filename = 'redacted.png'): void {
  if (blob.type !== 'image/png' || blob.size === 0) throw new Error('A valid PNG preview is required.');
  // Avoid source-derived names containing private information or path separators.
  const safeName = filename.replace(/[\\/\x00-\x1f\x7f]/g, '_');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeName.toLowerCase().endsWith('.png') ? safeName : `${safeName || 'redacted'}.png`;
  try {
    document.body.append(anchor);
    anchor.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    anchor.remove();
  }
  // Allow the browser to consume the URL before releasing it, including slow downloads.
  const timer = window.setTimeout(() => {
    URL.revokeObjectURL(url);
    pendingDownloads.delete(url);
  }, 60_000);
  pendingDownloads.set(url, timer);
}
