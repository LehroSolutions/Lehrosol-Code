# Contributing to Lehrosol Code

Thanks for looking at this. This is a small, Windows-first Electron app with
zero runtime dependencies, and the bar we are trying to hold is *"make it more
honest and more solid"* rather than *"make it bigger."*

Read this whole file before your first PR. It is not long.

---

## What this project is

**Lehrosol Code is the agentic engineering IDE for local models.** It is the
desktop front-end of LehroSol:

- A **model vault** that finds GGUF files on your drives with no configuration,
  rates them against your actual RAM, and serves them.
- **Agent missions** — the CLI's hands-on `code` lane streamed as mission cards.
- A **live system graph** of vault, engine, adapters, loops and ENGRAM memory.
- An **editor with AI suggestions** powered by your own local model.
- An **integrated terminal** — a real shell, not a simulation.
- A **model test bench** for latency and tokens/sec across the models you own.

It runs local GGUF models through a llama.cpp-compatible HTTP engine. Local
editing and inference work offline once prerequisites are installed. The
on-demand Update controls contact GitHub for public release metadata.

### It is one product across two repositories

LehroSol has one engine and three front-ends. This repo is the desktop one:

| Front-end                        | Repository                                  | License    |
| -------------------------------- | ------------------------------------------- | ---------- |
| **Lehrosol Code** (desktop IDE)  | `LehroSolutions/Lehrosol-Code` (this repo)  | Apache-2.0 |
| **LehroSol CLI** (the engine)    | `LehroSolutions/lehrosol-cli`               | Apache-2.0 |
| Web dashboard                  | `lehrosol-cli/gui/` — separate source client | Apache-2.0 |

The CLI is the engine and the source of truth: it owns the loop, the harness,
the orchestrator, the MCP control plane, and the `~/.lehro` state home. This app
is a cockpit over it. **Both halves are first-party and Apache-2.0** — treat the
CLI as part of this product, not as a vendored third-party dependency.

`electron/bridge.js` is the integration seam. It works two ways:

1. **Actions** — it spawns `lehrosol … --json` for vault, serve, loop and
   snapshot operations.
2. **Awareness** — it reads the CLI's own state files (`~/.lehro/serve.json`,
   `~/.lehro/config.json`) so the GUI sees servers and adapters even when no
   command is running.

The CLI is resolved at runtime in this order:

1. `LEHROSOL_BIN`, if set and the path exists.
2. `lehrosol` on `PATH` (`where` on Windows, `which` elsewhere).
3. A small list of fallback install paths (`D:\lehrosol-cli\bin\lehrosol.js`,
   `~/lehrosol-cli/bin/lehrosol.js`).

The bridge **warns** — it does not enforce — when the connected CLI is older
than the flags the app wants to send. Please keep it a warning. Hard-failing on
version skew makes the app unusable in offline setups, which is the whole point.

**Contributions that touch CLI behaviour belong in the CLI repo** unless they
are purely about the GUI's side of the contract.

### Shared invariants — duplicated on purpose, watch for drift

Because the CLI is first-party, two things exist in **both** repos. Neither is
enforced by a tool, so a change to one side can silently desync the other:

| Invariant                | CLI                                | This app                          | Notes                                                                    |
| ------------------------ | ---------------------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| **Path confinement**     | `src/core/pathSafety.js` → `assertInsideRoot()` | `electron/pathConfinement.js` → `resolveInside()` | Both jail writes to the project root. The CLI's throws `PathSafetyError` for one root; ours returns `{ok,error}` and supports several roots plus symlink resolution. **Keep them behaviourally aligned.** The CLI treats weakening `pathSafety.js` as a security regression, not a refactor. |
| **Built-in skills**      | `src/core/skills.js` → `BUILTIN_SKILLS` (9 skills, canonical) | `renderer/app.js` `renderSkillsView()` (hardcoded copy) | The CLI is canonical. The renderer comment calls itself a *mirror*. **Adding or renaming a skill means editing both repos.** |

If you change either side, open the matching change in the other repo in the
same PR or note it in the description.

---

## Prerequisites

| Requirement | Version   | Notes                                                                 |
| ----------- | --------- | --------------------------------------------------------------------- |
| Node.js     | **22.13.0+** | Enforced in `package.json` `engines`.                              |
| pnpm        | **11**    | Pinned by `packageManager: pnpm@11.15.1`. **Use this exact version.**  |
| OS          | Windows 10/11 x64 | Supported desktop target. Linux bridge tests run in CI.          |

Enable pnpm through Corepack so the pinned version is used automatically:

```powershell
corepack enable pnpm
```

If Corepack is unavailable: `npm i -g pnpm@11.15.1`.

**Do not use plain `npm install`.** The repo depends on a hoisted
`node_modules` layout — `pnpm-workspace.yaml` sets `nodeLinker: hoisted` because
electron-builder cannot follow pnpm's default symlinked tree. No native modules
are used, so Microsoft Build Tools are **not** required.

---

