import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { isAppUrl, RESPONSE_HEADERS } from './policy.mjs';

/** @typedef {{version: number, files: Record<string, {bytes: number, sha256: string}>}} AssetManifest */
/** @type {Record<string, string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.gz': 'application/gzip',
};
/** @param {import('node:crypto').BinaryLike} bytes */
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** @param {string} value */
export function assetKey(value) {
  if (!isAppUrl(value)) return null;
  try {
    const pathname = decodeURIComponent(new URL(value).pathname);
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p => p === '..' || p === '.')) return null;
    const key = pathname === '/' ? 'index.html' : pathname.slice(1);
    return key && !key.startsWith('/') ? key : null;
  } catch { return null; }
}

/** Only the build's enumerated assets can be read. No directory browsing or file:// access.
 * @param {string} root
 * @param {AssetManifest} manifest
 */
export async function createAssetHandler(root, manifest) {
  const canonicalRoot = await realpath(root);
  /** @type {Map<string, string>} */
  const entries = new Map();
  for (const [key, entry] of Object.entries(manifest.files)) {
    if (assetKey(`privacy-xray://app/${key}`) !== key) throw new Error('Invalid bundled asset path.');
    const file = await realpath(resolve(canonicalRoot, key));
    if (!file.startsWith(`${canonicalRoot}${sep}`)) throw new Error('Asset escapes bundle.');
    const info = await stat(file);
    if (!info.isFile() || info.size !== entry.bytes || sha256(await readFile(file)) !== entry.sha256)
      throw new Error('Bundled asset integrity check failed. Reinstall the application.');
    entries.set(key, file);
  }
  if (!entries.has('index.html')) throw new Error('Missing application entry point.');
  /** @param {{url: string, method: string}} request */
  return async request => {
    const headers = { ...RESPONSE_HEADERS };
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
    const key = assetKey(request.url);
    const file = key ? entries.get(key) : undefined;
    if (!key || !file) return new Response(null, { status: 404, headers });
    try {
      const data = await readFile(file);
      return new Response(request.method === 'HEAD' ? null : data, {
        status: 200,
        headers: { ...headers, 'Content-Type': MIME[extname(key)] || 'application/octet-stream', 'Content-Length': String(data.length) },
      });
    } catch { return new Response(null, { status: 500, headers }); }
  };
}
