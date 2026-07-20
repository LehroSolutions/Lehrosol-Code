---
name: lehrocode-code-review-gates
description: >
  Pre-merge code review gates for LehroCode. Use when reviewing code, PRs, 
  or before merging any changes. Enforces quality gates learned from Claude Code tool patterns.
  Use for: code review, PR review, quality gate, merge approval.
---

# LehroCode: Code Review Gates

Professional code review with automated quality gates.

## When to Use
- Reviewing generated code from sub-agents
- Before merging any branch
- User asks for code review
- Pre-deployment quality check
- Security review

## Review Process

### Gate 1: Architecture Review
- [ ] Code matches spec and plan
- [ ] File structure follows project patterns
- [ ] Component boundaries are clean
- [ ] No circular dependencies
- [ ] Proper separation of concerns

### Gate 2: Code Quality
- [ ] TypeScript strict mode (no `any` types)
- [ ] Consistent naming conventions
- [ ] JSDoc for public APIs
- [ ] No code duplication (DRY)
- [ ] No unused imports/variables

### Gate 3: Security
- [ ] No hardcoded secrets or API keys
- [ ] Input validation on all user-facing endpoints
- [ ] No SQL injection vectors
- [ ] XSS prevention on frontend
- [ ] Auth tokens properly scoped
- [ ] Rate limiting configured
- [ ] Secrets stored in .env only (never committed)

### Gate 4: Error Handling
- [ ] Errors caught and handled gracefully
- [ ] User-friendly error messages
- [ ] Error logging for debugging
- [ ] Fallback paths for API failures
- [ ] Retry logic for transient failures

### Gate 5: Edge Cases
- [ ] Empty state handling
- [ ] Loading states for async operations
- [ ] Invalid input handling
- [ ] Rate limit exceeded handling
- [ ] Network failure handling

### Gate 6: Testing
- [ ] Unit tests exist for new logic
- [ ] Tests pass (`pnpm test`)
- [ ] Test coverage > 60%
- [ ] Edge cases tested
- [ ] Integration tests for API interactions

## Review Output

Write review to `/root/.openclaw/workspace/lehrocode/workflows/<project>/REVIEW.md`:

```markdown
# Code Review Report

**Project:** <name>
**Date:** YYYY-MM-DD
**Reviewer:** LehroCode Reviewer Agent

## Gates Passed
- [x] Architecture
- [x] Code Quality
- [ ] Security — Issue: API key in src/adapter.ts:24
- [ ] Error Handling — Missing retry logic for Stripe
- [x] Edge Cases
- [x] Testing

## Issues (Blockers)
| Severity | File | Line | Issue | Fix |
|----------|------|------|-------|-----|
| Critical | src/adapter.ts | 24 | Hardcoded API key | Move to .env |

## Suggestions
1. Use `fetch` wrapper for consistent error handling
2. Add loading skeleton for async component

## Verdict
❌ BLOCKED — Fix Critical: Security issue before merge
```

## Severity Levels
- **Critical** — Blocks merge (security risks, data loss, broken functionality)
- **Warning** — Should fix before merge (performance issues, poor patterns)
- **Suggestion** — Improve but doesn't block (code style, minor optimizations)

## Fix Loop

If issues found:
1. Write issues to REVIEW.md
2. Send issues to Coder agent for fixes
3. Re-review only the changed code
4. Repeat until all Critical + Warning fixed
