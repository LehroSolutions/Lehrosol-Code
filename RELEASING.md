# Releasing Lehrosol Code

This repository ships a Windows installer through GitHub Releases. It is marked
private in package.json to prevent accidental npm publication. The paired npm
package is `@lehrosolutions/cli`, maintained in the sibling repository.

## Validate a release candidate

Use the pinned pnpm version from package.json and Node >=22.13:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm dist
```

The installer is written to `dist/`. Install and launch it in a disposable Windows
environment, pair it with the intended CLI version, and verify project selection,
engine startup, and a dry-run mission before promoting a release.

## GitHub workflow

A manual run of `.github/workflows/release.yml` tests and builds the installer,
generates SHA256SUMS, and uploads a `windows-installer` artifact for review.
It does not publish a GitHub Release.

For a new version, update package.json and CHANGELOG.md, commit and push, then
create a new matching `v<version>` tag. Never move existing release tags. The
tagged workflow creates a draft GitHub Release with the installer and checksums.
Review the draft, confirm the installer smoke test, and publish the release.

## Signing

Configure CSC_LINK and CSC_KEY_PASSWORD as repository secrets to enable the
existing electron-builder signing integration. Never commit a signing key.
Without signing credentials, the installer is unsigned and Windows may warn.
Verify Authenticode on the produced executable before claiming a signed release.
SHA256SUMS verifies bytes, not publisher identity.
