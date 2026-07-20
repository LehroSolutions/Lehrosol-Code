# LehroCode Portal — Convex + React Migration Design

**Date:** 2026-04-20
**Status:** Approved
**Approach:** Full Rewrite (Approach A)

---

## Context

The LehroCode Project Portal currently runs a Flask backend with SQLite and a Vue 3 + Arco Design frontend. The application has never been run (empty database, broken components, fake data). Rather than fixing incremental issues, we are doing a full rewrite to Convex + React.

**Why:**
- Flask + SQLite requires manual deployment, Docker configuration, and operational overhead
- Vue + Arco frontend has broken components (missing Breadcrumb), hardcoded chart data, and several functional gaps
- Convex provides reactive real-time data, built-in auth, file storage, and zero-config deployment
- React has first-class Convex integration (`convex/react`) and a richer component ecosystem

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ LehroCode Portal                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────┐    ┌──────────────────────────┐   │
│  │ React Frontend   │    │ Convex Backend           │   │
│  │ (Next.js App     │───▶│                          │   │
│  │  Router)         │◀───│  Schema: 10 tables       │   │
│  │                  │    │  Queries: reactive       │   │
│  │  Shadcn/ui       │    │  Mutations: transactional│   │
│  │  Tailwind CSS    │    │  Actions: side-effects   │   │
│  │  Design tokens   │    │                          │   │
│  │                  │    │  Convex Auth             │   │
│  │  ConvexProvider  │    │  (password provider)     │   │
│  │  useQuery/       │    │                          │   │
│  │  useMutation     │    │  File Storage            │   │
│  │                  │    │  (avatars, covers, imgs) │   │
│  └──────────────────┘    └──────────────────────────┘   │
│                                                         │
│  No Docker, no SQLite, no Flask, no S3                  │
└─────────────────────────────────────────────────────────┘
```

---

## Convex Schema

### Tables

| Table | Fields | Indexes |
|-------|--------|---------|
| `users` | name, email, passwordHash, avatar (file ref), role (→roles), status, lastLoginAt | by_email (unique), by_role |
| `roles` | name, description, permissions: string[] | by_name (unique) |
| `projects` | name, code, description, cover (file ref), status, startDate, endDate, owner (→users), kanbanUrl | by_status, by_owner, by_code (unique) |
| `projectMembers` | project (→projects), user (→users), role | by_project, by_user, by_project_user (unique) |
| `news` | title, content, cover (file ref), summary, category (→categories), project (→projects), author (→users), isTop, isHot, viewCount, status, publishedAt | by_status, by_category, by_project, by_author |
| `categories` | name, slug, description, sortOrder | by_slug (unique) |
| `menus` | name, path, icon, parent (→menus self-ref), sortOrder, isVisible | by_parent, by_sort |
| `settings` | key, value, description | by_key (unique) |
| `operationLogs` | user (→users), action, resourceType, resourceId, details, ipAddress, userAgent | by_user, by_resource, by_action |
| `loginLogs` | user (→users), ipAddress, userAgent, status, reason | by_user, by_status |

### Schema Definition

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    avatar: v.optional(v.id("_storage")),
    role: v.id("roles"),
    status: v.union(v.literal("active"), v.literal("disabled")),
    lastLoginAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"]),

  roles: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    permissions: v.array(v.string()),
  }).index("by_name", ["name"]),

  projects: defineTable({
    name: v.string(),
    code: v.optional(v.string()),
    description: v.optional(v.string()),
    cover: v.optional(v.id("_storage")),
    status: v.union(v.literal("active"), v.literal("completed"), v.literal("archived")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    owner: v.id("users"),
    kanbanUrl: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_owner", ["owner"])
    .index("by_code", ["code"]),

  projectMembers: defineTable({
    project: v.id("projects"),
    user: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("manager"), v.literal("developer"), v.literal("tester"), v.literal("member")),
  })
    .index("by_project", ["project"])
    .index("by_user", ["user"])
    .index("by_project_user", ["project", "user"]),

  news: defineTable({
    title: v.string(),
    content: v.string(),
    cover: v.optional(v.id("_storage")),
    summary: v.optional(v.string()),
    category: v.optional(v.id("categories")),
    project: v.optional(v.id("projects")),
    author: v.id("users"),
    isTop: v.boolean(),
    isHot: v.boolean(),
    viewCount: v.number(),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
    publishedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_category", ["category"])
    .index("by_project", ["project"])
    .index("by_author", ["author"]),

  categories: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.number(),
  }).index("by_slug", ["slug"]),

  menus: defineTable({
    name: v.string(),
    path: v.optional(v.string()),
    icon: v.optional(v.string()),
    parent: v.optional(v.id("menus")),
    sortOrder: v.number(),
    isVisible: v.boolean(),
  })
    .index("by_parent", ["parent"])
    .index("by_sort", ["sortOrder"]),

  settings: defineTable({
    key: v.string(),
    value: v.string(),
    description: v.optional(v.string()),
  }).index("by_key", ["key"]),

  operationLogs: defineTable({
    user: v.id("users"),
    action: v.string(),
    resourceType: v.optional(v.string()),
    resourceId: v.optional(v.string()),
    details: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  })
    .index("by_user", ["user"])
    .index("by_resource", ["resourceType", "resourceId"])
    .index("by_action", ["action"]),

  loginLogs: defineTable({
    user: v.optional(v.id("users")),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    status: v.union(v.literal("success"), v.literal("failed")),
    reason: v.optional(v.string()),
  })
    .index("by_user", ["user"])
    .index("by_status", ["status"]),
});
```

