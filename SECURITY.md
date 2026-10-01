# Security Policy

Lehrosol Code is a local-first Electron desktop application. It runs entirely on
your machine, talks to your machine's filesystem and drives a real shell, and is
designed to work fully offline with zero cloud services.

That design has consequences, and they are the point of this document. **Read
the [Threat model](#threat-model) before reporting anything.** A large share of
reports we would otherwise receive are, by design, not vulnerabilities.

---

## Supported versions

This project has never been tagged or published to a distribution channel.
Everything below is the current development line; there are no prior releases
to support.

| Version | Supported          | Notes                                     |
| ------- | ------------------ | ----------------------------------------- |
| 2.4.x   | :white_check_mark: | Current `main` line; receives fixes       |
| < 2.4   | :x:                | Unreleased / superseded development state |

Once the project starts tagging releases, this table becomes the compatibility
contract and only the newest minor line will be supported.

---

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

### Primary channel: GitHub private vulnerability reporting

1. Go to the **Security** tab of
   <https://github.com/LehroSolutions/Lehrosol-Code>.
2. Click **Report a vulnerability**.
3. Submit the report through the private advisory form.

Reports filed this way open a private advisory visible only to you and the
maintainers, and are not indexed by search engines or public issue feeds.

> **Note on the reporting address:** this repository does not currently publish a
> dedicated security mailbox. GitHub's private vulnerability reporting is
> therefore the **only** verified channel, and it is the one to use. There is no
> `security@…` address here to guess at — we will not invent one, and please do
> not send security reports to an unverified address you find in a commit or an
> old file.
>
> <!-- MAINTAINERS: when a monitored security mailbox exists, add it here as a
>      secondary channel, e.g.
>      Email: <security-address@lehro.example>
>      Remove this comment when the address is live and monitored. -->

### What to include

Please include as much of the following as you can:

- **Type** — code injection, path traversal, IPC boundary bypass, privilege
  escalation, sandbox escape, information disclosure, DoS, supply chain.
- **Affected version** — the exact `2.x.y` from Settings → About, plus the
  commit SHA if you built from source.
- **Platform** — Windows version and build number, or Linux distribution. Node
  version if you built from source.
- **CLI version** — the output of `lehrosol --version`. Version-skew between the
  app and the CLI is a common source of confusing reports.
- **Reproduction** — exact steps, ideally from a clean profile and with a
  project folder that contains nothing sensitive.
- **Impact** — what an attacker actually gains, and what they need beforehand.
- **Logs** — the Engine log / Output pane contents from the Engine log tab if
  relevant. **Redact API keys, file contents, and model paths first.**

A proof of concept is welcome but a clear written description is enough.

### Response expectations

These are targets, not guarantees — this is a small, volunteer-run project.

| Stage                        | Target                     |
| ---------------------------- | -------------------------- |
| Acknowledgement              | 3 business days            |
| Initial triage (valid/invalid) | 10 business days          |
| Fix or mitigation plan       | 30 days from triage        |
| Disclosure                   | Coordinated with the fix; 90 days is the outer bound for anything not fixed |

If a report is declined, we will say why. If a report is accepted but not fixed
in 90 days, we will publish an advisory describing the issue and the workaround
anyway.

### What gets the fastest response

- Remote code execution reachable from **untrusted model output**, model weights,
  or a malicious GGUF sidecar.
- Any path that escapes the project root the user selected.
- Anything that turns a *rendered* string into *executed* shell input.
- Secrets or file contents leaking into the renderer or into a subprocess
  environment that should not have them.

---

## Threat model

### What the app is

Lehrosol Code is the desktop front-end of LehroSol. Its engine is the
[LehroSol CLI](https://github.com/LehroSolutions/lehrosol-cli) — a first-party
sibling repository, also Apache-2.0, not a third-party dependency. The app:

- scans your drives for GGUF model files and rates them against your RAM,
- shells out to `lehrosol … --json` for actions,
- talks HTTP to a llama.cpp-compatible engine you run,
- **spawns a real PowerShell or bash shell** (`term:create` in `electron/main.js`),
- streams agent missions that execute CLI work and write files,
- reads and writes files in the project folder you open.

### The security boundary that actually matters

The boundary is between **untrusted content** and **your machine's shell**.

Content enters the app from two directions:

1. **Trusted** — you, the files you open, the CLI you installed, the model you
   chose, the API key you typed.
2. **Untrusted** — text produced by a local model (suggestions, mission output,
   model names, test-bench output, chat completions) and anything rendered from
   it.

The renderer process must treat model-produced text as **data**, never as
instructions or markup to evaluate. Anything that breaks that — injecting shell
syntax that reaches `term:input`, rendering model output as HTML/script, or
turning a model-supplied path into a filesystem operation outside the project
root — is a real vulnerability.

### Explicitly NOT a vulnerability, by design

These are properties of the product. Reporting them wastes triage time and we
will close them as "working as intended":

- **The integrated terminal has full user permissions.** `term:create` spawns
  `powershell.exe -NoLogo` (or `$SHELL -i`) with `env: process.env` and the
  user's own privileges. Anything you can run in PowerShell, the app can run.
  We do not sandbox, restrict, or gatekeep it, and we do not intend to.
- **A malicious or compromised local CLI is a full compromise.** The app resolves
  and executes the CLI found on your machine. If that binary is hostile, so is
  everything the app does. This is a supply-chain problem on your machine, not a
  vulnerability in this repo.
- **Local file access is bounded by the project root you select.** The app reads
  and writes files in the folder you opened via the project picker. That is the
  intended feature. Reading files *outside* that root through the same IPC
  channel *is* a vulnerability.
- **Auto-start engine and live-write missions execute real work.** Missions run
  CLI agent loops that read the project and write files. That is what a mission
  is. Dry-run mode exists for preview; the default is the user's choice.
- **Local model output can be wrong.** Bad suggestions, hallucinated diffs,
  garbage in the System Graph. Quality, not security.
- **No cloud, no telemetry, no accounts** — and therefore no server-side
  vulnerability surface to attack. There is nothing to breach but your own
  machine.

### Known architectural risk notes

These are deliberate current-state facts, documented so that reports are judged
against reality rather than against an imagined architecture:

| Property                            | State        | Why it matters                                                                                       |
| ----------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| `contextIsolation`                  | **enforced** | Always `true` in `createWindow()`. The renderer cannot reach Node globals; the preload bridge is the only path. Do not relax this. |
| `nodeIntegration`                   | **disabled** | Always `false`. Do not relax this.                                                                   |
| `sandbox`                           | **off**      | `sandbox: false` in `webPreferences`. The renderer process is therefore not Chromium-sandboxed; the isolation boundary is `contextIsolation` plus the preload allowlist. Turning `sandbox` on is on the roadmap but is not yet done — treat renderer compromise as more likely than in a sandboxed app. |
| Renderer trust assumption           | **strong**   | We assume the renderer is not compromised. Every `ipcMain.handle` is a trust boundary and must validate its arguments. New handlers must not assume the caller behaved. |
| `window.open`                       | **blocked**  | `setWindowOpenHandler` denies in-app navigation and routes `http(s)` to the system browser. Keep it that way. |
| External links                      | **unverified** | Any `http(s)` URL opened via `shell.openExternal` is passed through unvalidated. URL handling hardening is open work. |
| Code signing                        | **absent**   | Windows installers are **not currently code-signed**. See "Reporters, please note" below. Signing setup is tracked in `.github/workflows/release.yml`. |

### Reporters, please note

- **Unsigned installers.** Windows will show SmartScreen warnings on
  first run of a downloaded build. That is a known gap, not a vulnerability. Do
  not report it as one — it is tracked as an engineering task.
- **No Electron auto-update.** Updates are manual by design while the project
  is pre-1.0. Dependabot keeps the pinned Electron range current; the actual
  runtime is whatever the built installer contains.

---

## Scope of testing

**Only test against machines you own or have explicit written permission to
test.** That includes every machine reachable from yours.

Additionally:

- **Do not exfiltrate data.** No reading, copying, encoding, or transmitting
  files, credentials, tokens, model weights, or browsing artifacts that are not
  yours. A proof of concept must be self-contained or use synthetic data you
  created.
- **Do not degrade service or damage state** outside your own test install.
  There is no server, so there is nothing to DoS — but do not go building one.
- **Do not use social engineering, physical access, or third-party accounts.**
- **Do not publish a working exploit for an unfixed issue.** Give us the window
  to ship a fix; the disclosure terms above say what happens if we miss it.
- **Do not fuzz the model engine itself.** Issues in llama.cpp or a GGUF file
  belong to those projects — report them there. Point us at how Lehrosol Code
  mishandles their output instead.
- **Prefer disclosure to the maintainers over public disclosure** until the
  coordinated timeline above has run its course.

---

## Hardening checklist for contributors

If you touch `electron/main.js`, `electron/bridge.js`, or `electron/preload.js`,
verify all of these before opening a PR:

- [ ] Every new `ipcMain.handle` validates its arguments and coerces types at the
      boundary. No `String(x)`-as-validation.
- [ ] Every filesystem operation resolves the path and confirms it stays inside
      the project root the user selected. Reject `..` traversal, absolute-path
      injection, and symlinks that point outside the root.
- [ ] `contextIsolation` stays `true`, `nodeIntegration` stays `false`, and the
      preload `contextBridge` surface is an explicit allowlist — never a blanket
      pass-through of `ipcRenderer`.
- [ ] No model-produced string is ever passed to a shell as part of a command
      line, or used to construct a path, or rendered as executable markup.
- [ ] Child processes are spawned with an argument **array**, never a shell
      string. `spawnCli` already does this; keep it that way.
- [ ] New subprocess environments do not leak secrets the path does not require.
- [ ] New outbound URLs are validated against an allowed scheme and host list.
- [ ] The renderer receives the minimum it needs; do not pass whole objects with
      extra fields into `ipcRenderer.send`.

`SECURITY.md` and `CONTRIBUTING.md` are part of your change set when you add an
IPC channel — if your PR introduces one and does not say how it is validated,
the CI-adjacent review will bounce it.

---

## Out of scope

- Vulnerabilities in **Electron or Chromium themselves** — report to
  [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
  and Chromium. Only report here how Lehrosol Code *misuses* their APIs.
- Vulnerabilities in the **LehroSol CLI** — a first-party sibling repository
  with its own process and its own advisory channel.
- Vulnerabilities in **model weights or GGUF parsing** — those belong to the
  model authors and to llama.cpp.
- Vulnerabilities in third-party npm dependencies with no Lehrosol Code-specific
  reachability path. Dependabot reports those automatically; feel free to
  escalate if reachability is in doubt.
- Missing hardening *without* a demonstrated impact, e.g. proposing `sandbox:
  true`, additional CSP strictness, or new headers. Those are improvements, not
  vulnerabilities. Open an issue.
