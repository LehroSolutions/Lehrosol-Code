# Changelog

Notable changes to Lehrosol Code. Current tags and installer candidates are listed
in [GitHub Releases](https://github.com/LehroSolutions/Lehrosol-Code/releases).
Older version entries summarize source history; they do not establish that an
installer was publicly distributed for every version.

## [Unreleased]

## [2.4.2] — 2026-11-12 (release candidate)

### Added
- Full-size mission output with answer/activity/raw views, filtering, changed-file
  navigation, and a split editor layout.
- Saved workspace layouts, pinned views, theme/accent/font controls, and a footer
  for engine status, measured local usage, and context capacity.
- Local usage records without prompts or answers. Expanded CLI event and usage
  instrumentation requires the paired unreleased CLI changes; the published
  CLI continues to provide readable mission logs.
- On-demand Update controls in the top bar, Settings, About, and command palette.
- Show new-release changes before download and installed-version changes even
  when offline or no stable release is published.
- Detect registered Windows installation versions and locations; reuse the
  stable installer identity to replace old app files while retaining settings.
- Link the matching checksums directly from the update dialog.
- Display the latest published stable version and release changes, with explicit
  no-release, offline, rate-limit, and missing-installer states.
- Offer only official, versioned Windows installer links from validated release
  metadata with the required checksum asset; installation remains manual.
- Bundle the offline glossary, user guide, changelog, and license notices.
- Add source checks, renderer workflow regression coverage, Electron smoke
  tooling, and candidate preparation with checksums and release metadata.

### Fixed
- Reject malformed, interrupted, and oversized engine responses without crashing
  desktop IPC; recover corrupted saved layouts and retain model selections while
  engine metrics refresh.
- Bind packaged smoke approval to both executable and archive hashes, and reject
  invalid installer signatures during release preparation.
- Read the displayed application version from the installed package.
- Keep files with identical basenames in separate tabs and preserve edit drafts
  across tab switches, with dirty-close and project/window guards.
- Make truncated file previews read-only and refuse partial-context full-file
  AI replacements.
- Bind suggestions to their source path and content; reject stale proposals and
  disk changes, and retain drafts/proposals after failed saves or Apply.
- Recover from malformed saved prompt history and invalid engine settings.
- Recover terminal readiness after creation failure or exit, handle asynchronous
  subprocess errors, and keep old process exits from removing replacements.
- Treat nonzero CLI exits and timed-out commands as failures even when their
  output contains a success-shaped JSON object.
- Bound UTF-8 file previews, reject binary editing, and open packaged Help from
  a real file outside the application archive.
- Keep engine health responsive during slow CLI snapshots, prevent overlapping
  refresh processes, and start polling after a previously missing CLI is located.
- Keep release controls and terminal tabs reachable at the minimum window size.
- Run JavaScript CLI commands with the installed Node executable, avoiding a
  new packaged-desktop process for every command and version handshake.
- Register model folders with the CLI's required `vault add-root --path` contract.
- Keep dismissed update checks from reopening dialogs after a late failure.
- Match offline help to configured engine authentication and retain usable
  security links after Help is extracted from the packaged application.
- Include the actual installer signature status in release notes and metadata.
- Skip invalid null usage-log records without losing later measured requests.

### Changed
- Update the packaged Electron runtime to 45.3.0 and electron-builder to 26.18.0.
- Refresh the lockfile and pin patched release-tool dependencies for the
  advisories found during release verification.
- Enable Chromium renderer sandboxing alongside context isolation, and validate
  the calling frame and navigation boundaries for desktop IPC.
- Start new profiles with Live writes off; retain existing stored preferences.
- Refresh setup, workflow, privacy, security, and release acceptance guidance.
- Check updates only when requested; no startup check, silent installation,
  remote analytics, or automatic restart is added.
- Include the pending GitHub Actions dependency updates in candidate workflows.

### Validation boundary
- Source tests and synthetic-engine smoke checks establish their covered
  contracts, not local model quality or real GGUF engine startup acceptance.
- Record final test/smoke/artifact evidence with the candidate. Windows 10
  installation, upgrade behavior, real-model pairing, and signing must be
  evaluated before a draft is promoted. A local build is not publication.

## [2.4.1] — 2026-10-28 (release candidate)

### Changed
- Pair installation instructions and missing-CLI guidance with `@lehrosolutions/cli@beta`.
- Clarify the Windows 10/11 x64 support boundary and Node.js 22.13.0 minimum for source builds.
- Correct pnpm settings documentation to match `nodeLinker` and `allowBuilds` in `pnpm-workspace.yaml`.
- Consolidate release history, contributor guidance, and reporting templates.

### Release tooling
- Prevent accidental npm publication of the desktop repository.
- Test before packaging, require version-matching tags, and attach SHA256SUMS to installer drafts.
- Provide downloadable candidate artifacts from manual workflows and draft GitHub Releases from tags.
- Keep signing credentials in repository secrets.
- Normalize installer asset names before hashing so GitHub downloads and SHA256SUMS use the same filename.

### Validation boundary
- The Node suite covers CLI integration and filesystem confinement (32 tests).
- Installer signing and interactive installation, launch, and engine pairing must be checked before promotion. Unsigned candidates must be identified as such.

## [2.4.0] — source baseline

### Desktop and CLI integration
- Model vault and GGUF discovery, engine controls, project editor, integrated terminal, and local model suggestions.
- CLI version handshake and v3.2 quick-lane integration: up, arena, scan, engrams, recommend, doctor, adapters, and modes.
- Mission streaming, system graph polling, memory panel, and resource-aware model test bench.
- Bridge tests for command spawning, JSON responses, engine health, and model discovery.

### Security and packaging
- Confine renderer-requested filesystem paths to explicitly selected project roots, including symlink checks and a write-size limit.
- Validate IPC senders, escape renderer attribute values, and deny unused permission requests.
- Use Electron 44.5.1 and electron-builder 26.15.3 in this source baseline.
- Keep context isolation enabled and Node integration disabled. Chromium sandboxing remains disabled; see SECURITY.md for the boundary.
- Relicense the maintained source under Apache-2.0 and include LICENSE, NOTICE, security and contribution policies.
- Add cross-platform bridge CI, Windows packaging, a pnpm lockfile, and dependency-update automation.
- Remove abandoned portal code, unshipped vendor files, and plaintext credential documents from the working tree. Historical credentials remain in Git history and must be treated as compromised; this cleanup does not verify their rotation.

---
## [2.3.0]

### Added

- Light theme, in addition to dark.
- Ask-bar chips.
- Mission status presentation.

---

## [2.1.0]

The release that turned a demo into a working cockpit.

### Added

- Agent missions with live stream cards: every ask-bar prompt becomes a real
  loop run with phase badges (architect → scout → builder → reviewer → scribe),
  a streamed tail, and cancel.
- Model test bench: serve a model, prompt it, record latency, tokens and
  tokens/sec, and run a head-to-head leaderboard across every model rated
  GREAT against your RAM.
- Onboarding and quick-start flow.

### Fixed

- **v2.1.6 — wrong mission lane.** Prompts were sent to `loop run`, the
  scoring/verdict harness, which never reads files or answers questions (and in
  dry-run mode makes no model calls at all). Moved to the hands-on `code` lane.
- **v2.1.5 — missions ran in the wrong folder.** Every mission spawned in the
  GUI's own directory, so "examine this project" examined nothing. Missions now
  run in the project the user opened.
- **v2.1.4 — Windows command line broke on paths with spaces.** The CLI was
  spawned through `cmd.exe /d /s /c` with a plain argument array. `cmd.exe`
  re-parses `/c` with its own rules, not `CreateProcess` argv rules, so Node's
  automatic per-argument quoting did not survive the round trip and a shim path
  like `C:\Users\Home Station\...\lehrosol.cmd` was split at the space. The
  command line is now built explicitly — quote every part that needs it, wrap the
  whole line in one outer pair of quotes which `/s` strips back off, and pass it
  verbatim with `windowsVerbatimArguments`.

---

## [2.0.0]

The first version of the actual Electron app. Everything before this was the
abandoned multi-agent portal direction.

### Added

- Electron main process, preload bridge, and renderer cockpit.
- **Deep integration with the LehroSol CLI**, two ways: spawning
  `lehrosol … --json` for actions, and reading the CLI's own state files
  (`~/.lehro/serve.json`, `~/.lehro/config.json`) for awareness — so the GUI
  sees servers and adapters even when no command is running.
- **Zero-setup model discovery.** A native GGUF scanner finds models on every
  drive (`D:\AI Models`-style folders, Jan, LM Studio, HuggingFace cache,
  `~/models`, …), rates each against actual RAM as GREAT / TIGHT / NO FIT, and
  registers the discovered folders into the CLI vault (`vault add-root`) so both
  tools share one model library.
- Model vault, one-click engine, engine health card and auto-start on launch.
- Integrated terminal, event feed, and streamed mission output.
- Project file tree, editor, project search, AI Suggestion with diff and apply.
- System graph with 5-second live polling.
- Command palette.
- Runtime CLI resolution: `LEHROSOL_BIN` → `PATH` → fallback install paths,
  with a persisted Settings → **Locate…** override.
- `node --test` suite for the bridge.

### Fixed

- **CLI timeout was far too short.** The default was 45 seconds, which killed
  legitimately slow work: serving a 3 GB GGUF, or running a mission on a
  CPU-only laptop, legitimately takes minutes. Raised to 10 minutes.

### Notes

- The historical source notes record that the
  earlier "Project Portal" implementation documentation described code that
  never existed. `LOGIN.md` contained plaintext credentials for a login system
  that was never built; it has been removed and that password should be
  considered burned.

---


[Unreleased]: https://github.com/LehroSolutions/Lehrosol-Code/compare/v2.4.2...HEAD
[2.4.2]: https://github.com/LehroSolutions/Lehrosol-Code/compare/v2.4.1...v2.4.2
[2.4.1]: https://github.com/LehroSolutions/Lehrosol-Code/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/LehroSolutions/Lehrosol-Code/tree/v2.4.0
