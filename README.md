# Lehrosol Code

**The agentic engineering IDE for local models.** Lehrosol Code is an Electron desktop app deeply integrated with the LehroSol CLI — the GUI drives the CLI, the CLI feeds the GUI, and they share one model vault, one engine, and one state home (`~/.lehro`). Zero-setup model discovery, one-click engines, HELIX agent missions, a model test bench, ENGRAM memory, and a live system graph — all running on GGUFs from your own drive. No cloud, no demo content: everything on screen is real.

**Windows-first.** This app is built, tested, and packaged for Windows. It is developed and supported on Windows; other platforms are not currently a target (see [Requirements](#requirements)).

> **📖 Documentation:** [**docs/glossary.html**](docs/glossary.html) — the full glossary, install walkthrough, CLI pairing, and a **Troubleshooting** section for common errors. Start there if anything below is unclear.

| | |
|---|---|
| 📖 Documentation | [docs/glossary.html](docs/glossary.html) · `.env.example` (optional overrides) |
| 📡 Telemetry | **None.** No analytics, no crash reporting, no phone-home. See [Privacy](#privacy). |
| 🐛 Support | [Open an issue](https://github.com/LehroSolutions/Lehrosol-Code/issues) · see [Maintainers](#maintainers) |
| 🤝 Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) |
| 🔐 Security | [SECURITY.md](SECURITY.md) — please report vulnerabilities privately |
| 📜 Changelog | [CHANGELOG.md](CHANGELOG.md) |
| ⚖️ License | [Apache-2.0](LICENSE) · [NOTICE](NOTICE) · [AUTHORS](AUTHORS) |

## Requirements

| | |
|---|---|
| **OS** | **Windows 10/11 (x64)** — Windows is the only supported target; builds are Windows-only |
| **Node.js** | **22+** (`package.json` → `engines.node >= 22`) |
| **Package manager** | **pnpm 11** (pinned via `packageManager` → `pnpm@11.15.1`) |
| **LehroSol CLI** | **3.0+ required for the full experience** — see [The CLI relationship](#the-cli-relationship) |
| **Native build tools** | Not required — there are **no native modules** |

Microsoft Visual C++ Build Tools are **not** needed.

## How the deep integration works

| Layer | Mechanism |
|---|---|
| Actions | The app shells out to `lehrosol … --json` (vault, serve, loop, engrams, gui) |
| Awareness | It reads the CLI's own state files: `~/.lehro/serve.json`, `config.json` |
| Engine | It talks HTTP to your llama-server: `/v1/models` pings, `/v1/chat/completions` benchmarks |
| Discovery | A native scanner finds GGUFs on your drives with no config, then registers those folders into the CLI vault (`vault add-root`) so both tools share one library |
| Sync (v2.4) | The bridge handshakes the CLI version (`--version`) and speaks the CLI v3.2 quick lane: `up` (one-click best-fit engine), `arena` (tok/s racing), `scan` (CLI-native discovery that registers roots), `engrams` (distilled memory — renamed from `engram` in v3.0), `recommend`, `doctor`, `adapters`, `modes` |

## The CLI relationship

**LehroSol is one product with three front-ends; this is the desktop one.** The engine is the [LehroSol CLI](https://github.com/LehroSolutions/lehrosol-cli), in a sibling repository and also Apache-2.0. There is a third front-end too: a web dashboard at `lehrosol gui`, which ships inside the CLI repo and talks to the same MCP control plane.

Install the CLI first — this app drives it for every action.

Install the current CLI beta with `npm install -g @lehrosolutions/cli@beta`.
The command names remain `lehrosol` and `lehr-sol`.

The bridge resolves the CLI in this order:

1. **`LEHROSOL_BIN`** — an absolute path to the CLI entry script, if set and it exists
2. **`PATH`** — a `lehrosol` shim (`where lehrosol` on Windows)
3. **Fallback folders** — a couple of well-known install locations

If none resolve, the app still launches and shows the Vault, but engine and mission features need the CLI. You can also point at it in-app: **Settings → Locate…**, which persists your choice.

### Version pairing

The app reads the CLI's `--version` at startup and shows the connected version in **Settings** and the About dialog.

| Lehrosol Code | LehroSol CLI | Notes |
|---|---|---|
| 2.4.x | **3.2+** | Recommended. Full v3.2 quick lane: `up`, `arena`, `scan`, `engrams`, `recommend`, `doctor`, `adapters`, `modes` |
| 2.4.x | **3.0–3.1** | Works. `engrams` requires 3.0+ (renamed from `engram` in 3.0) |
| 2.4.x | **< 3.0** | Degraded. Older CLIs lack the renamed quick-lane commands, so some panels stay dark |

The app does **not hard-fail** on an older CLI — quick-lane calls degrade gracefully instead of erroring mid-action. You will simply notice missing panels rather than a crash.

## Zero-setup models

On first launch the app checks the CLI vault; if it is empty (or the CLI is missing) it scans your PC automatically — `D:\AI Models`-style folders on every drive, Jan, LM Studio, HuggingFace cache, `~/models`, etc. — rates each model against your actual RAM (GREAT / TIGHT / NO FIT), and lists them in the Vault view. One click adds the discovered folders to the CLI vault; one click serves a model. With **Auto-start engine** on (default), the app resumes your last served model at launch, so your local AI is simply *on*.

To scan somewhere the built-in candidates don't cover, set `LEHRO_MODELS_DIR` (see [`.env.example`](.env.example)) or use **Vault → Scan another folder…**.

## Model Test Bench (⚖)

Pick a model, pick a preset (code / reasoning / summarize / creative / custom), hit **Run**: the app serves the model if needed, sends the prompt, and records latency, tokens, and tokens/sec alongside the full output. **Run on all GREAT models** does a head-to-head comparison and keeps a leaderboard, so you can feel out every model on your drive in minutes.

## Run it (Windows)

```powershell
# Requires Node.js 22+ (LTS recommended)
corepack enable pnpm                # one-time; honors the pinned pnpm 11.15.1
# Alternative if Corepack is unavailable: npm i -g pnpm@latest-11
pnpm install                        # downloads Electron (one-time, needs internet)
pnpm start
```

- Tests: `node --test "test-app/*.test.js"` (or `pnpm test`) · Installer: `pnpm dist`
- This repo is **pnpm 11-managed** (`packageManager` pins `pnpm@11.15.1`; Node.js **22+** required). The first `pnpm install` creates `pnpm-lock.yaml` — commit it. `.npmrc` sets `node-linker=hoisted` so electron-builder can package the flat `node_modules`.
- Electron's binary-download script is pre-approved in `pnpm-workspace.yaml` (`onlyBuiltDependencies`) — the new home for pnpm settings; the old `"pnpm"` field in `package.json` is no longer read by pnpm 11, so no `pnpm approve-builds` prompt on fresh installs.
- `pnpm start` launches Electron through `scripts/start.js`, which strips pnpm-injected `NODE_OPTIONS` (e.g. `--use-system-ca`) that Electron rejects with exit code 9.
- CLI not on PATH? Settings → **Locate…** → pick your `bin/lehrosol.js` (persisted), or set `$env:LEHROSOL_BIN`.
- Configuration is entirely optional — see [`.env.example`](.env.example).

## Installers are unsigned

Release builds are produced with `pnpm dist` and are **not code-signed**. Expect:

- **Windows SmartScreen** to show "Windows protected your PC" on first launch → *More info* → *Run anyway*.
- No automatic updates — download a new installer manually.

The app is otherwise fully local: it makes no network calls beyond whatever the CLI and your own model server do.

## What every control does

| Control | Action |
|---|---|
| **Agent Stream** | Live mission cards — each ask-bar prompt is a real `loop run` with phase badges (architect → scout → builder → reviewer → scribe), streamed tail, and cancel |
| **Engine card / pill** | Engine health + one-click Start (best-fit model) / Stop |
| **+ New Agent** | Serve any GGUF → `lehrosol vault serve --model … --port … --apiKey …` |
| **Ask bar (⌘ /)** | Runs a HELIX mission; **live writes** = `--dryRun=false` (dry run is default) |
| **AI Suggestion** | Local model rewrites the open file; diff card; Apply writes to disk |
| **Test Bench (⚖)** | Serve → prompt → latency/tok/s per model + leaderboard |
| **Vault (▣)** | Vault models or native scan results; Rescan drives; Add folders to CLI vault; Serve/Test |
| **System Graph** | Vault · llama-server · adapter · loop · ENGRAM · web plane — click nodes to act; 5s live polling |
| **Terminal / Events / Output / Engine log** | Real shell; real event feed; streamed mission output |
| **Files / Search / Skills / Memory / Settings** | Project editing, project search, mission playbooks, ENGRAM, ports/keys/auto-start/CLI path |
| **⌘ K** | Command palette (Quick Start, Rescan Drives, Test Bench, …) |

## Footprint

The app is ~90 KB of source with zero runtime dependencies; Electron itself is the only heavyweight (one-time download). Model discovery scans are time- and entry-budgeted so they never thrash your disk; polling is one JSON snapshot every 5 s and can be paused from the graph header.

## Privacy

No telemetry, no analytics, no crash reporting. The app talks to your local CLI, your local model server, and the filesystem. If you set an API key in **Settings**, it is stored in the CLI's own config under `~/.lehro` and is never sent anywhere by this app.

## Repo layout

```
electron/    main process, preload, CLI bridge (the real app)
renderer/    UI — index.html, styles.css, app.js
scripts/     start.js — strips pnpm-injected NODE_OPTIONS before launching Electron
test-app/    node --test suite + QA harness for the bridge and cockpit
docs/        glossary.html — documentation, install walkthrough, troubleshooting
build/       icon.ico (packaging asset only)
```

Only `electron/`, `renderer/`, and `package.json` are shipped — see `build.files` in `package.json`. Everything else is source, tooling, or documentation.

## Maintainers

This project is maintained by **Lehro Solutions**.

- 🐛 **Bugs and feature requests** → [GitHub Issues](https://github.com/LehroSolutions/Lehrosol-Code/issues)
- 🔐 **Security vulnerabilities** → report privately per [SECURITY.md](SECURITY.md); please do **not** open a public issue
- 💬 **Questions and discussion** → [GitHub Discussions](https://github.com/LehroSolutions/Lehrosol-Code/discussions)
- 🧑‍💻 **Contributions** → see [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- 👥 **Credits** → [AUTHORS](AUTHORS)

## License

**Apache-2.0** · © 2026 Lehro Solutions — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

This project relicensed from GPL-3.0-or-later; the change is recorded in [CHANGELOG.md](CHANGELOG.md).
