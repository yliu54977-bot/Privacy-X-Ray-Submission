import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APP_URL, CSP, WINDOW_SECURITY, allowDownload, allowNavigation, allowRequest, lockSession } from '../runtime/policy.mjs';
import { createAssetHandler, sha256 } from '../runtime/assets.mjs';

test('remote, loopback, websocket and arbitrary disk requests are denied by the installed session handler', () => {
  const handlers = {};
  const ses = { webRequest: { onBeforeRequest: (_filter, fn) => { handlers.request = fn; } } };
  for (const method of ['setPermissionRequestHandler', 'setPermissionCheckHandler', 'setDevicePermissionHandler', 'setDisplayMediaRequestHandler'])
    ses[method] = fn => { handlers[method] = fn; };
  lockSession(ses);
  for (const url of ['https://example.test/upload', 'http://127.0.0.1:8080/', 'https://app/', 'ws://example.test/',
    'wss://example.test/', 'file:///etc/passwd', 'ftp://example.test/', 'privacy-xray://app.evil/', 'privacy-xray://user@app/', 'privacy-xray://app:443/']) {
    let result;
    handlers.request({ url }, value => { result = value; });
    assert.equal(result.cancel, true, url);
  }
  for (const path of ['ocr/worker.min.js', 'vision/face-cpu/model.json', 'pdf/pdf.worker.min.mjs'])
    assert.equal(allowRequest(APP_URL + path), true);
  assert.equal(handlers.setPermissionCheckHandler(), false);
  assert.equal(handlers.setDevicePermissionHandler(), false);
  handlers.setPermissionRequestHandler(null, 'camera', result => assert.equal(result, false));
  handlers.setDisplayMediaRequestHandler({}, result => assert.deepEqual(result, {}));
});

test('only home navigation and locally generated PNG downloads are allowed', () => {
  assert.equal(allowNavigation(APP_URL), true);
  assert.equal(allowNavigation(`${APP_URL}index.html`), true);
  for (const value of ['https://example.test', 'file:///tmp/a.png', `${APP_URL}?review=advanced`, `${APP_URL}ocr/worker.min.js`])
    assert.equal(allowNavigation(value), false);
  assert.equal(allowDownload(`blob:${APP_URL}id`, 'image/png'), true);
  assert.equal(allowDownload('blob:https://example.test/id', 'image/png'), false);
  assert.equal(allowDownload(`blob:${APP_URL}id`, 'application/octet-stream'), false);
  assert.equal(WINDOW_SECURITY.sandbox, true);
  assert.equal(WINDOW_SECURITY.contextIsolation, true);
  assert.equal(WINDOW_SECURITY.nodeIntegration, false);
  assert.equal(WINDOW_SECURITY.webSecurity, true);
  assert.ok(!CSP.includes("'unsafe-eval'"));
  assert.ok(!CSP.includes('https:'));
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'privacy-xray-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const web = join(root, 'web'); await mkdir(web);
  const files = {};
  for (const [key, data] of [['index.html', '<h1>Offline</h1>'], ['worker.mjs', 'postMessage(1)'], ['reader.wasm', '\0asm']]) {
    await writeFile(join(web, key), data);
    files[key] = { bytes: Buffer.byteLength(data), sha256: sha256(data) };
  }
  return { root, web, manifest: { version: 1, files } };
}

test('real asset handler returns worker/WASM MIME types and CSP; never serves unlisted files or writes', async t => {
  const { web, manifest } = await fixture(t);
  await writeFile(join(web, 'secret.txt'), 'never expose');
  const handler = await createAssetHandler(web, manifest);
  const get = url => handler(new Request(url));
  const page = await get(APP_URL);
  assert.equal(await page.text(), '<h1>Offline</h1>');
  assert.equal(page.headers.get('content-security-policy'), CSP);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.match((await get(`${APP_URL}worker.mjs`)).headers.get('content-type'), /javascript/);
  assert.equal((await get(`${APP_URL}reader.wasm`)).headers.get('content-type'), 'application/wasm');
  for (const suffix of ['secret.txt', '%2e%2e%2fsecret.txt', '..%5csecret.txt', '%00index.html', '%ZZ'])
    assert.equal((await get(APP_URL + suffix)).status, 404);
  assert.equal((await get('privacy-xray://evil/index.html')).status, 404);
  assert.equal((await handler(new Request(APP_URL, { method: 'POST', body: 'private data' }))).status, 405);
  assert.equal(await (await handler(new Request(APP_URL, { method: 'HEAD' }))).text(), '');
});

test('startup fails closed for missing or modified model assets', async t => {
  const { web, manifest } = await fixture(t);
  await writeFile(join(web, 'reader.wasm'), 'bad!');
  await assert.rejects(createAssetHandler(web, manifest), /integrity/);
  await rm(join(web, 'reader.wasm'));
  await assert.rejects(createAssetHandler(web, manifest));
});

test('asset manifest cannot expose a symlink outside the application', async t => {
  const { root, web, manifest } = await fixture(t);
  await writeFile(join(root, 'secret'), 'secret');
  try { await symlink(join(root, 'secret'), join(web, 'linked')); }
  catch (error) { if (error.code === 'EPERM') return t.skip('OS does not allow test symlinks'); throw error; }
  manifest.files.linked = { bytes: 6, sha256: sha256('secret') };
  await assert.rejects(createAssetHandler(web, manifest), /escapes/);
});
