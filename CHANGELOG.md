# Changelog

All notable changes to Lehrosol Code are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Release preparation
- Prevent accidental npm publication of the desktop application.
- Run tests before packaging, require matching release tags, and attach installer checksums.
- Manual release workflows upload candidates; tagged builds create reviewable draft releases.
- Document installer verification and keep signing keys in repository secrets.

### Security
- **Arbitrary file read/write from renderer input.** `project:read`, `project:write`, and `project:tree` passed the renderer's path straight to `fs` after a bare `String()` coercion — no resolution, no containment check, no symlink handling. Reachable second-order, because `renderer/app.js` parses "Files changed:" lines out of streamed CLI output and feeds them back through `projectRead`. A malicious or compromised CLI binary could direct the app to read or write any path the process could reach. Paths are now confined to a directory the user explicitly picked through the native dialog (`electron/pathConfinement.js`), checked lexically and again after symlink resolution; `project:write` also gained an 8 MB cap.
- **No IPC sender validation.** All 30 `ipcMain.handle` registrations ignored the event's sender. Every handler is now guarded.
- **Attribute injection in the renderer.** `esc()` escapes `& < >` but not quotes, and was being used inside HTML attribute values — including for model ids derived from filenames on disk. Switched to the existing `attr()` at all 10 such sites.
- Electron 31.3.0 → **44.5.1**. The pinned version was roughly two years of Chromium behind, carrying that backlog of unpatched browser CVEs. The app's Electron surface is six stable APIs (`app`, `BrowserWindow`, `ipcMain`, `dialog`, `shell`, `session`), so the jump is low-risk. electron-builder 24.13.3 → 26.15.3.
- Added a deny-all `setPermissionRequestHandler`; the app needs no camera, microphone, or geolocation.
- Corrected a comment in `electron/main.js` that claimed the renderer was "fully sandboxed" while `sandbox: false`. The sandbox is still disabled — `main.js` now states so plainly rather than claiming a guarantee it does not have.

### Fixed
- **`pnpm dist` failed in CI.** electron-builder 26 auto-publishes whenever it detects a CI environment, so the build died with "GitHub Personal Access Token is not set" — and that implicit behaviour is removed in v27. The `dist` script now passes `--publish=never`; publishing stays with `softprops/action-gh-release` in the release workflow.
- **`node-linker=hoisted` was dead config.** pnpm 11 does not read `.npmrc` for its own settings, so the setting meant to stop electron-builder packaging against a symlinked tree had no effect. Moved to `nodeLinker: hoisted` in `pnpm-workspace.yaml`. Verify with `pnpm config get node-linker`; it must print `hoisted`.
- **`pnpm-workspace.yaml` contained a literal placeholder.** pnpm had written `electron-winstaller: set this to true or false` into it. Now explicitly `false` — we only build NSIS, never Squirrel.
- Removed a stale 2.3.0 installer (75 MB) left in `dist/` beside 2.4.0 sources.

### Added
- Apache-2.0 `LICENSE` and `NOTICE` (including the Electron/Chromium MIT attribution required by §4(d)). The repo previously declared `GPL-3.0-or-later` in `package.json` and shipped no license text at all.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `AUTHORS`, `.env.example`, `.gitattributes`, `.editorconfig`.
- CI (`windows-latest` + `ubuntu-latest`), release workflow, Dependabot, issue and PR templates.
- `test-app/ipc-security.test.js` — 8 regression tests over the path-confinement rules, including explicit traversal-escape cases.
- npm metadata: `repository`, `homepage`, `bugs`.

### Removed
- 314 tracked files the app never shipped or read: a vendored third-party playbook corpus (`skills/`, 212 files, 60+ with no recordable license), a superseded TypeScript swarm orchestrator (`runtime/`), `workflows/`, `agents/`, `config/`, a broken `project-portal` gitlink pointing at a nonexistent commit, and internal scratch docs for a product that was never built. `build.files` has only ever been `electron/**`, `renderer/**`, `package.json`.
- **Committed plaintext credentials.** `LOGIN.md` held an admin email and password for the abandoned Project Portal, and the same default password appeared in two further tracked documents. All removed, along with a maintainer's local absolute paths in `test-app/harness-bridge.js`. **These credentials must be treated as compromised and rotated** — they remain in git history even though the files are gone.

---

## About this file

This changelog was written **after the fact**. The repository has three commits
and zero tags, so there is no release history to extract. The entries below are
reconstructed from what the code and the repository documentation actually
describe — version markers in source comments, the "New in v2.4" note in the
app's own onboarding panel, and the README's honesty note. Where a release
line has no surviving record, no date is given rather than a guessed one.

Two things are deliberately **not** in this changelog:

