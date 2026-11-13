# LehroSol Code release audit — 13 November 2026

**Replacement packaging:** [2.4.3 acceptance](RELEASE-2.4.3-ACCEPTANCE.md)
records the stock-runtime configuration that passed all 21 workflows on the
Windows 11 host. The 2.4.2 findings below remain historical evidence for those
candidate bytes.

**Latest follow-up:** [RELEASE-REVIEW-2026-11-13.md](RELEASE-REVIEW-2026-11-13.md)
records fresh failures against the Windows 11 documentation candidate and the
owner's accepted unsigned release policy. The earlier candidate evidence below
is historical; it does not approve the current local package for publication.

**Verdict: automated candidate gates passed; ready for review.** Public
promotion still requires the Windows 10/11 desktop acceptance recorded in
`RELEASING.md`. The prepared installer is explicitly unsigned. Nothing was
merged, tagged, published to npm, or promoted to a public GitHub Release.

## Changes audited and corrected

- Full-size mission answers/activity/raw output, saved layouts, appearance,
  measured token usage, model context, engine inspection, bundled help and
  verified update links are included in 2.4.2.
- Bound engine response bodies, handle interrupted transfers, reject malformed
  model lists/non-text completions, and preserve Unicode across CLI/HTTP chunks.
- Skip malformed/null usage rows without losing later requests. Usage ledgers
  store measured counts/model/timing locally and exclude prompts and credentials.
- Normalize corrupted saved layouts and preserve pending model selections across
  metrics refreshes. Preserve drafts and refuse stale or truncated-file writes.
- Fix trusted-page comparisons for canonical Windows installation path aliases,
  discovered while launching the exact historical upgrade. The same top-level
  frame restriction remains enforced; other documents and remote URLs reject.
- Require current-source smoke and installation receipts, tested archive and
  executable hashes, exact installer payload bytes and valid/explicitly unsigned
  Authenticode status before preparing release metadata.
- Isolate each test worker's Lehro home; dispose scratch folders and create sparse
  Windows model fixtures so repeated tests cannot fill the temporary drive.
- Exercise branded Windows builds and packaged workflows in pull-request CI.
  The signature helper explicitly imports native PowerShell modules.
- The sibling CLI beta.3 adds desktop mission events, usage CLI/MCP and GGUF
  context metadata. Its audit also corrected release-checksum validation and the
  separate dashboard's React peer mismatch.

## Verified evidence

| Gate | Result and scope |
| --- | --- |
| Desktop regression tests | 83 passed, zero failures, locally and in clean Windows/Linux CI. |
| Source application | 21 renderer/IPC workflows passed on clean Windows; 22 locally including the live update endpoint. |
| Packaged application | 21 workflows passed with sandboxing enabled: files/save/conflicts, suggestions, missions/cancel/output, usage/context, layouts/appearance, terminal/restart, help, updates, settings, minimum window and cold reopening. Packaged screenshots reviewed. |
| Installer lifecycle | Six checks passed: current-user install at a path with spaces, dedicated registration, upgrade, stale-file removal, saved settings and profile retention, reopen and uninstall. The routine old fixture uses current source with 2.4.1 metadata. |
| Payload and metadata | Installer archive and executable match the smoke-tested payload; current-source fingerprint, clean Git revision, hashes, runtime/tool versions, documentation and signature status recorded. |
| Historical upgrade | Exact 2.4.1 installer launch, saved settings, upgrade to the candidate bytes, stale-file removal, upgraded launch and uninstall are checked by the release workflow on Windows Server 2022. |
| Dependency audit | Desktop complete build-tool audit and CLI/dashboard production dependency audits report no known vulnerabilities. |
| CLI regression tests | 171 passed on each of Windows and Linux. Dashboard production build passed. |
| CLI package | Exact beta.3 archive passed release/prepack/docs/integrity/install-smoke gates, then seven separately installed desktop contract checks. Published beta.2 also passed seven compatibility contracts. |
| Actual inference | Beta.3 passed real GGUF discovery/startup, authenticated health, completion and stop using the existing 230M model. This establishes API operation, not coding quality or broad hardware acceptance. |

Evidence links:

- [Code candidate build, packaged smoke, installation and payload verification](https://github.com/LehroSolutions/Lehrosol-Code/actions/runs/43389912840).
- [Code Windows/Linux CI](https://github.com/LehroSolutions/Lehrosol-Code/actions/runs/43389922412).
- [Historical installer acceptance](https://github.com/LehroSolutions/Lehrosol-Code/actions/runs/43389912840).
- [CLI Windows/Linux CI](https://github.com/LehroSolutions/lehrosol-cli/actions/runs/43386679231).
- [CLI beta.3 archive preparation](https://github.com/LehroSolutions/lehrosol-cli/actions/runs/43386680209).
- [Code pull request](https://github.com/LehroSolutions/Lehrosol-Code/pull/11) and
  [CLI pull request](https://github.com/LehroSolutions/lehrosol-cli/pull/13).

## Candidate identity

The desktop `windows-installer` artifact from run 43386206151 contains
`Lehrosol.Code.Setup.2.4.2.exe`, `SHA256SUMS`, `release.json`, generated notes and
QA receipts. Its application source revision is
`d17a081462616e5b9ff406173a2f1449fb545f66`; subsequent commits change only QA
scripts/workflows and root review documentation. The packaged source fingerprint
is `3eb992863f22a21b03650b7453e49593b5d5d7bae3304f829130252655bc811c`.
Use that verified artifact, rather than earlier local diagnostic installers.
Read the exact installer SHA-256 from its accompanying `SHA256SUMS` and
`release.json`. Earlier candidates are superseded by the canonical-path fix.

The exact CLI candidate is `lehrosolutions-cli-3.2.0-beta.3.tgz` from run
43386680209, revision `abe6444701f814119ae182d8ebd9c30bfe444098`, SHA-256
`5a31de5bf5b449dadac30a7e5157c2228bfd9c43cff9fe79b3b39874843999fc`.
It has not been published; npm's beta channel still needs independent promotion
when the release is authorized.

## Local startup investigation and acceptance limits

The initial review's hypothesis that executable resource editing broke packaging
is not established. Disassembly locates the Windows breakpoint in Chromium
child-process field-trial shared-memory initialization. This workstation's Avast
autosandbox log explicitly records sandboxing/instrumentation for the same
executables at the failed launch times. Fully branded application and installer
checks pass on clean GitHub Windows runners. No antivirus setting or renderer
protection was changed, and the developer's installed Code copy was preserved.

Clean hosted Windows Server 2025 lifecycle/workflow checks and Server 2022
historical acceptance are distinct from direct Windows 10/11 desktop checks.
Complete the declared desktop matrix before public promotion, including
representative model/hardware and antivirus behavior. No signing credentials are
configured: `NotSigned` is an observed property, disclosed in the release notes;
checksums identify bytes and do not establish publisher trust. Existing unrelated
CLI backlog remains in `fix_plan.md` and is not represented as completed here.

The final local source run passed all 21 workflows. An optional live-update run
encountered a transient `ENOTFOUND api.github.com`; the app reported its offline
state correctly. The live check had passed earlier in this audit. This is
separate from the deterministic update-state regression gates.
