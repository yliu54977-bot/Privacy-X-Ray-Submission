import { packager } from '@electron/packager';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { macSigningOptions, requireNativeMac } from './mac-signing.mjs';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [platform = process.platform, arch = process.arch] = process.argv.slice(2);
if (!['darwin', 'win32', 'linux'].includes(platform) || !['arm64', 'x64'].includes(arch))
  throw new Error('Usage: npm run desktop:package -- [darwin|win32|linux] [arm64|x64]');
requireNativeMac(platform, process.platform);
const tools = JSON.parse(await readFile(join(desktop, 'package.json'), 'utf8'));
const project = JSON.parse(await readFile(join(desktop, 'stage/package.json'), 'utf8'));
const output = join(desktop, 'releases');
await mkdir(output, { recursive: true });
const signingIdentity = process.env.PRIVACY_XRAY_MAC_SIGN_IDENTITY;
const apps = await packager({
  dir: join(desktop, 'stage'), out: output, name: 'Privacy X-Ray',
  platform: /** @type {import('@electron/packager').Options['platform']} */ (platform),
  arch: /** @type {import('@electron/packager').Options['arch']} */ (arch),
  electronVersion: tools.devDependencies.electron,
  appVersion: project.version, appBundleId: 'app.privacyxray.desktop',
  win32metadata: { CompanyName: 'Privacy X-Ray', ProductName: 'Privacy X-Ray' },
  appCategoryType: 'public.app-category.productivity',
  asar: true, overwrite: true, prune: false,
  // Ad-hoc builds are for development; downloading them does not satisfy Gatekeeper.
  ...(platform === 'darwin'
    ? { osxSign: macSigningOptions(signingIdentity) }
    : {}),
});
for (const folder of apps) {
  if (platform === 'darwin') {
    const checked = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', join(folder, 'Privacy X-Ray.app')], { stdio: 'inherit' });
    if (checked.error || checked.status !== 0) throw new Error('Mac code signature verification failed; no archive will be delivered.');
  }
  await copyFile(join(desktop, 'README.md'), join(folder, 'READ-ME-FIRST.md'));
  const label = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' }[platform];
  const status = platform === 'darwin' ? (signingIdentity && signingIdentity !== '-' ? 'developer-id-unnotarized' : 'adhoc-test') : 'test';
  const filename = `Privacy-X-Ray-${project.version}-${label}-${arch}-${status}.zip`;
  const archive = join(output, filename);
  await rm(archive, { force: true });
  // Preserve .app framework symlinks and executable bits. Do not use a generic file-only zipper on macOS.
  let command, args;
  if (process.platform === 'darwin') { command = 'ditto'; args = ['-c', '-k', '--sequesterRsrc', '--keepParent', folder, archive]; }
  else if (process.platform === 'win32') {
    command = 'powershell.exe';
    // Paths are passed through environment variables, never interpolated as PowerShell code.
    args = ['-NoProfile', '-NonInteractive', '-Command', 'Compress-Archive -LiteralPath $env:PRIVACY_XRAY_ARCHIVE_SOURCE -DestinationPath $env:PRIVACY_XRAY_ARCHIVE_DESTINATION -Force'];
  } else { command = 'zip'; args = ['-q', '-r', '-y', archive, basename(folder)]; }
  const result = spawnSync(command, args, { cwd: output, stdio: 'inherit', env: { ...process.env,
    PRIVACY_XRAY_ARCHIVE_SOURCE: folder, PRIVACY_XRAY_ARCHIVE_DESTINATION: archive } });
  if (result.error || result.status !== 0) throw new Error(`Archiving failed: ${result.error || result.status}`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(archive)) hash.update(chunk);
  await writeFile(`${archive}.sha256`, `${hash.digest('hex')}  ${filename}\n`);
  console.log(`Created ${archive}`);
}
