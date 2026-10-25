import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectFile } from './check-publication.mjs';
const inspect = (path, text, mode) => inspectFile(path, Buffer.from(text), mode);

test('blocks private datasets, credentials and unreviewed media even when text-like', () => {
  for (const path of ['training/labels.json', 'tests/datasets/people.json', '.env', '.env.local',
    'docs/real-card.png', 'public/new-sample.jpg', 'src/data/people.json', 'docs/results.csv', 'docs/raw.zip'])
    assert.ok(inspect(path, '{}').length, path);
});
test('blocks changes to an approved asset and disguised binaries', () => {
  assert.ok(inspect('public/samples/tuition-payment.png', 'replacement').length);
  assert.ok(inspectFile('docs/notes.md', Buffer.from([255, 0, 128])).length);
  assert.ok(inspect('src/link.ts', 'target', '120000').length);
});
test('allows ordinary source and documentation', () => {
  assert.deepEqual(inspect('src/example.ts', 'export const n = 1;'), []);
  assert.deepEqual(inspect('docs/notes.md', 'Use fictional test fixtures.'), []);
});
test('reports credential locations without printing values', () => {
  const credential = 'gh' + 'p_' + 'A'.repeat(36);
  const issues = inspect('src/config.ts', `const token = '${credential}';`);
  assert.ok(issues.some(x => x.includes('GitHub token')));
  assert.ok(issues.every(x => !x.includes(credential)));
});
test('synthetic exceptions are limited to exact content and path', () => {
  const fixture = 'gh' + 'p_' + '012345678901234567890123456789012345';
  assert.deepEqual(inspect('src/v2/detection/documentPatterns.test.ts', fixture), []);
  assert.ok(inspect('src/config.ts', fixture).length);
  assert.ok(inspect('src/v2/detection/documentPatterns.test.ts', 'gh' + 'p_' + 'A'.repeat(36)).length);
  const pem = '-----BEGIN PRIVATE' + ' KEY-----\n' + 'A'.repeat(80) + '\n-----END PRIVATE' + ' KEY-----';
  assert.ok(inspect('src/v2/detection/documentPatterns.test.ts', pem).some(x => x.includes('private key body')));
});
test('CLI inspects staged bytes rather than a cleaned working copy', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'publication-check-'));
  const script = fileURLToPath(new URL('./check-publication.mjs', import.meta.url));
  try {
    execFileSync('git', ['init', '-q'], { cwd });
    writeFileSync(join(cwd, 'README.md'), 'gh' + 'p_' + 'A'.repeat(36));
    execFileSync('git', ['add', 'README.md'], { cwd });
    writeFileSync(join(cwd, 'README.md'), 'Safe working copy');
    assert.throws(() => execFileSync(process.execPath, [script], { cwd, stdio: 'pipe' }));
    execFileSync('git', ['add', 'README.md'], { cwd });
    assert.match(execFileSync(process.execPath, [script], { cwd, encoding: 'utf8' }), /passed/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('allows reviewed desktop source while excluding generated bundles and extra files', () => {
  assert.deepEqual(inspect('desktop/runtime/main.mjs', 'export {};'), []);
  for (const path of ['desktop/stage/package.json', 'desktop/releases/build.zip', 'desktop/new.json', 'dist-desktop/index.html'])
    assert.ok(inspect(path, '{}').length, path);
});
