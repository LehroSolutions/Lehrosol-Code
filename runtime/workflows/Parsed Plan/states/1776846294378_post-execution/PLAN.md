# Admin Hardening Plan

## Task 1: Shared primitives
- Files: `src/components/shared/DataTable.tsx`, `src/components/shared/ConfirmDialog.tsx`
- Goal: add loading skeleton support and await async confirm handlers safely
- Status: Complete

## Task 2: CRUD pages
- Files: `src/app/(admin)/projects/page.tsx`, `src/app/(admin)/categories/page.tsx`, `src/app/(admin)/users/page.tsx`, `src/app/(admin)/roles/page.tsx`, `src/app/(admin)/menus/page.tsx`
- Goal: standardize try/catch, success/error toasts, submit button loading UI, and async destructive confirms
- Status: Complete

## Task 3: Special-case pages
- Files: `src/app/(admin)/settings/page.tsx`, `src/app/(admin)/logs/page.tsx`, `src/app/(admin)/dashboard/page.tsx`
- Goal: harden save/seed flows and give logs an explicit loading-safe UX
- Status: Complete

## Task 4: Cleanup and validation
- Files: `src/lib/auth.ts`, `docs/plans/PROGRESS.md`
- Goal: remove unused import, run diagnostics, then record completion in progress tracking
- Status: Complete

## Validation Summary
- `npm run lint`: passes with warnings only
- `npm run build`: passes