## Development setup

```powershell
corepack enable pnpm          # one-time
pnpm install                  # downloads the Electron binary; needs internet once
pnpm start
```

`pnpm start` runs `node scripts/start.js`, which strips pnpm-injected
`NODE_OPTIONS` flags (for example `--use-system-ca`) that Electron rejects with
exit code 9. **Do not replace it with a bare `electron .`** without preserving
that behaviour.

Electron's postinstall is approved through `allowBuilds` in
`pnpm-workspace.yaml`.

If the CLI is not found: Settings → **Locate…** → pick
`D:\lehrosol-cli\bin\lehrosol.js`, or set `$env:LEHROSOL_BIN`.

---

## Testing

```powershell
pnpm test
```

That runs `node --import ./test-app/setup.mjs --test "test-app/*.test.js"` — Node's built-in test runner, no
test framework to install.

### Verify the behavior you change

The Node suite exercises the CLI bridge, Windows command spawning, JSON/error
contracts, engine requests, model scanning, filesystem confinement, update
metadata, and covered renderer workflows. `pnpm check` checks source syntax and
release consistency. `pnpm smoke` exercises the actual Electron application and
preload/IPC using temporary state and a synthetic engine.

Add focused regression coverage when changing a workflow or trust boundary.
Synthetic engine output does not prove model quality, actual GGUF startup,
Windows 10 installer behavior, or every application state. Record those limits
and complete the release acceptance checks in [RELEASING.md](RELEASING.md)
before publication. Check the packaged application as well as source mode.

Do not weaken or delete a failing test to get to green. Fix the cause or say
loudly that it is broken.

The preload gives every test worker an isolated temporary `LEHRO_HOME` and
cleans it up on exit. Include it when invoking Node's test runner directly, so
synthetic requests cannot write to your real usage ledger. Model fixtures are
sparse on Windows and their temporary directories are removed after the suite.

There is also a manual QA harness in `test-app/` (`harness.html` plus the
`harness-*.js` drivers) for exercising the bridge and the cockpit in a browser.
It is a developer aid, not part of `pnpm test`.

### No linter or formatter is configured

There is no ESLint, Prettier, or Biome in this repo today. Until one is added,
match the surrounding code exactly: **2-space indent**, no tabs, semicolons,
single quotes, trailing commas only where the file already has them, and `'use
strict';` at the top of every CommonJS module.

### CI

`.github/workflows/ci.yml` runs on every push and pull request across
`windows-latest` and `ubuntu-latest` (Windows is the primary target). It installs
the pinned pnpm, runs `pnpm install --frozen-lockfile`, then `pnpm test`.

**If you touch `pnpm-lock.yaml`, commit it.** `--frozen-lockfile` will fail the
build otherwise.

---

## Building an installer

```powershell
pnpm dist
```

That is `electron-builder --win`, producing an NSIS installer in `dist/`.

- **Windows is the only configured target.** The `build.win` block sets the NSIS
  target and `build/icon.ico`.
- Only `electron/**`, `renderer/**` and `package.json` are packaged
  (`build.files`).
- **Code signing is not configured.** The output is unsigned and will trigger
  SmartScreen on first run. See `.github/workflows/release.yml` for what has to
  be set up before signing is real. Do not describe a build as signed when it is
  not.
- `build/*` is gitignored except `build/icon.ico`, and `dist/` is ignored.

---

## Repository layout

```
electron/    main process, preload, CLI bridge, path confinement  (the real app)
renderer/    UI — index.html, styles.css, app.js
test-app/    node --test suite + manual QA harness
scripts/     start.js (Node-options shim for Electron)
docs/        glossary.html — the install + troubleshooting reference
```

Earlier revisions also carried `skills/` (a vendored third-party playbook
corpus), `runtime/` (a superseded TypeScript swarm orchestrator), `workflows/`,
`agents/`, and `config/`. None of them shipped or were referenced by the app —
the app's `build.files` has only ever been `electron/**`, `renderer/**`, and
`package.json`. They were removed during the Apache-2.0 preparation because
their licenses could not be accounted for. Do not reintroduce vendored third-party
content without recording its upstream, version, and license.

**Windows-first, but not Windows-only.** The bridge has explicit POSIX branches
(`which` vs `where`, `$SHELL` vs `powershell.exe`, no `.cmd` quoting shim). Keep
them working; CI runs Linux to keep that honest.

---

## Coding conventions

- **Plain JavaScript, CommonJS.** No TypeScript, no bundler, no transpiler in
  `electron/` or `test-app/`. `main` is `electron/main.js`.
- **Zero runtime dependencies.** Everything the app needs at runtime is a Node
  builtin. That is what keeps `pnpm install` fast and the app offline-capable.
  Do not add a runtime dependency without saying why in the PR.
- **`bridge.js` must stay pure Node — no Electron imports.** That is exactly
  what makes it unit-testable under `node --test`. Keep it that way.
- **2-space indent, LF line endings, trailing newline.** `.editorconfig` and
  `.gitattributes` enforce this.
