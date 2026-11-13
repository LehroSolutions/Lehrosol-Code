# Lehrosol Code

Lehrosol Code is a Windows desktop IDE for local models, built around the
[LehroSol CLI](https://github.com/LehroSolutions/lehrosol-cli). Discover GGUF
models, start an engine, edit a project, run coding missions, review AI
suggestions, and compare model output from one application. The desktop and CLI
share the model vault and state home, normally `%USERPROFILE%\.lehro`.

Version **2.4.2 is a release candidate**. Tagged builds create a draft Windows
installer release for review. Installers are unsigned unless signing credentials
were supplied for that build. See [the release guide](RELEASING.md) for promotion
checks and the distinction between automated checks and installation acceptance.

[Releases](https://github.com/LehroSolutions/Lehrosol-Code/releases) ·
[CI](https://github.com/LehroSolutions/Lehrosol-Code/actions/workflows/ci.yml) ·
[User guide](docs/USER-GUIDE.md) · [Offline glossary](docs/glossary.html) ·
[Changelog](CHANGELOG.md)

## Install and connect

Windows 11 x64 is the supported desktop target. Windows 10 is outside the
maintained and tested support scope. Install the desktop installer
from a **published** GitHub Release. A draft is a maintainer candidate and is not
offered by the application's update check. Windows may display a SmartScreen
warning for an unsigned installer; verify its source and the release's
`SHA256SUMS` before running it.

Install the paired CLI using Node.js and npm:

The JavaScript CLI runs through `node` on PATH in the desktop. Keep Node.js
installed and restart the desktop after installing it or changing PATH.

```powershell
npm install -g @lehrosolutions/cli@beta
lehrosol --version
lehrosol doctor
```

The command aliases remain `lehrosol` and `lehr-sol`. CLI 3.2 is recommended for
the full quick-lane interface. Older versions may lack commands or flags; update
the CLI when a panel reports a compatibility error.

The desktop looks for `LEHROSOL_BIN`, then `lehrosol` on `PATH`, then known
installation folders. If discovery fails, open **Settings → Locate…** and select
the CLI's `bin/lehrosol.js`. The desktop can open without the CLI, but engine and
mission features require it. A local GGUF model and llama.cpp-compatible server
are also needed for inference; no model weights are bundled.

## First project

1. Open **Vault** and scan for your models. Add discovered folders to the shared
   CLI vault, or scan another folder.
2. Start a model from the Vault or engine controls. The fit rating helps choose
   a model; actual context, background load, and available memory still matter.
3. Click the project selector to open your working folder, then use **Files** to
   open a file. Edit and save with **Ctrl+S**.
4. Type a goal in the ask bar to run a coding mission in that folder. Inspect the
   mission's streamed output and changed files.

**New profiles start with Live writes off** for a preview using `--dryRun`.
Enable it to let a mission write project files. **Allow run** is also off by
default; enabling it permits the coding agent to run project commands. Both
choices persist, including a previous profile's Live writes preference. Use
version control or a backup for projects on which you allow writes.

**Auto-start engine is enabled by default** and can resume a model or choose a
fit on launch. Disable it in Settings if you want to control resource use.

## Updates and release changes

Click **Update** in the top bar, **Check for updates** in Settings or About, or
the matching command-palette action. The app checks the repository's latest
published stable release and shows its version and release notes. Notes are
displayed as text. Drafts and prereleases are excluded.

New-release changes are shown before download. The dialog also shows the
changes bundled with your installed version when it differs from the public
release, or when no stable release is available or the check is offline.

An available update opens its official GitHub download in your browser; the app
does not install or restart itself. The release must provide the expected
versioned Windows installer and `SHA256SUMS` before it is offered as an installer
update. Download the checksum file, verify the installer, save your work, close
the app, and run the new installer. The dialog includes **Download checksums**.

On Windows the update check detects registered per-user and all-user
installations and displays their version and location. The installer recognizes
the existing application using its stable identity, removes the old application
files, and installs the new version in the selected scope. The wizard reuses
the detected location and preserves desktop settings, projects, GGUFs, and
shared CLI state. Source and portable copies are managed separately and are
not removed by the installer.

No update request runs at startup. A missing public release, an offline request,
or GitHub rate limiting produces a recoverable status; retry when connected.
Updating Code does not update the CLI. Use the npm command above separately.

## Controls and workflows

| Control | What it does |
| --- | --- |
| Engine / Vault / + New Agent | Discover models; start or stop a local model server using CLI `up` or `vault serve`. |
| Ask bar / Missions / Agent Stream | Run the CLI's hands-on `code` lane in the selected project, stream output, retry, or cancel. |
| Files / Editor | Browse and edit selected-project files. Tabs distinguish identical basenames, dirty changes are protected, and truncated reads are read-only. |
| AI Suggestion / Apply | Request a rewrite, review the proposed change, and write it only if its original file and content still match. Partial-context replacements are refused. |
| Search | Search text in the project files included by the bounded tree scan. |
| Test Bench | Send a preset or custom prompt to a model; inspect its output, latency, tokens, and tokens/sec. Compare models and review the CPU-load warning. |
| System Graph | Inspect engine, vault, adapter, mission, memory, and web-plane status. Polling can be paused. |
| Terminal / Output / Events | Run a real user shell, inspect mission output, or inspect application events. |
| Workspace / Views | Switch Create, Code, Debug, or Minimal layouts; pin views, save layouts, and split editor/output. |
| Model usage / Footer | Inspect measured local token counts and available engine/GGUF context metadata. Missing counts stay unknown. |
| Skills / Memory | Browse playbooks and recent CLI ENGRAM records. |
| Settings | Choose the CLI, engine port/key, theme, resource profile, and auto-start behavior. |
| About / Help / Update | Read the application version, open bundled documentation, or check public release changes. |
| Ctrl+K | Open the command palette. |

The [user guide](docs/USER-GUIDE.md) explains error recovery, editor protections,
suggestions, benchmarks, and the update procedure.

## Build from source

Source builds need **Node.js 22.13.0+** and the pinned **pnpm 11.15.1**. No native
modules or Microsoft Visual C++ Build Tools are required.

```powershell
corepack enable pnpm
# If Corepack is unavailable: npm install -g pnpm@11.15.1
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm start
```

`pnpm-workspace.yaml` supplies `nodeLinker: hoisted` for electron-builder and
`allowBuilds` for Electron's binary download. `scripts/start.js` removes injected
`NODE_OPTIONS` flags that Electron rejects. Environment overrides must be set in
the launching process; the app does not automatically load `.env` files. See
[`.env.example`](.env.example) for `LEHROSOL_BIN`, `LEHRO_HOME`, and model roots.

Packaging and smoke checks are described in [RELEASING.md](RELEASING.md).

## Privacy and trust

No remote analytics or automatic crash reporting is configured. A local usage
ledger records model identifiers, request timing, and provider token counts in
Lehro home; it excludes prompts and answers. New CLI instrumentation remains
unreleased; the published beta supports desktop request counts and readable
mission logs. Inference
goes to the local engine; the CLI and any adapters you enable can make their own
network requests. Clicking Update contacts GitHub for public release metadata
and opens downloads in your system browser. Local work does not require an
update check.

Settings are persisted in the desktop's Electron profile; CLI state and keys
also live in the configured Lehro home. Treat those files as sensitive. API keys
are sent to the configured engine for authentication.

The renderer is isolated and sandboxed, and file IPC is confined to project
folders selected in the native dialog. The integrated terminal and the trusted
CLI run with your user permissions. These controls do not sandbox the commands
you intentionally run. Review model suggestions and mission results before
relying on them. See [SECURITY.md](SECURITY.md) for the threat model.

## Repository and support

`electron/` contains the main process, preload, CLI bridge, and release checker;
`renderer/` contains the interface; `docs/` contains bundled help; `scripts/` and
`test-app/` contain development and verification tools. The package includes
application sources, help, and license notices as specified by `build.files`.

Report bugs through [GitHub Issues](https://github.com/LehroSolutions/Lehrosol-Code/issues).
Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).
Contribution guidance is in [CONTRIBUTING.md](CONTRIBUTING.md).

**Apache-2.0 · © 2026 Lehro Solutions.** See [LICENSE](LICENSE), [NOTICE](NOTICE),
and [AUTHORS](AUTHORS).
