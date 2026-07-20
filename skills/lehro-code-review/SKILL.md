---
name: lehro-code-review
description: >
  Review, analyze, and improve code for Lehro Solutions projects.
  Use when reviewing code, debugging, refactoring, writing tests, 
  conducting security reviews, or optimizing performance.
---

# Lehro Code Review

Professional code review and development support for Lehro Solutions.

## When to Use
- Code review needed
- Debugging issues
- Performance optimization
- Security review
- Refactoring
- Writing tests
- Architecture decisions

## Review Process

### 1. Quick Scan
- Read the full file/PR context
- Understand the purpose
- Identify obvious issues (security, errors)

### 2. Detailed Review
Check for:
- **Correctness**: Does it work as intended?
- **Security**: Any vulnerabilities? (injection, secret leaks)
- **Performance**: Bottlenecks, N+1 queries, memory leaks?
- **Readability**: Clear variable names, comments where needed?
- **Tests**: Are there tests? Do they cover edge cases?
- **Error handling**: Are errors caught and handled properly?
- **API design**: Consistent, documented, backward-compatible?

### 3. Feedback Format
```markdown
## Summary
[Brief overview of what the code does]

## ✅ Good
- What's done well

## ⚠️ Issues
| Severity | Issue | Location | Suggestion |
|----------|-------|----------|------------|

## 💡 Suggestions
- Optional improvements

## Final Verdict
✅ Approved / 🔶 Approved with changes / ❌ Request changes
```

## Severity Levels
- **Critical**: Bug or security risk — must fix
- **Warning**: Could cause issues — should fix
- **Suggestion**: Nice to have — consider

## Code Standards (Lehro)
- TypeScript strict mode
- No `any` types
- Consistent error handling
- JSDoc for public APIs
- Tests required for new features
- Security scan before merge

## Quick Commands
```bash
# Run tests
pnpm test

# Check types
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format

# Security
pnpm audit
```
