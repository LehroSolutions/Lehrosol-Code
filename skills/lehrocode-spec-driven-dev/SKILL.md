---
name: lehrocode-spec-driven-dev
description: >
  Spec-driven development workflow for Lehro Solutions projects. Use when building new features,
  projects, or functionality. Generates spec → plan → build → review → test cycle using sub-agents.
  Use for: building features, creating projects, adding functionality, refactoring.
---

# LehroCode: Spec-Driven Development

Generate a spec, create an implementation plan, build with sub-agents, review, test, and deploy.

## When to Use
- User asks to build a feature or project
- User wants to implement something substantial
- User needs structured approach to coding task

## Workflow

### Phase 1: Context Capture
```
1. Check if project exists → read CONTEXT.md if available
2. If not → create CONTEXT.md (tech stack, structure, patterns)
3. Save to: memory/YYYY-MM-DD.md
```

### Phase 2: Spec Generation
Write spec to `/root/.openclaw/workspace/lehrocode/workflows/<project>/SPEC.md`:

```markdown
# Project Name
## Problem
[What are we solving?]

## Solution
[How we'll solve it]

## Architecture
- Component structure
- Data flow
- Dependencies

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Security
- Auth requirements
- Data handling
- Rate limiting
```

### Phase 3: Planning
Break spec into parallelizable tasks:

```markdown
# Plan
### Task 1: [Component]
**Sub-agent role:** Coder/Frontend/Backend
**Files to create/modify:** paths
**Dependencies:** [Task X or none]
**Acceptance:** [testable outcome]

### Task 2: [Component]
...
```

### Phase 4: Parallel Build
Spawn sub-agents per independent task:
- Each sub-agent gets: spec, plan, task description, file paths
- Sub-agent writes code + tests
- Save work to project directory
- Commit with descriptive messages

### Phase 5: Review
Run code-review-gates skill on generated code.

### Phase 6: Test
Run testing-suite skill on completed code.

### Phase 7: Deploy (optional)
Run lehroforge-deployment skill if configured.

## Rollback
Before any phase, capture git state. If phase fails → rollback + adjust + retry.

## Output
- SPEC.md → PLAN.md → Code → REVIEW.md → TEST.md → Deploy report
- All saved to `/root/.openclaw/workspace/lehrocode/workflows/<project>/`