---

## Auth Flow (Convex Auth)

```
Login Form → Convex Auth signIn("password", { email, password })
    ↓
Convex Auth validates → creates session cookie (httpOnly)
    ↓
useConvexAuth() → isAuthenticated, user
    ↓
Auth context reads current user → role + permissions from Convex query
    ↓
Route guards check hasPermission()
```

### Implementation

- **Provider:** Convex Auth password provider (email + password)
- **Session:** httpOnly cookies managed by Convex — no JWT in localStorage
- **Password hashing:** Handled by Convex Auth (bcrypt internally)
- **Seed mutation:** `seedInitialData()` creates admin user, default roles, and default menus on first deploy
- **RBAC:** Role-based permissions stored in `roles` table. Wildcard `*` grants all access.
- **Permission format:** `resource:action` (e.g., `projects:read`, `news:create`)

### Default Seed Data

- **Admin role:** `{ name: "admin", permissions: ["*"] }`
- **User role:** `{ name: "user", permissions: ["news:read", "projects:read"] }`
- **Admin user:** `{ email: "admin@lehro.solutions", password: "admin123", role: admin }`
- **9 default menus:** Dashboard, Projects, News, Categories, Users, Roles, Menus, Settings, Logs

---

## Data Flow

### Reads (Reactive Queries)

```
React Component
  └─ useQuery(api.projects.list, { status: "active" })
       → Convex query runs
       → Returns results
       → Subscribes to changes
       → Any mutation to projects auto-triggers re-render
```

### Writes (Transactional Mutations)

```
React Component
  └─ useMutation(api.projects.create)
       → Optimistic update (optional)
       → Convex mutation runs (ACID transaction)
       → All subscribed queries auto-update
```

### File Uploads

```
React Component
  └─ useMutation(api.uploads.generateUrl)
       → Returns upload URL + storage ID
       → POST file to Convex File Storage
       → Save storage ID in document field
```

### Audit Logging

```
Every mutation that modifies data
  └─ Calls logOperation() helper
       → Writes to operationLogs table
       → Transactional with main write
```

No Axios. No REST endpoints. No manual refetching. No polling.

---

## Frontend Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| UI Components | Shadcn/ui (Radix + Tailwind) |
| Styling | Tailwind CSS 4 |
| Data Tables | TanStack Table v8 |
| Forms | react-hook-form + Zod |
| Animations | Framer Motion |
| Theme | next-themes (dark/light) |
| Charts | Recharts |
| Rich Text | Tiptap |
| State | Convex React hooks (useQuery, useMutation, useAction) |
| Auth | @convex-dev/auth + convex/react |

### Directory Structure

```
project-portal/
├── convex/                    # Convex backend
│   ├── _generated/           # Auto-generated Convex client
│   ├── schema.ts             # Database schema
│   ├── auth.ts               # Convex Auth configuration
│   ├── users.ts              # User queries + mutations
│   ├── projects.ts           # Project queries + mutations
│   ├── news.ts               # News queries + mutations
│   ├── categories.ts         # Category queries + mutations
│   ├── roles.ts              # Role queries + mutations
│   ├── menus.ts              # Menu queries + mutations
│   ├── settings.ts           # Settings queries + mutations
│   ├── logs.ts               # Log queries + mutations
│   ├── uploads.ts            # File upload actions
│   ├── seeding.ts            # Seed data mutation
│   └── lib/                  # Shared helpers
│       ├── permissions.ts    # Permission checking
│       ├── logging.ts        # Audit log helper
│       └── pagination.ts     # Pagination helpers
│
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── layout.tsx        # Root layout (ConvexProvider, ThemeProvider)
│   │   ├── login/
│   │   │   └── page.tsx      # Login page
│   │   ├── (admin)/          # Admin route group
│   │   │   ├── layout.tsx    # Admin layout (sidebar + header)
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx  # Project list
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── news/
│   │   │   │   ├── page.tsx  # News list
│   │   │   │   ├── new/page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── categories/
│   │   │   │   └── page.tsx
│   │   │   ├── users/
│   │   │   │   └── page.tsx
│   │   │   ├── roles/
│   │   │   │   └── page.tsx
│   │   │   ├── menus/
│   │   │   │   └── page.tsx
│   │   │   ├── settings/
│   │   │   │   └── page.tsx
│   │   │   └── logs/
│   │   │       └── page.tsx
│   │   └── not-found.tsx     # 404 page
│   │
│   ├── components/
│   │   ├── ui/               # Shadcn/ui primitives
│   │   ├── layout/           # Sidebar, header, breadcrumb, theme-toggle
│   │   ├── dashboard/        # Stat-card, activity-chart
│   │   └── shared/           # DataTable, PermissionGuard, FileUpload, ConfirmDialog, RichTextEditor
│   │
│   ├── lib/
│   │   ├── auth.ts           # Permission helpers, useCurrentUser hook
│   │   ├── utils.ts          # cn(), formatters
│   │   └── constants.ts      # Permissions enum, default menus
│   │
│   └── styles/
│       └── globals.css       # Tailwind directives + design tokens + noise texture
│
├── .env.local                # CONVEX_DEPLOYMENT, NEXT_PUBLIC_CONVEX_URL
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── components.json           # Shadcn/ui config
└── package.json
```

