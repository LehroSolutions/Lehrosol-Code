# LehroSol Code release check — 13 November 2026

This records the initial release review. The follow-up audit is tracked in
[RELEASE-AUDIT-2026-11-13.md](RELEASE-AUDIT-2026-11-13.md).
The initial local packaged-startup finding below has been superseded by clean
runner evidence and the host-containment investigation in that follow-up.

**Verdict: HOLD public release of v2.4.2.** Source-mode success does not establish
that the Windows application is usable after packaging. The normal packaged
startup and installed-application gates failed in this review.

## Blocking finding

The normal Windows executable does not produce a usable renderer in the
packaged smoke test or the isolated installed-app check. Windows Application
Error events record native exception `0x80000003`, including fault offset
`0x326b297` in the diagnostic executable variants. Page-target CDP times out at
`Runtime.enable`; the Playwright browser attachment also times out.

The same application archive launches and renders with the original Electron
runtime. A diagnostic package preserving the original executable bytes also
launches successfully. Packages with executable resource changes fail in the
tested environment. This narrows the investigation to executable transformation
and native startup; it does **not** prove an upstream library defect or exclude
a host-specific interaction. No Windows security setting was changed.

Diagnostic variants included Electron 45.3.0 with builder 26.18.0, builder
26.15.3, Electron 45.2.3, ASAR-metadata editing disabled, and all executable
editing disabled. The last variant succeeds only when the executable bytes
remain identical to the original runtime. These experimental configurations
are retained under ignored `dist/qa/`; they were not adopted as production
settings. Disabling only the ASAR metadata update did not fix the branded app.

Evidence: `dist/qa/native-crashes.json`, `dist/qa-final-packaged.log`,
`dist/qa/installation/installation.json`,
`dist/qa-final-archive-runtime.log`, and
`dist/qa/original-executable-probe/result.json`.

## Verified checks

| Check | Result and scope |
| --- | --- |
| Source syntax, metadata and local links | 28 JavaScript files passed; v2.4.2 metadata and documentation links passed. |
| Desktop tests | 77 passed, zero failures. Covers IPC, path confinement, file protection, updates, workflows and local usage. |
| Source Electron workflows | 21 passed, including actual renderer/IPC, file editing, suggestions, preview missions, cancellation, layouts, usage, terminal, updates, minimum window and reopening. Inference/CLI flows use disposable fixtures. |
| CLI full suite | 169 passed, zero failures, on the local CLI checkout. |
| Additional CLI usage regression run | Six passed, including the added null-ledger-row regression and structured mission events. |
| Published CLI compatibility | Seven contracts passed against `@lehrosolutions/cli@3.2.0-beta.2`, including a preview mission using a synthetic inference endpoint. |
| Published CLI archive integrity | SHA-512 SRI matches npm's registry metadata. |
| Actual local engine | Four checks passed with the existing 230M GGUF: startup, authenticated health, completion and stop. This does not establish coding quality or all hardware profiles. |
| Dependency install/audit | Frozen install passed; audit reported no known vulnerabilities in the candidate's dependency tree. |
| Installer build | Windows x64 NSIS build succeeded using Node's system certificate trust on this host. Current installer is **NotSigned**. |
| Package source contents | Current archive matches the packaged source files; installer payload extraction was exercised successfully. |
| Release failure gate | Preparation correctly rejects the failed packaged QA receipt. No approved release manifest/checksums were generated for this candidate. |

Logs and JSON receipts are under `dist/qa/` and `dist/qa-final-*.log`.
The final installer signature/hash observation is `dist/qa/final-signature.json`.

## Changes completed during this review

- Fixed desktop and CLI usage readers so a JSON `null` row cannot discard later
  valid requests; added regression coverage.
- Corrected smoke-test assumptions about output height on smaller displays and
  navigation to Settings after the new workbench workflows.
- Corrected installation QA module resolution, direct installer process launch,
  resume-directory handling, and process-tree cleanup on timeout.
