# Project Portal Admin Hardening

## Problem
Several admin pages still rely on optimistic happy-path UI behavior. Create and delete flows do not consistently catch mutation failures, list views do not show an explicit loading state, and the shared confirm dialog closes before async destructive work resolves.

## Solution
Strengthen the shared table and confirm primitives, then update the affected admin pages to:
- show explicit loading UI while list data is unresolved
- wrap create/save/delete actions in try/catch with user-visible toasts
- await destructive confirm actions before closing the dialog

## Architecture
- Shared primitive changes live in `src/components/shared/DataTable.tsx` and `src/components/shared/ConfirmDialog.tsx`
- Page-local mutations remain local to each admin route
- Success and failure feedback use Sonner toasts only in client components

## Acceptance Criteria
- [x] `DataTable` accepts `isLoading` and renders skeleton rows
- [x] Projects page uses try/catch, async confirm, and loading state
- [x] Categories page uses try/catch, async confirm, and loading state
- [x] Users page uses try/catch, async confirm, and loading state
- [x] Roles page uses try/catch, async confirm, and loading state
- [x] Menus page uses try/catch and async confirm
- [x] Settings page uses try/catch in save flow
- [x] Logs page exposes loading-safe table behavior and a toast-backed guarded details action
- [x] Dashboard seed action is wrapped in try/catch
- [x] `src/lib/auth.ts` no longer imports unused `PERMISSIONS`

## Validation
- `npm run lint` passes with warnings only
- `npm run build` passes

## Security
- Do not bypass existing permission guards
- Keep auth-derived user identity server-side through current Convex mutations
- Do not leak raw errors without user-friendly framing
