# LehroSol Code follow-up release audit — 13 November 2026

Status: automated validation in progress; public publication is held until the
packaged and installation gates pass.

## Audit fixes

- Bind successful packaged smoke evidence to the executable hash as well as the
  application archive, and detect changes to either during the smoke run.
- Reject installer signature states other than Valid or explicitly NotSigned.
- Bound engine response bodies, handle interrupted HTTP transfers, reject
  malformed model lists/non-text completions, and normalize invalid model rows.
- Normalize corrupted saved layout data and preserve pending engine model
  selections across metric refreshes. Added regression coverage.
- Preserve Unicode split across CLI/HTTP chunks. Isolate each test worker's
  Lehro home so synthetic inference cannot write to the live usage ledger.
  Dispose test scratch folders
  and create sparse model fixtures so repeated Windows checks do not fill the
  temporary drive.
- Exercise the actual Windows installer build and packaged app in pull-request
  CI so source-only success cannot approve an unusable desktop artifact.

The first audited revision passed 79 desktop tests, 22 source Electron workflows,
and clean GitHub-hosted Windows/Linux CI, including the Windows installer build
and packaged application smoke. The final revision passed 82 desktop tests
locally and includes Unicode, test isolation, and fixture cleanup regressions.
It will be checked through candidate preparation on the clean runner.
Published CLI and real-engine evidence from the initial review remains scoped
as documented there.

## Native startup investigation

Disassembly at the reported Windows breakpoint identifies Chromium child-process
field-trial shared-memory initialization as the failing path. This refines the
initial observation that edited executables fail on this host; it does not
establish that the resource editor corrupts the executable. The same archive
and an unchanged runtime launch successfully. The fully branded installer and
packaged app pass on GitHub's clean Windows runner at revision c7ef350, so the
local startup failure is not reproduced there. This host's Avast autosandbox
log explicitly records "Result: Sandboxing" and instrumentation for the same
executables at the failed launch times. This explains why a host-specific
containment interaction must be distinguished from a packaging regression.
The initial review's resource-editing hypothesis is not established. Only
validated synthetic fixtures from this task were removed to recover temporary
disk space. No antivirus setting was changed, and renderer sandboxing remains
enabled.

Signing credentials are not configured locally or in the repository. The
candidate is expected to be explicitly unsigned until a signing identity is
configured. No signing identity, security exception, or disabled protection is
introduced as part of this audit.

## Public release conditions

The source and packaged workflow tests, isolated installation/upgrade/reopen/
uninstall checks, payload checks and release metadata preparation must pass for
the intended candidate. Historical-installer upgrades and Windows 10 acceptance
remain separately identified acceptance work. Publication is a separate action
from preparing and validating the candidate.
