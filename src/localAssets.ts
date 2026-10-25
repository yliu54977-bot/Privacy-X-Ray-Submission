/** Use the document URL: custom desktop schemes have no origin in some URL implementations. */
export function localAssetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, location.href || `${location.origin}/`).href;
}

export function isDesktop(): boolean {
  return location.protocol === 'privacy-xray:';
}