- **Arguments cross the IPC boundary as arrays, never shell strings.** `spawnCli`
  already handles the `cmd.exe` re-parsing problem; do not route around it.
- **Comment the *why*, not the *what*.** The existing code comments non-obvious
  platform behaviour and past bugs (see the `cmd.exe` quoting note and the
  `v2.0.0` timeout note in `bridge.js`). That is the house style. Match it.
- **Do not add demo content, seed data, or placeholders that look like real
  results.** Every value on screen must come from the machine. This is a
  standing product rule.
- **Do not reintroduce `LOGIN.md`-style credentials.** There is no login, no
  account, and no server. Nothing in this app should ever hold a secret on disk
  that a user could paste into a bug report.

---

## Security expectations for IPC changes

**This is the highest-risk part of the codebase. Please read it before you write
an `ipcMain.handle`.**

Every `ipcMain.handle` in `electron/main.js` is a trust boundary. The renderer
is assumed to be *well-behaved*, not *trusted* — a compromised renderer should
not be able to turn it into arbitrary code execution.

### Rules

1. **Validate the sender.** Do not assume only our own window can reach a
   channel.
2. **Validate arguments at the boundary.** Coerce types explicitly. `String(x)`
   is not validation. Reject anything that is not the shape you expect.
3. **Confine every path.** Any path arriving from the renderer must be resolved
   and confirmed to stay inside the project root the user selected. Reject
   `..` traversal, absolute-path injection, and symlinks that escape the root.
   `project:read` / `project:write` are exactly the shape of code where this is
   easy to get wrong — think about it before you add a sibling.
4. **Never pass model-produced text to a shell.** Text from a local model —
   suggestions, mission output, model names, chat completions, test-bench
   output — is **data**. It must never become part of a command line, a path, or
   executable markup.
5. **Spawn with an argument array**, never a shell string.
6. **Keep the preload allowlist explicit.** `electron/preload.js` uses a named
   `contextBridge` allowlist. Never blanket-forward `ipcRenderer`.
7. **Send the minimum the renderer needs.** Do not pass whole objects with
   extra fields across `webContents.send`.
8. **Do not relax the renderer lockdown.** `contextIsolation: true` and
   `nodeIntegration: false` and `sandbox: true` are enforced.

### If your PR adds or changes an IPC channel

Your PR description must state, in your own words:

- what inputs the channel accepts,
- how each input is validated,
- what filesystem or process scope it can reach,
- and what happens on a validation failure.

A new IPC channel with no such note will not be merged. If your change touches
`main.js`, `bridge.js`, or `preload.js`, say explicitly in the PR whether you
consulted the checklist in `SECURITY.md`.

The update IPC accepts no caller-supplied feed URL. Metadata comes from the
fixed official repository, notes are text, and download URLs must match its
approved release path/version and asset rules. Help accepts only the bundled
document allowlist. Keep both restrictions when adding controls. Update checks
must remain user-initiated and must not install or restart the app silently.

### Reporting vulnerabilities

**Do not use public issues or PRs for security problems.** Use the private
channel in [`SECURITY.md`](./SECURITY.md). If you find a vulnerability while
fixing something else, stop, report it privately, and wait for guidance before
the fix lands.

---

## Pull requests

1. Open an issue first for anything larger than a bug fix, so we can agree on
   the direction before you write it.
2. One concern per PR. Do not mix a refactor with a behaviour change.
3. Fill in `.github/PULL_REQUEST_TEMPLATE.md` honestly — especially the
   "not tested / not applicable" boxes.
4. Run `pnpm test` and paste the real output. If you could not run it, say so
   and say why.
5. Match the existing style. Reviewers will ask for reformatting otherwise.
6. Describe the *why* in the PR body. The diff already shows the *what*.

---

## Reporting bugs

Use the bug report issue template. It asks for the app version, OS, the CLI
version, and steps to reproduce. **Redact API keys, model paths, and file
contents** before pasting logs — bugs are public.

---

## License and DCO

- This project is licensed under **Apache-2.0**. The full text is in
  [`LICENSE`](./LICENSE); attribution requirements are in [`NOTICE`](./NOTICE).
- By opening a pull request you agree that your contribution is licensed under
  **Apache-2.0**, the same terms as the rest of the project (Apache-2.0 §5).
  Contributors keep their copyright in their work; they grant the project the
  same broad licence everyone else gets.
- **No CLA. No separate DCO signature required.** Signing off a commit with
  `Signed-off-by:` is welcome but not enforced.
- By contributing you also agree to the
  [Code of Conduct](./CODE_OF_CONDUCT.md).
- Do not add dependencies under a licence incompatible with Apache-2.0, and do
  not copy in third-party code without its licence header and attribution.

---

## Getting help

There is no Discord and no support SLA. Open an issue. If you are stuck on the
CLI side of the integration, read the CLI repo's `docs/` first — the full docs
set starts at `docs/README.md` there.
