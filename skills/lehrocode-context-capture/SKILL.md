---
name: lehrocode-context-capture
description: >
  Capture and extract project context for AI agents. Use when onboarding to a new codebase, 
  starting development on a project, or agents need project memory.
  Based on Claude Code memory patterns (memdir 4-type memory system).
---

# LehroCode: Context Capture

Extract, structure, and persist project context for AI agents.

## When to Use
- Starting work on a new project
- Agent needs to understand codebase
- Onboarding to unfamiliar code
- Before generating a spec or plan

## Memory Architecture (4-Tier)

### 1. User Memory (`memory/user.md`)
Team preferences, coding standards, Lehro Solutions patterns.

### 2. Project Memory (`memory/project.md`)
Project structure, tech stack, architecture decisions, conventions.

### 3. Feedback Memory (`memory/feedback.md`)
What worked, what failed, lessons learned, user corrections.

### 4. Reference Memory (`memory/reference.md`)
API docs, config patterns, deployment instructions, useful snippets.

## Extraction Process

### Step 1: Codebase Scan

```bash
# Map the project structure
cd /root/.openclaw/workspace/<project>

# Get file tree (max 3 levels deep, no node_modules)
find . -maxdepth 3 -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./dist/*" | head -200

# Count files by type
find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.py" | wc -l
find . -name "*.json" | wc -l
find . -name "*.md" | wc -l

# Check for key files
ls -la package.json tsconfig.json README.md .env .gitignore Makefile Dockerfile 2>/dev/null
```

### Step 2: Framework Detection

Check package.json or requirements.txt to identify:
- Frontend framework (React, Vue, Next.js, Svelte)
- Backend framework (Express, Fastify, FastAPI, Django)
- Database (PostgreSQL, MongoDB, SQLite)
- Testing framework (Jest, Vitest, pytest)
- Styling (Tailwind, CSS modules, styled-components)

### Step 3: Architecture Analysis

Read key files to understand:
1. Entry point (index.ts, main.ts, App.tsx)
2. Route structure
3. Component hierarchy
4. API endpoints
5. Database schema
6. Deployment config

### Step 4: Write Context

Create `/root/.openclaw/workspace/lehrocode/workflows/<project>/CONTEXT.md`:

```markdown
# <Project Name> Context

## Tech Stack
- **Frontend:** React 19 + Next.js 15 + Tailwind CSS v4
- **Backend:** Express + TypeScript
- **Database:** PostgreSQL + Prisma
- **Testing:** Vitest
- **Package Manager:** pnpm

## Project Structure
```
src/
├── app/          # Next.js pages
├── components/   # Reusable UI
├── lib/          # Utilities
└── types/        # TypeScript types
```

## Key Conventions
- TypeScript strict mode enforced
- `any` types → code review blocker
- Components: PascalCase, functions: camelCase
- API routes: /api/v1/[resource]

## API Endpoints
- GET    /api/workflows     → List workflows
- POST   /api/execution     → Execute workflow

## Database Schema
- Workflow (id, name, definition, status)
- Execution (id, workflowId, status, steps)

## Deployment
- Vercel for frontend
- Railway for backend
- PostgreSQL on Neon
```

## Usage in Agent Flows

Before any agent starts work:
1. Check if CONTEXT.md exists
2. If yes → read and load context
3. If no → run extraction, write CONTEXT.md
4. Pass context to agent as system prompt section

## Auto-Update Triggers

Update context when:
- New major dependency added/removed
- Project structure changes significantly
- New API endpoints added
- Database schema changes

Write changes to `memory/project.md` automatically.
