export const APP_URL = 'privacy-xray://app/';
export const APP_SCHEME = 'privacy-xray';

export const CSP = [
  "default-src 'none'", "base-uri 'none'", "object-src 'none'",
  "frame-src 'none'", "frame-ancestors 'none'", "form-action 'none'",
  "script-src 'self' 'wasm-unsafe-eval'", "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: data:",
  "font-src 'self'", "connect-src 'self' blob:", "worker-src 'self' blob:",
].join('; ');

export const RESPONSE_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), display-capture=(), payment=(), usb=(), serial=(), midi=()',
};

export const WINDOW_SECURITY = Object.freeze({
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  navigateOnDragDrop: false,
  devTools: false,
  spellcheck: false,
  safeDialogs: true,
});

/** @param {string} value */
export function isAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === `${APP_SCHEME}:` && url.hostname === 'app'
      && !url.port && !url.username && !url.password;
  } catch { return false; }
}

/** @param {string} value */
export function allowRequest(value) {
  return isAppUrl(value) || value.startsWith(`blob:${APP_URL}`) || value.startsWith('data:');
}

/** @param {string} value */
export function allowNavigation(value) {
  if (!isAppUrl(value)) return false;
  const url = new URL(value);
  return (url.pathname === '/' || url.pathname === '/index.html') && !url.search;
}

/** @param {string} value @param {string} mime */
export function allowDownload(value, mime) {
  return value.startsWith(`blob:${APP_URL}`) && mime === 'image/png';
}

/** Apply before creating windows; neither user consent nor a popup can enable networking.
 * @param {import('electron').Session} ses
 */
export function lockSession(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    callback({ cancel: !allowRequest(details.url) });
  });
  ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.setDevicePermissionHandler(() => false);
  ses.setDisplayMediaRequestHandler((_request, callback) => callback({}));
}
