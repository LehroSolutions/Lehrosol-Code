# Release review — 13 November 2026, follow-up

**Decision: HOLD Code 2.4.2.** The owner accepts unsigned distribution and has
authorized commit/push when Code is release ready. Signing is not a blocker.
The exact current Windows 11-only package still fails its runtime gate on this
Windows 11 Pro workstation (build 26200). No Code commit, push, tag or public
release was performed in this follow-up.

## Fresh checks

- `node scripts/check.mjs`: 30 JavaScript files, release metadata and local
  documentation links passed.
- `npm test`: 83 tests passed, zero failures.
- Source smoke: failed waiting for the application index page (30-second
  navigation timeout); no workflow checks completed.
- Packaged smoke using `dist/windows11-release/win-unpacked`: failed attaching
  to the renderer over CDP (30-second timeout); no workflow checks completed.
  Diagnostics recorded an empty/loading window. The failure is consistent with
  the prior host investigation, but this run does not prove its cause.
- The packaged attempt also encountered EPERM cleaning its disposable profile;
  this is recorded separately from the renderer failure. Security settings and
  the real installed application were not changed.

Logs: `dist/qa/review-source.log`, `dist/qa/review-packaged.log` and
`dist/release-review-tests.log`. Fresh machine-readable receipts are under
`dist/qa/review-2026-11-13/`.

## Exact packaged candidate

Source fingerprint:
`3bd7efe265f40b9c6bb2a1e8507e3bcd2d40e3cbe0c45764c7f756473c6d9a5e`.

Application archive SHA-256:
`c3505c48ef03b21dabe61d8299365d0275b70395045ea38f9fb410755370b0a2`.

Executable SHA-256:
`a6fcee12b8f9447204e483c082002e3530785fb090a90dd71cb538d790bb3fde`.

Earlier clean-runner successes cover their own recorded bytes and environments;
they do not override these current failures. A fresh candidate needs a usable
renderer plus the documented Windows 11 installation/upgrade/reopen/uninstall
checks before promotion. The CLI's independent review and push do not establish
desktop acceptance. Existing PR #11 remains available for review.
