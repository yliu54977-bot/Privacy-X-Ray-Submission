import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import {
  mkdir,
  rm,
  copyFile,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const tesseract = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(
  require.resolve("tesseract.js-core/package.json", { paths: [tesseract] }),
);
const language = dirname(
  require.resolve("@tesseract.js-data/eng/package.json"),
);
const chineseLanguage = dirname(
  require.resolve("@tesseract.js-data/chi_sim/package.json"),
);
const destination = resolve("public/ocr");
await mkdir(`${destination}/core`, { recursive: true });
await copyFile(
  `${tesseract}/dist/worker.min.js`,
  `${destination}/worker.min.js`,
);
for (const file of await readdir(core))
  if (/^tesseract-core.*\.wasm(?:\.js)?$/.test(file))
    await copyFile(`${core}/${file}`, `${destination}/core/${file}`);
await copyFile(
  `${language}/4.0.0/eng.traineddata.gz`,
  `${destination}/eng.traineddata.gz`,
);
await copyFile(
  `${chineseLanguage}/4.0.0/chi_sim.traineddata.gz`,
  `${destination}/chi_sim.traineddata.gz`,
);
// Retain upstream notices alongside the redistributed OCR runtimes.
await mkdir(`${destination}/licenses`, { recursive: true });
await copyFile(`${tesseract}/LICENSE.md`, `${destination}/licenses/TESSERACT-JS-LICENSE.md`);
await copyFile(`${core}/LICENSE`, `${destination}/licenses/TESSERACT-CORE-LICENSE`);
const notices = (await readFile(resolve('THIRD_PARTY_NOTICES.md'), 'utf8'))
  .replaceAll('](assets/', '](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/blob/main/assets/')
  .replaceAll('](tests/', '](https://github.com/yliu54977-bot/Privacy-X-Ray-Submission/blob/main/tests/');
await writeFile(`${destination}/licenses/THIRD_PARTY_NOTICES.md`, notices);
const checksum = createHash("sha256")
  .update(await readFile(`${destination}/eng.traineddata.gz`))
  .digest("hex");
await writeFile(
  `${destination}/manifest.json`,
  JSON.stringify(
    {
      workerVersion: JSON.parse(await readFile(`${tesseract}/package.json`))
        .version,
      coreVersion: JSON.parse(await readFile(`${core}/package.json`)).version,
      languagePackage: "@tesseract.js-data/eng@1.0.0",
      languageVariant: "4.0.0",
      sha256: checksum,
      chineseLanguagePackage: "@tesseract.js-data/chi_sim@1.0.0",
      chineseSha256: createHash("sha256")
        .update(await readFile(`${destination}/chi_sim.traineddata.gz`))
        .digest("hex"),
    },
    null,
    2,
  ),
);
console.log("Prepared pinned same-origin OCR assets.");

// Pinned browser-local visual and PDF runtimes. No uploaded data is used here.
const visionRoot = dirname(require.resolve('@mediapipe/tasks-vision'));
const pdfRoot = dirname(dirname(require.resolve('pdfjs-dist')));
const visionDestination = resolve('public/vision');
const pdfDestination = resolve('public/pdf');
await rm(visionDestination, { recursive: true, force: true });
await rm(pdfDestination, { recursive: true, force: true });
await mkdir(`${visionDestination}/wasm`, { recursive: true });
await mkdir(pdfDestination, { recursive: true });
for (const file of await readdir(`${visionRoot}/wasm`))
  if (/\.(?:wasm|js)$/.test(file)) await copyFile(`${visionRoot}/wasm/${file}`, `${visionDestination}/wasm/${file}`);
const modelPath = resolve('assets/models/blaze_face_short_range.tflite');
const modelHash = createHash('sha256').update(await readFile(modelPath)).digest('hex');
if (modelHash !== 'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f')
  throw new Error('Pinned face model checksum does not match.');
await copyFile(modelPath, `${visionDestination}/blaze_face_short_range.tflite`);
await copyFile(resolve('assets/models/MEDIAPIPE-LICENSE'), `${visionDestination}/LICENSE`);
await copyFile(`${pdfRoot}/LICENSE`, `${pdfDestination}/LICENSE`);
await copyFile(`${pdfRoot}/legacy/build/pdf.worker.min.mjs`, `${pdfDestination}/pdf.worker.min.mjs`);
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  await mkdir(`${pdfDestination}/${folder}`, { recursive: true });
  for (const file of await readdir(`${pdfRoot}/${folder}`))
    await copyFile(`${pdfRoot}/${folder}/${file}`, `${pdfDestination}/${folder}/${file}`);
}
await writeFile(`${visionDestination}/manifest.json`, JSON.stringify({ package: '@mediapipe/tasks-vision@0.10.32',
  model: 'BlazeFace short range float16 version 1', sha256: modelHash,
  source: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite' }, null, 2));
console.log('Prepared pinned same-origin face and PDF assets.');
