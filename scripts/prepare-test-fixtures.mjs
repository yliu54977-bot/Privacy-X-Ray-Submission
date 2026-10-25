import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Developer test setup only. The application never calls this downloader.
const source = 'https://storage.googleapis.com/mediapipe-assets/portrait.jpg';
const expected = 'a6f11efaa834706db23f275b6115058fa87fc7f14362681e6abe14e82749de3e';
const destination = new URL('../tests/fixtures/public-face-portrait.jpg', import.meta.url);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
let existing;
try { existing = await readFile(destination); } catch { /* Fetch the optional test fixture below. */ }
if (!existing || sha256(existing) !== expected) {
  const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error('Public face test fixture could not be downloaded.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 5_000_000 || sha256(bytes) !== expected)
    throw new Error('Public face test fixture checksum does not match.');
  await mkdir(new URL('../tests/fixtures/', import.meta.url), { recursive: true });
  await writeFile(destination, bytes);
}
console.log('Prepared checksum-verified public face test fixture.');
