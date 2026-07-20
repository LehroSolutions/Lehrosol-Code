---
name: lehrocode-multi-agent-orchestration
description: >
  Multi-agent orchestration for LehroCode. Use when building complex projects that need
  parallel work across different agent roles. Based on Claude Code tool registry patterns
  + GSD Pro subagent patterns + AI Maestro orchestration.
---

# LehroCode: Multi-Agent Orchestration

Coordinate multiple agents working in parallel with defined roles, communication, and quality gates.

## When to Use
- Building a multi-component project
- Tasks can be parallelized (independent components)
- Complex projects needing different expertise
- User wants faster development through parallelism

## Agent Roles

| Role | Responsibility | Best Model | Skills Required |
|------|---------------|------------|-----------------|
| **Architect** | Spec generation, planning, system design | Frontier (best reasoning) | spec-driven-dev |
| **Coder** | Implementation, feature development | Code-specialized | test-driven-dev |
| **Frontend Dev** | UI components, CSS, responsive design | Code-specialized | frontend-skill |
| **Backend Dev** | API endpoints, database, auth | Code-specialized | lehroforge-api-adapter |
| **Reviewer** | Code review, quality gates | Reviewer prompt | code-review-gates |
| **Tester** | Test generation, validation | Code-specialized | testing-suite |
| **Deployer** | Deployment, CI/CD | Generalist | lehroforge-deployment |

## Orchestration Patterns

### Pattern 1: Sequential Pipeline
```
Architect → Plan → Coder → Reviewer → Tester → Deployer
```
Use when: Components depend on each other, can't parallelize.

### Pattern 2: Parallel Build
```
       → Frontend Dev →
Architect → Plan →      → Reviewer → Tester → Deployer
       → Backend Dev  →
```
Use when: Frontend and backend are independent.

### Pattern 3: Component Team
```
Architect → Plan → [Coder A: Auth]  → Reviewer A →
                 [Coder B: Billing] → Reviewer B → Merger → Tester → Deployer
                 [Coder C: UI]       → Reviewer C →
```
Use when: Independent features/components.

### Pattern 4: Review Chain
```
Coder → Reviewer (Critical Issues?) → Fix → Reviewer (Warnings?) → Fix → Merge
```
Use when: Quality is critical (security, performance).

## Spawning Agents

### Subagent Spawn (via OpenClaw)
```
Main Agent spawns subagent with:
- Role (coder, reviewer, tester)
- Task description
- File paths
- Context (spec, plan, existing code patterns)
- Acceptance criteria
- Reviewer identity (who checks the work)
```

### Agent Communication
Agents communicate through:
1. **Shared file system** — Write to agreed paths
2. **Status files** — `workflows/<project>/agents/<role>.md`
3. **Review artifacts** — Review.md files from Reviewer to Coder

## Parallel Execution Rules

**What CAN run in parallel:**
- Independent API adapters (Stripe, SendGrid, HubSpot)
- Independent UI components (Header, Footer, Sidebar)
- Independent tests (unit tests for different modules)
- Code review of independent PRs

**What CANNOT run in parallel:**
- Database schema migrations (sequential by nature)
- Deployment steps (must be ordered)
- Code that modifies shared files
- Tasks where one task's output is another's input

## Status Tracking

Each agent writes status:

```markdown
# Agent Status: [Role]
**Task:** Stripe Adapter Implementation
**Started:** 2026-04-01T07:32:00Z
**Status:** In Progress / Completed / Blocked / Failed
**Files:**
- Creating: apps/server/src/adapters/StripeAdapter.ts
- Creating: apps/server/src/adapters/StripeAdapter.test.ts

**Blockers:** [any issues]
**ETA:** [estimated completion]
```

## Error Handling

When a sub-agent fails:
1. Capture error + stack trace
2. Determine if issue is:
   - Spec/plan problem → Update spec, re-dispatch
   - Code problem → Send to Reviewer for feedback
   - System problem → Escalate to main agent
   - Resource problem → Retry with adjusted limits
3. Apply recovery strategy
4. Re-dispatch or skip based on criticality

## Quality Gates

Before any parallel work merges:
1. All sub-agents must pass their individual review gates
2. Integration test must pass with all components combined
3. No merge conflicts in shared files
4. Deployment pipeline must succeed

## Output

After completion, write project summary:
- All agent statuses
- Final review report
- Test results
- Deployment status
- Write to memory: `memory/YYYY-MM-DD.md` + `MEMORY.md`
