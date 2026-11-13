# Releasing Lehrosol Code

The desktop ships as a Windows x64 NSIS installer through
[GitHub Releases](https://github.com/LehroSolutions/Lehrosol-Code/releases).
`package.json` is private to prevent accidental npm publication. The paired
`@lehrosolutions/cli` package belongs to the sibling CLI repository.

Current startup release policy (13 November 2026): distribute an explicitly
**unsigned** installer. Paid signing is deferred until a suitable free option
is available. `NotSigned` is an accepted release status, not a blocker; failed
runtime, installation, integrity or update checks remain blockers. Keep the
unsigned disclosure and SHA256SUMS with each installer. This decision does not
waive the Windows 11 acceptance checks below.

## Prepare a candidate

Use Node.js 22.13.0+ and pnpm 11.15.1:

```powershell
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm smoke
pnpm dist
pnpm smoke --packaged
pnpm verify:installation
pnpm release:prepare
```

Read the scripts' output before accepting a candidate. Unit and workflow tests
prove their covered behaviors. The Electron smoke harness uses a temporary
profile, Lehro home, project, synthetic CLI, and synthetic engine to exercise the
actual desktop/IPC integration without modifying your real configuration. Run
it again with `--packaged` after building to exercise the unpacked application.
Its fixtures do not establish published CLI compatibility, model quality,
hardware fit, or a real GGUF server's startup reliability.

For a separately installed or extracted CLI, verify its actual contracts in an
isolated home and project:

```powershell
node scripts/verify-cli.cjs --cli 'C:\path\to\package\bin\lehrosol.js'
```

This records `dist/qa/cli-contract.json`. Its inference endpoint is synthetic;
real-model startup and output quality still need the acceptance checks below.
The live public update endpoint can be checked with `pnpm smoke --live-update`.

For a bounded real engine check, use an existing inference-model folder with a
GGUF smaller than 1 GiB:

```powershell
node scripts/verify-engine.cjs --cli 'C:\path\to\package\bin\lehrosol.js' --model-root 'D:\models\small-model'
```

This uses temporary CLI state, verifies authenticated startup/completion/stop,
and writes `dist/qa/engine-check.json`. It does not modify the model folder or
establish coding quality. Run heavier model/hardware acceptance separately.

Build output is written to `dist/`. Packaging uses the normalized filename
`Lehrosol.Code.Setup.<version>.exe`. Candidate preparation requires that filename
and produces `SHA256SUMS`, `release.json`, and
release notes from the changelog. It checks that bundled help is present in the
packaged application. Verify the packaged app and every release file, rather
than relying solely on a source-mode launch. Record the exact source revision,
Node/Electron/CLI versions, artifact hashes, signature status, and smoke results
with the candidate.

Candidate preparation inspects Authenticode and records the observed status
with the installer hash in `dist/qa/signature.json`, `release.json`, and the
generated release notes. Unsigned candidates are explicitly identified.

Preparation also requires successful source and packaged smoke receipts for
the current source fingerprint, plus installation QA covering the same files.
It rejects failed or stale receipts. The installer payload must contain the
same application archive and executable as the packaged smoke candidate.
Metadata records the Git revision, dirty-worktree status, runtime version, and
archive hash. Prepare the public candidate again from its committed source in
CI; a dirty local candidate is review evidence rather than a published release.

## Installation and workflow acceptance

Windows 11 x64 is the maintained desktop platform. Before promoting a draft,
complete these checks in a clean Windows 11 x64 environment. Use an existing
test machine or an external disposable environment for installation lifecycle
checks; a storage-constrained development laptop does not need local OS images
or VMs. Routine source and packaged workflows can run on the development
laptop, while hosted Windows CI covers build and installer regressions.

1. Download the candidate installer and `SHA256SUMS`; compare the installer hash
   with its exact filename entry using `Get-FileHash -Algorithm SHA256`.
2. Check Authenticode with `Get-AuthenticodeSignature`. Record the actual
   status; checksums verify bytes and do not identify the publisher.
3. Install, launch, close, and reopen the packaged application. Check the
   displayed version and bundled Help. Exercise an upgrade from the previous
   installer and confirm settings remain usable.
4. Pair the intended published CLI version. Run discovery, the model vault,
   engine start/stop, engine health, and a completion using an actual supported
   GGUF and server on representative hardware.
5. Open a disposable project; edit/save files, duplicate-basename tabs, dirty
   close/cancel, search, and terminal start/exit/restart. Verify large-file
   previews cannot overwrite their original files.
6. Run a preview mission with Live writes off, then a bounded live mission if
   intended. Check streaming, cancellation, output, changed files, and errors.
   Verify command execution remains controlled by Allow run.
7. Generate, inspect, dismiss, and apply a suggestion. Verify a file switch or
   external edit cannot redirect or overwrite a stale proposal.
8. Exercise Settings, theme, panels, palette, model test bench, memory, graph,
   and update statuses: newer release, current release, no public release,
   offline/rate limiting, missing assets, and invalid metadata.

Record the tested Windows 11 build and installation scope. Hosted Windows Server
results and portable application workflows each cover their recorded behavior;
retain a separate Windows 11 installed-application acceptance record. Windows 10
is outside the maintained support matrix. Record incomplete checks explicitly;
a successful build is not a completed release review.

## GitHub workflow and publication

The CI workflow tests the source on Windows and Linux. Linux coverage protects
the bridge's platform branches; it does not declare Linux a supported desktop
target. The release workflow builds and tests a Windows candidate.

A manual release-workflow run uploads candidate artifacts and does not publish
a GitHub Release. A matching `v<package.json version>` tag creates a **draft**
release. Keep the package version, changelog heading, installer filename, and
release tag aligned. Never move an existing release tag.

When all required acceptance evidence is present, review the draft's notes and
assets and promote it to a public release. Include the versioned Windows
installer and `SHA256SUMS`, using the exact normalized filenames covered by the
checksums. Release notes should explain user-visible changes and the unsigned
status if applicable.

The application's Update controls read the repository's **latest published
stable release**. Drafts and prereleases are excluded. Mark the intended stable
release as latest when promoting it, and verify the public metadata after
publication. A release without the required versioned installer/checksum assets
may show notes but must not be offered as an installable update.

Publishing Code does not publish or update the CLI. Confirm the documented CLI
installation command resolves to the paired version independently.

## Signing and recovery

Configure `CSC_LINK` and `CSC_KEY_PASSWORD` as repository secrets to enable the
existing electron-builder signing integration. Never commit a signing key or
include credentials in verification output. Without signing credentials, the
installer is unsigned and Windows may warn. Verify the built executable's
signature before describing it as signed.

Retain the previous release and its checksums. If a public candidate needs to be
withdrawn, correct the latest-release designation and publish a new version with
a clear recovery note. Preserve existing tags and users' project/CLI state.
Users install updates themselves after saving their work; the desktop does not
perform a silent download, replacement, or restart.

The Update dialog detects registered Windows installs in HKCU/HKLM and shows
their version, scope, and location. Keep the NSIS GUID
`f487ccb7-2921-5fe7-8c43-cc99c9874470` stable: it matches earlier installers.
NSIS removes the prior application through its registered uninstaller before
placing the new files, passes the update flag to preserve user data, and reuses
the selected scope's recorded location. `deleteAppDataOnUninstall` stays false.
Do not change the app ID, installer GUID, or package name between releases.
Portable/source directories are not registered installations and are not
deleted. Test older-version replacement with an isolated installer identity;
do not uninstall a developer's active copy as part of routine QA.

`pnpm verify:installation` builds two installers with a separate QA identity,
installs the older version in a temporary folder, upgrades it, verifies old
application-file removal and settings retention, then tests uninstall. Results
and logs are retained in `dist/qa/installation/`. The old fixture uses current
source with older version metadata; also review a historical installer upgrade
in a disposable environment before public promotion. The release workflow runs
this gate and audits the complete build-tool dependency tree.

To verify an exact historical binary, dispatch the Release workflow on the
candidate branch with `candidate_run_id` set to a successful Release run ID.
This runs the historical-upgrade workflow on a disposable Windows Server 2022
runner and skips rebuilding the supplied candidate. It downloads the exact
2.4.1 draft installer and checksum, checks both installers and the candidate
source fingerprint, launches the historical UI, upgrades with the original app
identity, checks retained settings and exact new payload bytes, and uninstalls.
Evidence is retained as `historical-upgrade-qa`. This harness refuses to run
locally or over a preexisting real installation. Server acceptance is distinct
from the Windows 11 desktop acceptance matrix above.
