# Project Portal Context

## Tech Stack
- Frontend: Next.js 16 App Router + React 19 + TypeScript
- Backend: Convex + Convex Auth
- Forms: react-hook-form + zod
- UI: custom primitives on top of Radix, Tailwind CSS, Sonner toasts

## Project Structure
- `project-portal/src/app/(admin)/*/page.tsx`: admin surfaces for CRUD and dashboard views
- `project-portal/src/components/shared/*`: reusable table, dialog, permission, and transition helpers
- `project-portal/src/lib/*`: auth hooks, constants, utilities
- `project-portal/convex/*`: schema, queries, mutations, auth, seeding

## Current Conventions
- Admin pages are client components using `useQuery` and `useMutation`
- CRUD pages use a shared `DataTable` for list views and `ConfirmDialog` for destructive actions
- User-facing mutation failures should surface via Sonner toasts
- Loading states should avoid layout jumps and use inline spinners or table skeletons

## This Pass
- Harden repeated admin page mutation flows with try/catch, toasts, and loading states
- Add `isLoading` support and skeleton rows to `DataTable`
- Make destructive confirms await async handlers before closing
- Remove the unused `PERMISSIONS` import in `src/lib/auth.ts`
