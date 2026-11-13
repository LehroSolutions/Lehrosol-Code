# 2.4.3 packaging decision and acceptance

The owner accepts unsigned distribution and requested shipment on `main`.
Code PR #11 and CLI PR #13 were merged, with clean CI on both main branches.
The 2.4.2 tag is retained as a failed local acceptance candidate; it is not moved
to different source or promoted as the replacement installer.

## Observed problem

The fully branded 2.4.2 payload passed clean Windows CI, installer lifecycle and
historical-upgrade checks. On Windows 11 Pro build 26200, its exact CI payload
failed both packaged smoke and a separate 120-second normal launch. All 74
runtime files matched the local candidate; this was not a transfer mismatch.
Avast containment evidence exists, but the causal interaction is not proven.

## Tested packaging change

Use the installed builder 26.18's supported `win.signAndEditExecutable: false`
and `disableAsarIntegrity: true` options to preserve the stock Electron binary.
This avoids executable resource changes for the intentionally unsigned build.
The application window, installer identity and interface remain branded.
Explorer properties for the executable retain upstream runtime metadata.

A controlled probe verified:

- Executable bytes equal the original Electron 45.3 runtime, SHA-256
  `207853646fd0553430706aee4d2ef1fac8a492cc32001dcec739598c89d8a492`.
- Application archive is identical to the original 2.4.2 candidate; all packaged
  application source and documentation bytes match.
- All 21 ASAR entries retain verified SHA-256 and block-integrity metadata.
- Fuse bytes equal the baseline. Embedded ASAR validation was already disabled.
- All 21 real packaged renderer/IPC workflows pass, including sandbox checks,
  files/save/conflicts, suggestions, missions/cancel/output, usage/context,
  layouts, terminal, updates, minimum window and cold reopening.
- Probe processes and disposable profile were cleaned up; the existing installed
  application and Windows security settings were not modified.

Evidence is retained under
`dist/release-c453104-review/probes/verification.json`,
`probes/smoke/packaged-smoke.json` and `probes/cleanup.json`.

## 2.4.3 release gates

Local metadata/syntax/link checks and all 83 regression tests pass after applying
the packaging configuration and version bump. The final versioned installer
must separately pass source and packaged workflows, install/upgrade/uninstall,
historical upgrade, source/payload identity and observed-signature checks in
the existing Release workflow. The release's `release.json`, `SHA256SUMS` and
matching QA receipts identify the accepted final artifact.

This change preserves the renderer sandbox, context isolation, IPC guards,
per-file archive hashes and build-time payload verification. It does not add
runtime ASAR enforcement or publisher signing. Broader clean consumer-machine,
all-user installer and representative model/hardware acceptance remains open;
the intended distribution is an explicitly unsigned release candidate.

Code's repository currently has private visibility. Publishing an internal
release does not change that visibility; public distribution needs an owner
decision about the source repository or a separate public distribution target.
