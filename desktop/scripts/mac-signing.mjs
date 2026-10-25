/** @param {string} target @param {string} host */
export function requireNativeMac(target, host) {
  if (target === 'darwin' && host !== 'darwin')
    throw new Error('Mac packages must be built and signature-verified on macOS. Use the desktop macOS workflow or a Mac; unsigned cross-builds are not deliverables.');
}

/** Test signing is deliberately distinguished from Developer ID signing.
 * @param {string | undefined} identity
 * @returns {Exclude<NonNullable<import('@electron/packager').Options['osxSign']>, boolean>}
 */
export function macSigningOptions(identity) {
  const developerId = Boolean(identity && identity !== '-');
  return {
    identity: developerId ? identity : '-',
    // '-' is an ad-hoc signature, not a certificate name to look up in the keychain.
    identityValidation: developerId,
    optionsForFile: () => ({
      hardenedRuntime: developerId,
      entitlements: ['com.apple.security.cs.allow-jit'],
      ...(developerId ? {} : { timestamp: 'none' }),
    }),
  };
}
