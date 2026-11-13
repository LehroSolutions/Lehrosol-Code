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
- Exercise the actual Windows installer build and packaged app in pull-request
  CI so source-only success cannot approve an unusable desktop artifact.

Local validation: 79 desktop tests and 22 source Electron workflows passed
before this changelog update. The final source fingerprint will be rechecked
after the candidate is settled. Published CLI and real-engine evidence from the
initial review remains scoped as documented there.

## Native startup investigation

Disassembly at the reported Windows breakpoint identifies Chromium child-process
field-trial shared-memory initialization as the failing path. This refines the
initial observation that edited executables fail on this host; it does not
establish that the resource editor corrupts the executable. The same archive
and an unchanged runtime launch successfully. Native logging and a clean
GitHub-hosted Windows packaged smoke run are used to distinguish build defects
from local host interactions. Renderer sandboxing remains enabled.

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
