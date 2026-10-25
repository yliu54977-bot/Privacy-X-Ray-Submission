# Security and publication boundaries

Privacy X-Ray processes selected files locally in the browser. This repository is public: source, commit history, issues, pull requests, Actions logs and uploaded artifacts must all be treated as public material. Local recognition is not a guarantee that developer test inputs remain private if they are committed or uploaded by CI.

## What belongs here

Keep application source, dependency lockfiles, licenses, build scripts, public product documentation and synthetic regression tests. Only reviewed sample images and checksum-pinned upstream models belong in the public asset set. The publication inventory and current assessment are in [docs/publication-review.md](docs/publication-review.md).

Keep real user uploads, identity documents, personal screenshots, training/fine-tuning datasets, raw OCR exports, private model checkpoints, credentials, environment files, internal learner profiles and unpublished research material outside this repository. Prefer a separate private workspace over an ignored folder inside the public checkout. Never use real user data in public CI, even temporarily.

## Before pushing

Stage only the intended files, inspect `git diff --cached`, and run:

```sh
node --test scripts/check-publication.test.mjs
node scripts/check-publication.mjs
```

The check reads staged Git blobs, rejects private-data paths, unreviewed file types and binaries, checks approved assets by SHA-256, and detects several common credential formats without printing matched values. Synthetic credential exceptions are limited to exact test strings in a specific file. New or changed media requires manual pixel, metadata, decoded-code and provenance review before its checksum can be approved.

This is a limited tripwire, not a comprehensive secret scanner or personal-data classifier. It checks the index, not past history, remote artifacts, arbitrary sensitive prose, obfuscated secrets or every possible token format. A public CI failure happens **after the commit has been uploaded**; run the local check before pushing. CI and `.gitignore` cannot prevent a collaborator from publishing secrets or changing the checks themselves.

The workflow has read-only repository permissions, uses pinned Action commits, does not retain checkout credentials, and no longer uploads screenshots or traces. CI logs remain public, and test titles/assertions can expose inputs. Use fictional inputs only.

## Repository-owner controls

The owner should protect `main` with required pull requests, review and a passing `validate` check; block force pushes and deletion, and review bypass permissions. Enable and verify available GitHub secret scanning/push protection and dependency alerts. Restrict Actions permissions to the minimum needed. These administration settings are separate from files in this repository and cannot be enabled by a collaborator with write-only access.

Review and remove unnecessary older Actions artifacts separately: removing the upload step does not delete previous uploads. Neither rewriting Git history nor deleting an artifact can retract copies already downloaded by others.

## Runtime limits

The web edition loads application/model resources over the network. `vercel.json` sets a same-origin CSP and response headers; `npm run build` also places that configuration in the static output. Verify the actual deployment before relying on these headers.

The desktop edition bundles those resources and serves only manifest-listed, SHA-256-checked assets under `privacy-xray://app/`. Its non-persistent session denies remote and arbitrary file requests, navigation, popups and device permissions. The renderer is sandboxed, has context isolation enabled and has no Node integration or preload/IPC bridge. Asset checks detect corruption; a malicious replacement of both application and manifest is outside this protection. Ad-hoc Mac signatures and unsigned Windows packages do not provide a trusted publisher identity. OS swap, diagnostics and other software remain outside application controls.

The desktop build workflow retains read-only repository permissions and uploads only packages, checksums and source provenance, never raw fixtures, screenshots or traces. Its publication gate approves specific desktop source paths, not the whole `desktop/` directory.

OCR, image and PDF parsing can consume significant resources and can miss sensitive content. File limits reduce exposure but do not prove resistance to every malformed file. Redaction protects only covered pixels. Clearing UI state is not secure memory erasure, and saved copies remain on disk.

## Reporting an issue

Do not put credentials, personal files or exploit data containing private information in a public issue or pull request. Contact the repository owner privately, or use GitHub private vulnerability reporting if it has been enabled. Include only a minimal synthetic reproduction in public discussions.

If credentials are accidentally published, revoke/rotate them first. Stop further publication, identify affected commits/artifacts/logs, and coordinate history cleanup with the owner. Deleting the current file or adding it to `.gitignore` does not remove earlier copies.

References: [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use), [removing sensitive data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).