- Bound source/packaged smoke receipts to current source fingerprints and the
  packaged archive. Release preparation now rejects stale/failed smoke and
  installation evidence, checks missing packaged source, and verifies installer
  archive/executable payloads against the smoke candidate before approval.
- Added Git revision, dirty-worktree status and runtime metadata to successful
  candidate preparation, and retained release QA diagnostics on workflow failure.
- Included the pending Actions version updates locally. Updated release notes,
  privacy documentation, workbench guidance and paired CLI documentation.

The related CLI event/usage/GGUF changes remain **unreleased**. The published
beta supports the documented fallback behavior; it does not contain the new
structured event/CLI usage contract. Publish those CLI changes under a new
version after their own release process; do not republish beta.2.

## GitHub and unfinished work

Repository: [LehroSolutions/Lehrosol-Code](https://github.com/LehroSolutions/Lehrosol-Code).
The local base matches remote main at `83852354c4fe19e39bc977fcc9ffa9a90f723c0b`.
GitHub has no public stable release; v2.4.1 remains a draft.

Seven PRs remain open. Their proposed dependency changes are represented in
the local candidate (Electron is newer than PR #10's proposal), but no PR was
merged or closed:

| PR | Proposed change | Review outcome |
| --- | --- | --- |
| [#1](https://github.com/LehroSolutions/Lehrosol-Code/pull/1) | pnpm action v6 | Included locally; exact candidate still needs GitHub CI. |
| [#2](https://github.com/LehroSolutions/Lehrosol-Code/pull/2) | checkout v7 | Old checks failed on Node 22.12/pnpm compatibility; local workflow retains Node 22.13. Needs fresh CI. |
| [#3](https://github.com/LehroSolutions/Lehrosol-Code/pull/3) | release action v3 | Included locally; publication path remains unverified. |
| [#4](https://github.com/LehroSolutions/Lehrosol-Code/pull/4) | setup-node v7 | Included locally; needs fresh CI. |
| [#6](https://github.com/LehroSolutions/Lehrosol-Code/pull/6) | builder 26.18.0 | Already in the local candidate; native packaging acceptance is blocked. |
| [#7](https://github.com/LehroSolutions/Lehrosol-Code/pull/7) | artifact action v7 | Included locally; needs fresh CI. |
| [#10](https://github.com/LehroSolutions/Lehrosol-Code/pull/10) | Electron 45.2.3 | Candidate uses 45.3.0; both tested edited-executable variants fail native startup here. |

The sibling CLI's fetched main is two commits ahead of the local checkout,
changing the separate dashboard's react-dom dependency. Its React peer-version
mismatch is recorded in `../lehrosol-cli/fix_plan.md`; that dashboard is not the
installed CLI package and was not certified by this review. Existing CLI
backlog items remain tracked there.

## Required before public release

1. Resolve the normal executable's native startup failure while retaining the
   intended packaging/signing behavior; rerun packaged smoke and full isolated
   install/upgrade/reopen/uninstall acceptance.
2. Commit the intended desktop/CLI changes separately, run Windows/Linux CI on
   those exact revisions, and rebuild the candidate from committed source.
   Current checks cover uncommitted local work, not a new GitHub revision.
3. Complete Windows 10 and historical-installer upgrade acceptance in disposable
   environments. The QA old-version fixture is current source with older
   metadata, not the historical release binary.
4. Record the signing decision and actual observed signature; the current
   installer is unsigned. Verify the intended paired CLI release/version.
5. Generate fresh release metadata only after all automated gates pass, review
   the matching draft/assets, and verify the public update endpoint after any
   eventual publication.

No commit, push, merge, tag or publication was performed. The dedicated QA
installation was removed and the existing real installation's file hashes
remain unchanged (`dist/qa/installation/recovery-final.json`). Old candidate
metadata was preserved under
`dist/qa/superseded-release-metadata-2026-11-13/` to avoid mistaking it for
approval of this rebuilt candidate.
