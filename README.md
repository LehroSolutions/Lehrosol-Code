# Lehrosol Code

**The agentic engineering IDE for local models.** Lehrosol Code is an Electron desktop app deeply integrated with the LehroSol CLI — the GUI drives the CLI, the CLI feeds the GUI, and they share one model vault, one engine, and one state home (`~/.lehro`). Zero-setup model discovery, one-click engines, HELIX agent missions, a model test bench, ENGRAM memory, and a live system graph — all running on GGUFs from your own drive. No cloud, no demo content: everything on screen is real.

> **Honesty note (kept from v2.0.0).** Earlier docs in this repo (`README-IMPLEMENTATION.md`) claimed a completed "Project Portal" implementation; that code never existed (`project-portal/` was empty). The real app is `electron/` + `renderer/` here. `LOGIN.md` contained plaintext credentials — rotate that password and delete the file.

## How the deep integration works

| Layer | Mechanism |
|---|---|
| Actions | The app shells out to `lehrosol … --json` (vault, serve, loop, engrams, gui) |
| Awareness | It reads the CLI's own state files: `~/.lehro/serve.json`, `config.json` |
| Engine | It talks HTTP to your llama-server: `/v1/models` pings, `/v1/chat/completions` benchmarks |
| Discovery | A native scanner finds GGUFs on your drives with no config, then registers those folders into the CLI vault (`vault add-root`) so both tools share one library |
| Sync (v2.4) | The bridge handshakes the CLI version (`--version`) and speaks the CLI v3.2 quick lane: `up` (one-click best-fit engine), `arena` (tok/s racing), `scan` (CLI-native discovery that registers roots), `engrams` (distilled memory — renamed from `engram` in v3.0), `recommend`, `doctor`, `adapters`, `modes` |

## Zero-setup models

On first launch the app checks the CLI vault; if it is empty (or the CLI is missing) it scans your PC automatically — `D:\AI Models`-style folders on every drive, Jan, LM Studio, HuggingFace cache, `~/models`, etc. — rates each model against your actual RAM (GREAT / TIGHT / NO FIT), and lists them in the Vault view. One click adds the discovered folders to the CLI vault; one click serves a model. With **Auto-start engine** on (default), the app resumes your last served model at launch, so your local AI is simply *on*.

## Model Test Bench (⚖)

Pick a model, pick a preset (code / reasoning / summarize / creative / custom), hit **Run**: the app serves the model if needed, sends the prompt, and records latency, tokens, and tokens/sec alongside the full output. **Run on all GREAT models** does a head-to-head comparison and keeps a leaderboard, so you can feel out every model on your drive in minutes.

## Run it (Windows)

```powershell
cd "D:\lehrosol code"
# Requires Node.js 22+ (LTS recommended)
corepack enable pnpm                # one-time; honors the pinned pnpm 11.15.1
# Alternative if Corepack is unavailable: npm i -g pnpm@latest-11
pnpm install                        # downloads Electron (one-time, needs internet)
pnpm start
```

- Tests: `pnpm test` · Installer: `pnpm dist` · Environment diagnosis: `pnpm doctor`
- This repo is **pnpm 11-managed** (`packageManager` pins `pnpm@11.15.1`; Node.js **22+** required). The first `pnpm install` creates `pnpm-lock.yaml` — commit it. `.npmrc` sets `node-linker=hoisted` so electron-builder can package the flat `node_modules`.
- Electron's binary-download script is pre-approved in `pnpm-workspace.yaml` (`onlyBuiltDependencies`) — the new home for pnpm settings; the old `"pnpm"` field in `package.json` is no longer read by pnpm 11, so no `pnpm approve-builds` prompt on fresh installs.
- `pnpm start` launches Electron through `scripts/start.js`, which strips pnpm-injected `NODE_OPTIONS` (e.g. `--use-system-ca`) that Electron rejects with exit code 9.
- CLI not on PATH? Settings → **Locate…** → pick `D:\lehrosol-cli\bin\lehrosol.js` (persisted), or set `$env:LEHROSOL_BIN`.
- No native modules — Microsoft Build Tools are **not** required.

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

## Repo layout

```
electron/    main process, preload, CLI bridge (the real app)
renderer/    UI — index.html, styles.css, app.js
test-app/    node --test suite + QA harness for the bridge and cockpit
runtime/     legacy swarm orchestrator CLI (kept)
skills/      60+ SKILL.md playbooks (kept)
config/      legacy cloud-oriented configs (superseded by the LehroSol CLI)
```

## License

GPL-3.0-or-later · Lehro Solutions
