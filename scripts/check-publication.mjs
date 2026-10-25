import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { pathToFileURL } from 'node:url';

// This is a publication tripwire, not a complete PII/secret scanner.
// Read the Git index, so ignored local files and unstaged edits cannot hide a staged leak.
const approvedAssets = {
  'assets/models/face-cpu/model.json': 'c131145fade749f714d39811f282e973760a69cb9e1a9c22f91e132bd8dcd396',
  'assets/models/face-cpu/group1-shard1of1.bin': 'e9b69ee1c1f8cd33c58120bcd75bf8c56bfba20c880f447e9d293ec102059d4b',
  'assets/models/blaze_face_short_range.tflite': 'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f',
  'public/samples/order-inquiry.png': '789f04629413aa106739749be70c699aa4ab5b4cdfdade108d18481c2796ad44',
  'public/samples/tuition-payment.png': '3da2d6288e1d8f4db0b3ca258b8bb8b6d8da8d78075961037f0d83a26fd87132',
  'tests/fixtures/fictional-qr-api-key.png': 'e976126d9cbaa63859f7d8974ab70ba498364936d56d85508d842e1c74d8f9e2',
  'tests/fixtures/fictional-qr-email.png': '985779ebf1fd948836c2d30c22b441cb96570890b1a62715bcd2c095643eeafc',
  'tests/fixtures/fictional-qr-unknown.png': '1095dab08e7345c999004012ce79c07e2d79b1a23f19939ce4e0600ca9958353',
};
const roots = new Set(['src', 'tests', 'scripts', 'assets', 'public', 'docs', 'devpost', '.github']);
const desktopFiles = new Set(["desktop/package.json", "desktop/package-lock.json", "desktop/tsconfig.json", "desktop/README.md", "desktop/runtime/policy.mjs", "desktop/runtime/assets.mjs", "desktop/runtime/main.mjs", "desktop/scripts/package.mjs", "desktop/scripts/stage.mjs", "desktop/scripts/mac-signing.mjs", "desktop/test/security.test.mjs", "desktop/test/mac-signing.test.mjs", "desktop/test/smoke.mjs"]);
const rootFiles = new Set(['.gitignore', 'LICENSE', 'README.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md',
  'package.json', 'package-lock.json', 'index.html', 'universal.html', 'tsconfig.json',
  'vite.config.ts', 'playwright.config.ts', 'playwright.production.config.ts', 'playwright.headless.config.ts', 'vercel.json']);
const privateSegments = /(^|\/)(?:uploads?|private|personal|data|datasets?|training|train|fine[-_]?tuning|checkpoints?|runs|wandb|logs?|node_modules|dist(?:-desktop)?|stage|releases|coverage|test-results|playwright-report)(\/|$)/i;
const textExtension = /\.(?:md|txt|ts|tsx|js|mjs|css|html|json|ya?ml|swift)$/i;
const secretPatterns = [
  ['GitHub token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})/g],
  ['AWS access identifier', /(?:AKIA|ASIA)[A-Z0-9]{16}/g],
  ['Google API key', /AIza[A-Za-z0-9_-]{35}/g],
  ['API key', /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g],
  ['Slack token', /xox[baprs]-[A-Za-z0-9-]{15,}/g],
  ['JWT-like credential', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['private key material', new RegExp('-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE' + ' KEY-----', 'g')],
  ['private key body', new RegExp('-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE' + ' KEY-----\\s+[A-Za-z0-9+/=\\r\\n]{64,}-----END', 'g')],
];

function isKnownFixture(path, kind, value) {
  if (path !== 'src/v2/detection/documentPatterns.test.ts') return false;
  // Exact synthetic values only, never an entire test directory exemption.
  return (kind === 'GitHub token' && value === 'gh' + 'p_' + '012345678901234567890123456789012345') ||
    (kind === 'private key material' && value === '-----BEGIN PRIVATE' + ' KEY-----');
}

export function inspectFile(path, bytes, mode = '100644') {
  const issues = [];
  const name = path.split('/').at(-1);
  if (mode !== '100644' && mode !== '100755') return ['symlinks, submodules and unusual Git modes are not approved'];
  if (privateSegments.test(path) || /^\.env(?:\.|$)/i.test(name) ||
      /(?:learner-profile|credentials|id_rsa|id_ed25519|\.npmrc|\.netrc)/i.test(name))
    issues.push('private-data or credential path is not approved');
  if (path.startsWith('desktop/') ? !desktopFiles.has(path) : path.includes('/') ? !roots.has(path.split('/')[0]) : !rootFiles.has(path))
    issues.push('new top-level path requires publication review');
  if (Object.hasOwn(approvedAssets, path)) {
    if (createHash('sha256').update(bytes).digest('hex') !== approvedAssets[path])
      issues.push('reviewed asset changed: inspect pixels/payload/metadata before updating its checksum');
    return issues;
  }
  if (!textExtension.test(path) && !['LICENSE', '.gitignore', 'MEDIAPIPE-LICENSE'].includes(name))
    issues.push('unreviewed media, dataset, archive, model or file type');
  if (bytes.length > 512 * 1024) issues.push('large text file requires publication review');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return [...issues, 'unreviewed binary']; }
  if (text.includes('\0')) issues.push('binary content in a text file');
  for (const [kind, regex] of secretPatterns) {
    for (const match of text.matchAll(regex)) {
      if (!isKnownFixture(path, kind, match[0])) {
        const line = text.slice(0, match.index).split('\n').length;
        issues.push(`${kind} at line ${line}; matched value withheld`);
      }
    }
  }
  return issues;
}

export function checkIndex() {
  const entries = execFileSync('git', ['ls-files', '--stage', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  let failures = 0;
  for (const entry of entries) {
    const separator = entry.indexOf('\t');
    const [mode, sha, stage] = entry.slice(0, separator).split(' ');
    const path = entry.slice(separator + 1);
    const issues = stage !== '0' ? ['unmerged index entry'] :
      inspectFile(path, execFileSync('git', ['cat-file', 'blob', sha], { maxBuffer: 32 * 1024 * 1024 }), mode);
    if (issues.length) {
      failures += issues.length;
      for (const issue of issues) console.error(`${JSON.stringify(path)}: ${issue}`);
    }
  }
  if (failures) throw new Error(`Publication check failed: ${failures} issue(s). No matched credential values were printed.`);
  console.log(`Publication tripwire passed for ${entries.length} staged files. Human content/provenance review is still required.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { checkIndex(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
