# Build Quality Review & Fix Progress

**Started:** 2026-04-20
**Plan:** `2026-04-20-convex-react-migration-design.md`

## Status Legend
- [ ] Not started
- [~] In progress
- [x] Done
- [-] Skipped / N/A

---

## Step 1: Full Codebase Audit
- [x] Read all Convex backend files (14 files)
- [x] Read all React frontend files (30+ files)
- [x] Read all 4 custom skills
- [x] Read agent definitions and config
- [x] Document critical issues and warnings

---

## Step 2: Fix Critical Issues
- [x] Fix auth flow: Schema now uses `...authTables` from `@convex-dev/auth/server`, custom users table extends with optional fields
- [x] Fix auth flow: `convex/auth.ts` uses `afterUserCreatedOrUpdated` callback to assign role on signup
- [x] Fix auth flow: `seeding.ts` no longer inserts users with plaintext passwords — only seeds roles and menus
- [x] Fix auth flow: `users.ts` `create` mutation no longer sets `passwordHash`
- [x] Fix auth flow: All backend functions use `getAuthUserId(ctx)` from `@convex-dev/auth/server`
- [x] Fix auth flow: Login page uses `useAuthActions()` for `signIn`/`signOut`
- [x] Fix auth flow: Header uses `useAuthActions()` for `signOut`
- [x] Fix uploads.ts: `getUrl` changed from `mutation` to `query`
- [x] Fix FileUpload.tsx: Parse storageId as plain string with `res.text()`, not `res.json()`
- [x] Add `convex/tsconfig.json`
- [x] Add `convex/http.ts` with auth routes
- [x] Fix permissions.ts: Proper `Id<"users">` type instead of `as any`
- [x] `.env.local` set to `dev:` prefix for local development

---

## Step 3: Fix Warnings
- [x] Replace `Record<string, any>` with typed records in all update mutations
- [x] Replace custom dialog with Radix Dialog primitive (installed @radix-ui/react-dialog)
- [x] Replace custom dropdown-menu with Radix DropdownMenu primitive (installed @radix-ui/react-dropdown-menu)
- [x] Created select.tsx with Radix Select primitive (installed @radix-ui/react-select)
- [x] Created switch.tsx with Radix Switch primitive (installed @radix-ui/react-switch)
- [x] Created textarea.tsx component
- [x] Created tiptap-editor.tsx with Tiptap rich text editor + toolbar
- [x] Implement react-hook-form + zod on all form pages:
  - [x] news/page.tsx — react-hook-form + zod + Tiptap editor
  - [x] projects/page.tsx — react-hook-form + zod
  - [x] categories/page.tsx — react-hook-form + zod
  - [x] users/page.tsx — react-hook-form + zod
  - [x] roles/page.tsx — react-hook-form + zod + Switch components for permissions
  - [x] menus/page.tsx — react-hook-form + zod + tree hierarchy view
  - [x] settings/page.tsx — react-hook-form + zod + inline edit mode
- [x] Add Tiptap editor for news content
- [x] ActivityChart: Wired to `api.dashboard.getWeeklyActivity` real-time query
- [x] Menus page: Tree hierarchy view (recursive MenuTreeItem with expand/collapse, Folder/File icons, depth indentation)
- [x] Add 404 not-found page
- [x] Responsive sidebar with mobile drawer
- [x] Page-level Framer Motion transitions (PageTransition component with AnimatePresence)
- [x] ConfirmDialog.tsx updated for Radix Dialog primitives
- [x] Header.tsx updated for Radix DropdownMenu (DropdownMenuLabel, DropdownMenuSeparator, onSelect)
- [x] Fixed useConvexAuth import: moved from `@convex-dev/auth/react` to `convex/react` (in auth.ts, layout.tsx, Header.tsx)
- [x] Fixed Strike → Strikethrough in tiptap-editor
- [x] Fixed Zod v4 schema issues: removed `.optional().default()` pattern, using plain types with `defaultValues` in useForm instead
- [x] Fixed Sidebar icon resolution type error (LucideIcon type assertion)
- [x] Fixed PageTransition ease type error (`as const` for Framer Motion Easing)
- [x] Fixed tiptap-editor toolbar button types (ToolbarButton interface, heading attrs type assertion, dynamic chain call)
- [x] Fixed NEXT_PUBLIC_CONVEX_URL from `dev:frugal-mastiff-620` to `https://frugal-mastiff-620.convex.cloud`
- [x] All convex import paths converted to path aliases across 14+ files
- [x] next.config.ts uses turbopack.resolveAlias instead of webpack config
- [x] Admin hardening pass: `DataTable` loading skeletons, awaited async `ConfirmDialog`, guarded try/catch + toast flows on admin CRUD pages, settings, logs, and dashboard seed action

---

## Step 4: Code Review Gates
- [ ] Architecture gate
- [ ] Code quality gate
- [ ] Security gate
- [ ] Error handling gate
- [ ] Edge cases gate
- [ ] Testing gate

---

## Step 5: Build Verification
- [x] `npm run build` passes (TypeScript + Turbopack + static generation all clean)
- [x] `npx convex dev` connects and type-checks (user runs this)
- [-] Runtime orchestrator builds (not started, low priority)

---

## Changelog

| Time | Action |
|------|--------|
| 2026-04-20 19:48 | Audit complete, progress file created, starting critical fixes |
| 2026-04-20 20:25 | All critical issues fixed. Auth flow fully rewritten for Convex Auth. Schema uses authTables. All mutations use getAuthUserId. Uploads fixed. FileUpload fixed. .env set to dev mode. |
| 2026-04-20 22:00 | Step 3 major work: Radix UI primitives (Dialog, DropdownMenu, Select, Switch, Textarea), tiptap-editor, react-hook-form+zod on all 7 admin pages, PageTransition with Framer Motion, tree hierarchy on menus page, import fixes |
| 2026-04-20 22:55 | Build passes! Fixed: Id type in dataModel.d.ts, server.d.ts type stubs, Zod v4 schema compatibility (removed .optional().default()), useConvexAuth import in Header, Sidebar icon type, PageTransition ease type, tiptap toolbar types, NEXT_PUBLIC_CONVEX_URL to absolute HTTPS URL |
| 2026-04-21 00:00 | Admin hardening completed. Added `DataTable` loading skeletons and awaited confirm flows, wrapped admin create/save/delete actions with toast-backed try/catch, fixed lint-blocking typings, `npm run lint` now passes with warnings only, and `npm run build` passes. |
