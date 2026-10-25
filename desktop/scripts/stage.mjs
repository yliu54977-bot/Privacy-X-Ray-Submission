import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAssetHandler, sha256 } from '../runtime/assets.mjs';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(desktop, '..');
const stage = join(desktop, 'stage');
const output = join(root, 'dist-desktop');
// Fail before touching the previous stage if the web build is incomplete.
for (const file of ['index.html', 'ocr/worker.min.js', 'ocr/eng.traineddata.gz',
  'ocr/chi_sim.traineddata.gz', 'vision/blaze_face_short_range.tflite',
  'pdf/pdf.worker.min.mjs'])
  await readFile(join(output, file));
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp(join(desktop, 'runtime'), join(stage, 'runtime'), { recursive: true });
await cp(output, join(stage, 'web'), { recursive: true });
await rm(join(stage, 'web/vercel.json'), { force: true });
const project = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await writeFile(join(stage, 'package.json'), JSON.stringify({
  name: 'privacy-x-ray-desktop', productName: 'Privacy X-Ray', version: project.version,
  private: true, type: 'module', main: 'runtime/main.mjs',
  description: 'Offline image and PDF privacy redaction. All models are bundled.',
}, null, 2));

await cp(join(root, 'LICENSE'), join(stage, 'LICENSE'));
await cp(join(root, 'THIRD_PARTY_NOTICES.md'), join(stage, 'THIRD_PARTY_NOTICES.md'));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
await writeFile(join(stage, 'build-info.json'), JSON.stringify({ repository: 'https://github.com/yliu54977-bot/Privacy-X-Ray-Submission', sourceCommit, version: project.version }, null, 2));

const notices = ['Privacy X-Ray third-party notices', 'See also the runtime LICENSE and LICENSES.chromium.html next to the application.', ''];
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path || info.dev) continue;
  const directory = join(root, path);
  let pkg;
  try { pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')); } catch { continue; }
  notices.push(`\n===== ${pkg.name}@${pkg.version} (${pkg.license || 'See included license'}) =====`);
  for (const name of await readdir(directory)) {
    if (/^(licen[sc]e|notice|copyright)(\.|$)/i.test(name)) {
      try { notices.push(`--- ${name} ---\n${await readFile(join(directory, name), 'utf8')}`); } catch { /* Some packages use a directory. */ }
    }
  }
}
await writeFile(join(stage, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n'));

/** @type {Record<string, {bytes: number, sha256: string}>} */
const files = {};
/** @param {string} directory */
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await inventory(file);
    else if (entry.isFile()) {
      const bytes = await readFile(file);
      files[relative(join(stage, 'web'), file).split('\\').join('/')] = { bytes: bytes.length, sha256: sha256(bytes) };
    } else throw new Error('Desktop assets must not contain symlinks.');
  }
}
await inventory(join(stage, 'web'));
const paths = Object.keys(files);
/** @type {((path: string) => boolean)[]} */
const groups = [p => /^vision\/wasm\/.*\.wasm$/.test(p),
  p => /^ocr\/core\/.*\.wasm$/.test(p), p => /^pdf\/standard_fonts\//.test(p), p => /^pdf\/cmaps\//.test(p)];
for (const predicate of groups)
  if (!paths.some(predicate)) throw new Error('An offline runtime asset group is missing.');
const manifest = { version: 1, files };
await writeFile(join(stage, 'asset-manifest.json'), JSON.stringify(manifest, null, 2));
await createAssetHandler(join(stage, 'web'), manifest);
console.log(`Staged ${paths.length} verified offline assets (${Object.values(files).reduce((sum, f) => sum + f.bytes, 0)} bytes).`);