---

## Design System Migration

### Typography (Preserved)

| Token | Vue CSS | React Tailwind |
|-------|---------|----------------|
| Display | Space Grotesk | Same — `font-display` |
| Body | DM Sans | Same — `font-body` |
| Mono | JetBrains Mono | Same — `font-mono` |

### Color Palette (Preserved, Converted to HSL)

| Brand Color | Hex | HSL (Tailwind format) |
|-------------|-----|----------------------|
| Blue | #2563EB | 217 91% 53% |
| Cyan | #06B6D4 | 188 95% 43% |
| Purple | #7C3AED | 262 83% 58% |
| Mint | #10B981 | 160 84% 39% |
| Orange | #F59E0B | 38 92% 50% |
| Rose | #F43F5E | 350 89% 60% |

### Dark/Light Theme

Vue used `[data-theme="dark"]` / `[data-theme="light"]` on `<html>`.
React will use `next-themes` which toggles `.dark` class — the Tailwind standard.

### Atmospheric Effects (Preserved)

- Radial gradient overlays on body background — preserved in globals.css
- Noise texture via SVG feTurbulence — preserved in globals.css
- Custom scrollbar (6px, rounded) — preserved in globals.css
- `prefers-reduced-motion` respected — preserved in Tailwind config

### Animation System (Enhanced)

| Vue CSS | React |
|---------|-------|
| `@keyframes fadeSlideUp` + stagger classes | Framer Motion `variants` with `staggerChildren` |
| CSS transitions on hover | Framer Motion `whileHover` |
| `.fade-slide-enter/leave` Vue transitions | Framer Motion `AnimatePresence` + `motion.div` |

---

## Vue Gaps → React Fixes

| Vue Bug/Gap | React + Convex Fix |
|-------------|-------------------|
| `<Breadcrumb />` missing | Built as proper Shadcn breadcrumb component |
| Dashboard chart hardcoded data | Real-time Convex query with `useQuery(api.dashboard.stats)` |
| RoleList no permission editor | Permission checkbox grid in role form dialog |
| MenuList no hierarchy | Tree component with parent/child nesting |
| Settings never loads from API | `useQuery(api.settings.list)` auto-fetches reactively |
| Fake "Clear Cache" button | Removed or replaced with real Convex cache invalidation |
| No 404 page | `not-found.tsx` with same design language as 403 |
| Menus sidebar item missing | Full sidebar nav built from Convex menu query |
| 3 views bypass API modules | All views use Convex hooks — no raw API calls |
| S3Service dead code | Replaced entirely by Convex File Storage |
| Docker compose broken | No Docker needed — Convex deploys itself |

---

## Key Technical Decisions

1. **Next.js App Router** — file-based routing, layouts, server components for auth checks
2. **Shadcn/ui** — owned code, not a dependency. Customize freely. Radix primitives ensure accessibility.
3. **TanStack Table** — pagination, sorting, filtering for all data tables — replaces manual Arco tables
4. **Framer Motion** — page transitions, staggered reveals, hover transforms — replaces CSS-only approach
5. **`next-themes`** — dark/light with system preference detection — replaces custom `[data-theme]` toggle
6. **Zod** — validates both on client (forms) and server (Convex function args)
7. **react-hook-form** — performant form state, integrated with Zod via `@hookform/resolvers`
8. **Recharts** — replaces ECharts. Simpler React API, same chart types.
9. **Tiptap** — replaces WangEditor. React-native, extensible, accessible rich text editor.

---

## Deployment

- **Backend:** Convex Cloud (automatic on `npx convex deploy`)
- **Frontend:** Vercel (auto-deploys from git, `CONVEX_DEPLOYMENT` env var)
- **No Docker, no server management, no database provisioning**

---

*Design approved — 2026-04-20*
