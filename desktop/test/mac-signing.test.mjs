import test from 'node:test';
import assert from 'node:assert/strict';
import { macSigningOptions, requireNativeMac } from '../scripts/mac-signing.mjs';

test('Mac delivery fails before packaging on a non-Mac host', () => {
  assert.throws(() => requireNativeMac('darwin', 'linux'), /must be built/);
  assert.throws(() => requireNativeMac('darwin', 'win32'), /must be built/);
  assert.doesNotThrow(() => requireNativeMac('darwin', 'darwin'));
  assert.doesNotThrow(() => requireNativeMac('win32', 'linux'));
});

test('ad-hoc signing does not search for a nonexistent keychain certificate or request a timestamp', () => {
  for (const identity of [undefined, '-']) {
    const options = macSigningOptions(identity);
    assert.equal(options.identity, '-');
    assert.equal(options.identityValidation, false);
    assert.deepEqual(options.optionsForFile('app'), {
      hardenedRuntime: false, entitlements: ['com.apple.security.cs.allow-jit'], timestamp: 'none',
    });
  }
});

test('Developer ID signing keeps certificate validation and hardened runtime enabled', () => {
  const options = macSigningOptions('Developer ID Application: Test identity');
  assert.equal(options.identityValidation, true);
  assert.equal(options.optionsForFile('app').hardenedRuntime, true);
  assert.deepEqual(options.optionsForFile('app').entitlements, ['com.apple.security.cs.allow-jit']);
  assert.equal(options.optionsForFile('app').timestamp, undefined);
});