- **The "Project Portal" / Convex / Next.js product.** Earlier documentation in
  this repository described a Flask + Vue admin portal and a TypeScript swarm
  runtime as "implementation complete". That was never built — `project-portal/`
  was empty and the portal code does not exist. Nothing shipped, so nothing is
  changelogged. The honesty note at the top of `README.md` records this.
- **`LOGIN.md`.** It contained a plaintext password and no authentication
  feature ever existed. Removed, not released.

---

## [Unreleased]

### Changed

- **Relicensed GPL-3.0-or-later → Apache-2.0.** The project was never published
  or distributed (zero tags, zero releases), so no third party holds rights
  under the previous terms and the change is clean. `package.json` `license`,
  `LICENSE` and `NOTICE` updated to match. Contributions are accepted under
  Apache-2.0 §5; there is no CLA and no separate DCO signature is required.
- Documentation no longer claims features that do not exist. The phantom
  `pnpm doctor` script is removed from the README.

### Added

- `LICENSE` — full verbatim Apache License 2.0.
- `NOTICE` — attribution required by Apache-2.0 §4(d), including the MIT-licensed
  Electron/Chromium/Node runtime redistributed inside the Windows installer, and
  a note that the LehroSol CLI is a runtime dependency that is **not** vendored.
- `SECURITY.md` — supported versions, a private reporting channel, the explicit
  threat model, an explicit "not a vulnerability, by design" list covering the
  full-permission integrated terminal, and a hardening checklist for contributors
  touching IPC.
- `CONTRIBUTING.md` — prerequisites, dev setup, an honest statement of the test
  coverage gap, build notes, coding conventions, and the IPC validation rules.
- `CHANGELOG.md` — this file.
- `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1.
- `.github/workflows/ci.yml` — push/PR CI across `windows-latest` and
  `ubuntu-latest`: pinned pnpm, `pnpm install --frozen-lockfile`, `pnpm test`.
- `.github/workflows/release.yml` — `pnpm dist` on `v*` tags, uploaded as a
  GitHub Release asset. **Code signing is not configured**; the workflow
  documents what has to be set up before it can be.
- `.github/dependabot.yml` — weekly `npm` and `github-actions` updates.
- `.github/ISSUE_TEMPLATE/` — bug report form and a config that routes security
  reports to `SECURITY.md` and PRs to `CONTRIBUTING.md`.
- `.github/PULL_REQUEST_TEMPLATE.md` — tests-run, license/DCO, and IPC-security
  checklist.
- `.gitattributes` and `.editorconfig`.

---

## [2.4.0]

The release that turned the cockpit into a genuine peer of the CLI rather than a
set of one-off wrappers.

### Added

- **CLI version handshake.** The bridge runs `lehrosol --version` once per
  process, caches the result, and lets the GUI warn when the connected CLI is
  older than the flags it is about to send — instead of failing opaquely
  mid-action.
- **CLI v3.2 quick lane.** `up` (one-click best-fit engine), `arena` (head-to-head
  tok/s racing with a scoreboard), `scan` (CLI-native discovery that registers
  folders straight into the shared vault), `engrams` (distilled long-term memory),
  `recommend`, `doctor`, `adapters`, and `modes`.
- **Memory panel restored.** The CLI renamed `engram` to `engrams` in v3.0 and the
  GUI's memory panel went dark; it is back on the new lane.
- **CPU load sampling.** `cpuLoad` reports a 0–100 busy percentage. Background
  load is the single biggest source of misleading local-model benchmarks, so the
  app can now show it.
- **Per-resource-profile suggestion budgets.** `suggestionPlan` caps tokens and
  output characters by resource profile and flags truncation rather than
  silently overflowing.
- **Test coverage** for the whole quick lane plus the local-model quality
  guards — version handshake, `engrams`, `doctor`/`adapters`/`modes`, `scan`,
  `up`, `arena`, suggestion budgeting, CPU load, and system-contract forwarding.

### Changed

- Mission prompts run on the CLI's `code` lane (CLI ≥ 3.0.17) instead of
  `loop run`, which was the wrong lane for the job.
- Every quick-lane call is `--json` first and degrades to a raw string result
  when the connected CLI predates the flag.

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

- This release carries the **honesty note** that the repository still shows: the
  earlier "Project Portal" implementation documentation described code that
  never existed. `LOGIN.md` contained plaintext credentials for a login system
  that was never built; it has been removed and that password should be
  considered burned.

---

<!-- Version links are omitted: no git tags exist for any release line yet.
     Add `[X.Y.Z]: .../compare/vX.Y.2...vX.Y.Z` refs here once releases are tagged. -->
[Unreleased]: https://github.com/LehroSolutions/Lehrosol-Code/compare/main...HEAD
