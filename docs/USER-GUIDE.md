# Lehrosol Code user guide

This guide covers the 2.4.2 desktop release candidate. The application's Help
opens the bundled [glossary](glossary.html); this guide and the changelog provide
additional workflow detail.

## Install and find the CLI

Lehrosol Code supports Windows 11 x64. Use its installer from a published
[official release](https://github.com/LehroSolutions/Lehrosol-Code/releases).
Check `SHA256SUMS` before running it. Unsigned builds can trigger Windows
SmartScreen. Install the paired CLI with Node.js and npm:

```powershell
npm install -g @lehrosolutions/cli@beta
lehrosol --version
lehrosol doctor
```

CLI 3.2 is recommended. In the desktop, open Settings and check the connected
version. If it is missing, choose Locate… and select the CLI's
`bin/lehrosol.js`. Restart after a PATH change if discovery is stale.

The CLI and desktop normally share `%USERPROFILE%\.lehro`. If you use
`LEHRO_HOME`, launch both with the same value. Environment variables must be set
in the launching process; copying `.env.example` does not make the desktop load
an `.env` file.

## Discover models and start an engine

Open Vault. The app reads registered CLI models and can scan common model
locations on your drives. Scan another folder if your GGUFs are stored
elsewhere, then add the discovered folders to the CLI vault. Model weights and
llama-server are separate prerequisites.

Choose a model rated GREAT where possible, and start it through Serve or the
engine control. TIGHT models can cause paging; NO FIT models exceed the app's
budget estimate. A rating is guidance, not a guarantee: inference context and
other applications also consume memory.

The first load can take minutes on a CPU system. Inspect Output and Events for
errors. Ensure the configured port and API key match the server. Stop the engine
when you want to free its memory. Settings → Auto-start engine is enabled by
default; disable it if you do not want a model started on launch.

## Open, edit, and save a project

Click the project selector, pick your project folder in the native dialog, and
open a file from Files. Tabs use the file path, so `src/index.js` and
`test/index.js` are distinct documents. Click Edit to use the text editor, then
save with Ctrl+S or the Save control. Dirty changes are preserved when switching
tabs and protected when closing a tab, changing projects, or closing the app.

If another program changes the file after you open it, saving can be refused
rather than overwrite the newer disk version. Preserve your draft, reopen the
file, and reconcile the changes. A failed write leaves the draft available for
recovery.

Large reads are bounded. A truncated file is a read-only preview; saving or
rewriting that preview would remove the unseen tail, so those operations are
blocked. Use an external editor for the complete file.

Search checks text in the files included by the bounded project tree. Generated
and excluded folders are not a complete search target. Use a repository search
tool when you need an exhaustive scan.

## Run a coding mission

Open the intended project and bring the engine online. Submit a plain-language
goal in the ask bar. The desktop runs the CLI's `code` lane with that project as
its working directory. Mission cards show streamed output, status, and changed
files; Output contains the longer stream.

**New profiles start with Live writes off.** The CLI receives `--dryRun` when
the toggle is off. Enable Live writes to permit project-file changes. **Allow
run** also defaults to off; turning it on permits project command execution.
The choices persist between launches, including older profiles' preferences.
Use a disposable project for your first test, and keep important projects under
version control or backed up.

Reasoning, resource profile, and context mode affect the CLI request. Compact
context can help with constrained hardware. Cancel a mission using its card.
Inspect output after cancellation or a failed mission; files written before the
stop are not automatically rolled back.

## Review an AI suggestion

Open a writable file and click AI Suggestion with the engine online. The app
requests a rewrite and displays the proposed change. Review it before Apply;
the model's output can be wrong even when the request succeeds.

A suggestion belongs to the exact file and original content used for the
request. Switching files, changing the draft, or changing the disk version can
invalidate it. A stale suggestion is refused instead of being applied to the
wrong file. If the full file cannot fit the suggestion context, a full-file
replacement is blocked. Reduce the file or use a tool that can work on selected
patches. A failed Apply keeps the proposal available; resolve the cause before
retrying.

## Benchmark models

Open Test Bench, select a model and preset or custom prompt, and run it. Review
the full output alongside latency, token count, and tokens/sec. A speed result
does not measure correctness. Comparing GREAT models can switch the active
engine and take substantial time on a CPU system.

The benchmark samples background CPU load and warns when the result may be
skewed. Close heavy applications and repeat only if the reading was affected.
Use representative held-out prompts for a quality comparison.

## Workspace, output, and model usage

Choose Create, Code, Debug, or Minimal from the workspace selector. Code places
the editor beside output; Views lets you pin navigation items, toggle panels,
and save named layouts. The composer stays available when panels are hidden.
The footer opens appearance controls for theme, accent, density, and font sizes.
Import/export shares layout and appearance only, excluding connection keys,
prompts, and project paths.

Output retains the most recent 300 events and 256,000 raw log characters per
mission. Use Answer, Activity, Raw, or Inspector to review results; search and
filter activity, open changed files, copy a report, or cancel a running mission.
Structured event details require the unreleased CLI instrumentation; the
published 3.2.0-beta.2 CLI retains readable plain-text output.

Model usage shows local measured counts from instrumented requests over the
last 30 UTC days. Desktop suggestions and benchmarks work with the published
CLI; recording CLI chats, coding missions, and HTTP adapters requires the
unreleased CLI changes. Unknown counts stay unknown. The bounded ledger reader
reports partial totals when a daily log exceeds 2 MiB. Active context comes
from engine metadata or tracked startup settings; native context is read from
GGUF metadata when the paired CLI provides it. Cumulative token usage does not
measure how full the current context is.

## Terminal, memory, and system status

The Terminal is a real PowerShell shell on Windows, running with your user
permissions in the selected project. Submit a command with Enter. After exit or
a creation failure, another command can start a fresh terminal. Terminal
commands are independent of the mission's Allow run setting.

Events records application activity. Output shows streamed CLI work. Memory
reads recent ENGRAM records from the CLI. Skills lists playbooks available to
missions. The System Graph displays the polled snapshot; pause polling when
desired. A missing or incompatible CLI command should be diagnosed using its
reported error and the connected version.

## Update Code and read what changed

Click Update in the top bar, Check for updates in Settings or About, or its
command-palette action. The request contacts GitHub only when you choose it.
The result displays the latest published stable version and its release notes
as text. Draft and prerelease candidates are excluded.

When a newer release contains the required Windows installer and checksum
asset, open its official download. Download `SHA256SUMS` too, verify the
installer hash, save your work, close the app, and run the installer. Updates do
not install themselves or restart the desktop. Updating Code leaves the CLI
unchanged; update it with the npm command separately when needed.

If no stable release is public, the app reports that state. Offline failures,
timeouts, and GitHub rate limits can be retried. A release without expected
assets cannot be offered as an installer update. These failures do not prevent
local editing or inference.

The dialog shows new-release changes before download, and includes the
installed version's bundled changes when it differs from the public release or
the request is offline. **Download checksums** opens the matching SHA256SUMS.

Registered Windows installations are detected and shown with their version,
scope, and location. Run the downloaded installer after closing Code. It reuses
the installation location, uninstalls the old application files, and installs
the update while retaining settings, projects, models, and shared CLI state.
Use the same installation scope for an in-place upgrade. Source and portable
folders are managed separately and are not automatically deleted.

## Settings and privacy

Settings controls theme, resource profile, engine port/key, auto-start, and the
CLI path. Ports must be whole numbers from 1 to 65535. Save settings to persist
them. A resource-profile change can restart the engine for the next mission.

No remote analytics or automatic crash reporting is configured. A local ledger
under Lehro home stores model identifiers, timestamps, token counts, and timing;
it excludes prompts and answers. Desktop preferences
are stored in its Electron profile; CLI state and keys are stored in Lehro
home. The engine receives its authentication key, and the CLI/adapters you
enable may contact other services. Clicking Update contacts GitHub. Redact keys,
paths, project content, and mission output before sharing diagnostic material.

## Troubleshooting

| Symptom | Recovery |
| --- | --- |
| CLI not connected | Install the CLI, restart after PATH changes, or use Settings → Locate…. |
| Blank or incompatible panel | Check the CLI version and error; update the CLI to the intended 3.2 release. |
| Engine unreachable | Check server startup output, port, key, available RAM, and model path. |
| Save or Apply refused | Preserve your draft; check permissions, disk changes, and whether the preview is truncated or proposal stale. |
| Terminal exited | Submit a new command to start a new shell; inspect errors if the shell could not start. |
| Slow benchmark | Inspect the CPU-load warning and other processes; choose a smaller supported model. |
| Update unavailable | Check connectivity, retry after rate limiting, or inspect the official Releases page. |
| Source launch exits with code 9 | Use `pnpm start`, whose launcher removes unsupported `NODE_OPTIONS`. |
| Installer packaging fails | Use the frozen pnpm lockfile and the hoisted/allowBuilds settings in `pnpm-workspace.yaml`. |

For a reproducible bug, include the Code version, CLI version, Windows version,
steps, expected result, and redacted error text in
[GitHub Issues](https://github.com/LehroSolutions/Lehrosol-Code/issues). Report
security problems through [SECURITY.md](https://github.com/LehroSolutions/Lehrosol-Code/blob/main/SECURITY.md).
