# Pull request

## What and why

<!-- What does this change, and what problem does it solve? The diff shows the
     what; this is the why. Link the issue it closes, if there is one. -->

Closes #

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would change existing behaviour)
- [ ] Refactor or cleanup (no behaviour change)
- [ ] Documentation only
- [ ] Build / CI / tooling

## Checklist

### Tests

- [ ] I ran `pnpm test` locally and pasted the real output below.
- [ ] I added or updated tests for the behaviour I changed.
- [ ] My change touches `electron/main.js`, `electron/preload.js`, or
      `renderer/app.js` — paths with **no existing automated coverage** — and I
      added coverage for it. *(See the coverage gap in CONTRIBUTING.md: the suite
      currently covers `electron/bridge.js` only. If this box does not apply,
      say so.)*
- [ ] I did not weaken, skip, or delete a test to make things pass.

**`pnpm test` output:**

```
<!-- paste the real output here, or write "could not run: <reason>" -->
```

### Security

- [ ] My change adds or modifies an IPC channel. If so, see below.
- [ ] I did not relax the renderer lockdown: `contextIsolation` stays `true`,
      `nodeIntegration` stays `false`, and the preload `contextBridge` surface is
      still an explicit allowlist.
- [ ] No model-produced string (suggestion, mission output, model name, chat or
      test-bench text) is passed to a shell, used to build a path, or rendered as
      executable markup.
- [ ] No new secrets, credentials, or `.env`-style files are committed, and no
      log or issue template I touched prints one.
- [ ] This change is **not** a security fix. If it is, I have reported it
      privately through `SECURITY.md` and am not opening a public PR for it.

**If you touched IPC —** `electron/main.js` or `electron/preload.js` — answer
these. A channel without this description will not be reviewed:

- Channels added or changed:
- Inputs each accepts:
- How each input is validated at the boundary:
- What filesystem or process scope the channel can reach, and how paths are
  confined to the selected project root:
- What happens on a validation failure:

### Compatibility

- [ ] Windows still works. This app is Windows-first.
- [ ] I did not break the Linux branches in `electron/bridge.js`
      (`which` vs `where`, `$SHELL` vs `powershell.exe`, the `.cmd` quoting
      shim).
- [ ] I did not add a runtime dependency. There are none by design — if I had to,
      I explained why above.
- [ ] `electron/bridge.js` still imports nothing from `electron`. That is what
      keeps it testable.
- [ ] If I changed `pnpm-lock.yaml`, I committed it.

### License and DCO

- [ ] My contribution is licensed under **Apache-2.0**, the same terms as the
      rest of the project (Apache-2.0 §5). Contributors keep their copyright in
      their work.
- [ ] I did not add a dependency under a licence incompatible with Apache-2.0.
- [ ] Any third-party code I copied in carries its original licence header and
      attribution, and is noted in `NOTICE` if it is redistributed.
- [ ] No CLA is required and no DCO sign-off is needed. *(Signed-off-by: is
      welcome but not enforced.)*

### Style

- [ ] I matched the surrounding code: plain CommonJS JavaScript, 2-space indent,
      LF, semicolons, single quotes, `'use strict';` at the top of each module.
- [ ] I commented the *why*, not the *what* — matching the existing notes on
      non-obvious platform behaviour.
- [ ] I added no demo content, seed data, or placeholder values that could be
      mistaken for real results. Every value on screen comes from the machine.
- [ ] I read `CONTRIBUTING.md` and `SECURITY.md`.

## Review notes

<!-- Anything a reviewer should know: what you deliberately left out, what you
     are unsure about, which parts you consider risky, what you would like
     reviewed most closely. -->
