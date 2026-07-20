---
name: lehrocode-rollback-recovery
description: >
  Rollback and recovery system for LehroCode. Use when a build fails, code breaks,
  deployment has issues, or you need to undo changes. Based on GSD Pro recovery patterns.
---

# LehroCode: Rollback & Recovery

Capture state before changes, recover from failures, rollback when things break.

## When to Use
- Before any destructive operation (refactoring, major changes)
- Build/test/deploy failure
- Code breaks functionality
- User asks to revert changes
- Agent enters error loop

## Pre-Change State Capture

Before any risky operation:

```markdown
# State Capture: <operation-name>
**Timestamp:** 2026-04-01T07:32:00Z
**Operation:** [what we're about to do]

### Git State
- Current branch: main
- Last commit: abc123
- Stash status: clean/dirty

### Test Status
- Passing tests: 47/47
- Coverage: 82%

### Deployment Status
- Environment: production
- Version: 1.2.3
```

Save to: `/root/.openclaw/workspace/lehrocode/workflows/<project>/states/<timestamp>_<operation>.md`

## Rollback Commands

### Git Rollback
```bash
# Soft reset (keep changes staged)
git reset --soft HEAD~1

# Hard reset (discard all changes)
git reset --hard <commit-hash>

# Revert specific commit (safer for shared branches)
git revert <commit-hash>

# Stash and checkout known good state
git stash push -m "auto-stash before rollback"
git checkout <safe-branch>
```

### Agent Recovery
When an agent fails:

1. **Capture error** — What went wrong, which step failed
2. **Determine recovery strategy:**
   - Retry: Transient error, same action might succeed
   - Retry with fix: Agent misunderstood, adjust approach
   - Skip: Problematic step can be deferred
   - Full rollback: Something is broken, undo everything

3. **Apply recovery:**
```markdown
# Recovery Report
**Failed Step:** Task 3 — Stripe adapter implementation
**Error:** "Cannot read properties of undefined"
**Root Cause:** Wrong property access — adapter.config.apiKey should be adapter.config.authConfig.apiKey
**Recovery Action:** Fix property access path and re-run Task 3
**Retrying:** Yes (with fix)
```

4. **Write recovery log** to `/root/.openclaw/workspace/lehrocode/workflows/<project>/RECOVERY.md`

## Loop Breaking

When agents enter error loops:

```
Error → Retry → Same Error → Retry → Same Error → ...
```

Detection: Same error message 2+ times.

**Recovery actions:**
1. Stop the current workflow
2. Report the loop to main agent
3. Suggest alternative approach
4. Ask user for guidance if no clear path

## Deployment Rollback

```bash
# Vercel
vercel rollback [deployment-url]

# Railway
railway rollback

# Docker
docker-compose down
docker-compose up -d --no-deps <service>
```

## Safety Rules

- **Never reset --hard on main branch** without user confirmation
- **Always capture state before rollback** (you might need to undo the undo)
- **Preserve error logs** — they help understand what went wrong
- **Report failures, don't hide them** — transparency > false success
- **Ask before database rollbacks** — data loss is irreversible

## Recovery State Machine

```
Normal → [Failure detected]
  ↓
Diagnose → [Root cause identified]
  ↓
Choose Strategy → [Retry / Fix+Retry / Skip / Rollback]
  ↓
Execute Recovery → [Success / Still Failing]
  ↓
Success: Resume workflow
Still Failing: Escalate to user
```
