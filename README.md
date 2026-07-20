# LehroCode

> AI-native coding workflow for **Lehro Solutions**
>
> Spec-driven development with multi-agent orchestration, rollback/recovery, and LehroForge integration.

---

## Architecture

LehroCode is our **agent workflow framework** built on OpenClaw's MIT-licensed runtime. It combines learnings from:

1. **OpenClaw** (MIT) — agent runtime, memory, skills, sessions
2. **GSD Pro** — spec-driven dev patterns, context engineering
3. **Claude Code patterns** — tool registry structure, skill format (architectural only)
4. **AI Maestro** — multi-agent dashboard and orchestration

LehroCode now also ships a provider catalog so the runtime can target OpenAI, Claude, GitHub Copilot gateway profiles, Qwen, Kimi, and GLM from the same harness.

## Agent Roles

| Role | Purpose | Skills |
|------|---------|--------|
| Architect | Spec + plan generation | spec-driven-dev, context-capture |
| Coder | Implementation | test-driven-development, systematic-debugging |
| Reviewer | Code review gates | code-review-gates |
| Tester | Test generation + validation | testing-suite |
| Deployer | Build + deploy | lehroforge-deployment, vercel-deploy |

## Workflow

```
User Request → Architect (Spec + Plan) → Coder (Build) → Reviewer → Tester → Deployer
```

Each stage uses sub-agents for parallel work where possible.

## Custom Skills

| Skill | Purpose |
|-------|---------|
| `lehrocode-spec-driven-dev` | Generate spec → plan → build cycle |
| `lehrocode-code-review-gates` | Pre-merge quality gates |
| `lehrocode-context-capture` | Project memory for agents |
| `lehrocode-rollback-recovery` | State capture + undo capability |

## Live Manifests

- `config/agents.yaml` controls which provider and model each agent role uses.
- `config/providers.yaml` defines the endpoint and API key environment variables for each provider.
- `npm start -- providers` lists provider readiness.
- `npm start -- providers validate` checks provider secrets and endpoints before execution.
- `npm start -- agents` lists agent roles with their provider and model mapping.
- `npm start -- run <project> --provider <id> --model <name>` forces a workflow onto a specific provider.

## Quick Start

1. **Skills installed** — 60+ skills already in `/root/.openclaw/workspace/skills/`
2. **Agent configured** — LehroCode agents ready in OpenClaw runtime
3. **Provider catalog configured** — default manifests include OpenAI, Claude, GitHub Copilot, Qwen, Kimi, and GLM
4. **Build something:**

```
Lehlohonolo: "We need a new API adapter for X"
Lehro Bits: [Runs spec-driven-dev → Architect creates spec → Sub-agents build]
```

## Project Portal Commands

The Convex-backed Project Portal app is rooted in `project-portal`, not the workspace root.

Use these commands from `D:\lehrocode\project-portal`:

```powershell
Set-Location D:\lehrocode\project-portal
npx convex dev --once
```

Running `npx convex dev --once` from `D:\lehrocode` fails because that directory does not contain the app `package.json` or the Project Portal Convex app.

## State Storage

All workflow state lives in `/root/.openclaw/workspace/lehrocode/workflows/`:

```
workflows/
└── <project-name>/
    ├── SPEC.md          # Project specification
    ├── PLAN.md          # Implementation plan with tasks
    ├── CONTEXT.md       # Project context extracted for agents
    ├── STATUS.md        # Current build state
    └── states/          # Rollback snapshots
        └── <timestamp>_<action>.md
```

---

*2026 Lehro Solutions. Built on OpenClaw (MIT).*
