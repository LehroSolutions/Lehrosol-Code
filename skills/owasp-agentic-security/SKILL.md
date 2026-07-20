# OWASP Agentic Security — LehroCode

## OWASP Top 10 for Agentic Applications (2026)

This skill audits any LehroCode agent or LehroForge integration against the OWASP Top 10 for Agentic Applications — the definitive 2026 framework from 100+ experts worldwide.

**Reference:** `references/owasp-top10-agentic-2026.md`

---

## When to Use
- Before deploying any agent to production
- After major changes to agent capabilities or permissions
- Quarterly security audits
- Before integrating new third-party APIs
- After any security incident

## Audit Process

### Step 1: Agent Capability Mapping

For each agent in the system, map:
1. **What tools it can call** (file read/write, shell, API adapters)
2. **What data it can access** (user data, secrets, production DBs)
3. **What systems it can modify** (code repos, infrastructure, config)
4. **Who can trigger it** (authenticated users, public endpoints, cron jobs)

### Step 2: Risk Assessment

Check each of the 12 OWASP risk categories:

**1. Prompt Injection**
- Are system prompts isolated from untrusted input?
- Is there input sanitization before LLM calls?
- Are zero-width characters and control characters stripped?

**2. Insecure Output Handling**
- Are agent outputs validated before passing to downstream systems?
- Is there a sandbox between agent output and execution?
- Are content types enforced on all API responses?

**3. Agent Lifecycle Management**
- Are API credentials rotated regularly?
- Is there an audit trail for all agent actions?
- Do agents have max session timeouts?

**4. Training/Data Poisoning**
- Are context documents verified before use?
- Is there integrity checking for reference materials?
- Are training data and runtime pipelines segregated?

**5. Excessive Agency**
- Does the agent have least-privilege access?
- Are there human-in-the-loop gates for destructive actions?
- Is there a tool whitelist per agent role?

**6. Insecure Tool Design**
- Are all tool inputs validated with schemas?
- Are tool calls parameterized (no string interpolation)?
- Are there per-tool rate limits?

**7. Over-Transparency / Data Leakage**
- Are PII and secrets scrubbed from outputs?
- Are error messages generic (no stack traces)?
- Is stored memory encrypted at rest?

**8. Supply Chain**
- Are LLM providers attested and verified?
- Are all skills scanned before activation?
- Are dependencies automatically scanned for vulnerabilities?
- Are API contracts verified against specifications?

**9. Unauthorized Code Execution**
- Is code execution sandboxed by default?
- Are there approval gates before code runs?
- Is there immutable infrastructure (no direct production access)?

**10. Entanglement / Agent Cascades**
- Are inter-agent communication contracts defined?
- Are there circuit breakers between agent chains?
- Is there a dependency map preventing circular dependencies?

**11. Privacy & Data Protection**
- Is PII classified and access-controlled?
- Are data retention policies enforced?
- Is user consent tracked and respected?

**12. Transparency & Explainability**
- Are agent decisions logged and traceable?
- Can every output be traced back to its inputs?
- Are failures documented with root cause analysis?

### Step 3: Generate Report

Write audit report to `workflows/<agent-name>/SECURITY-AUDIT-<date>.md`

Format:
```markdown
# Security Audit: <Agent Name>
**Date:** <YYYY-MM-DD>
**Auditor:** OWASP Agentic Security Skill
**OWASP Framework:** Top 10 for Agentic Applications 2026

## Summary
| Category | Status | Notes |
|----------|--------|-------|
| Prompt Injection | ✅ PASS / ❌ FAIL | Details... |
| ... | ... | ... |

## Critical Findings
[List with severity, affected components, remediation steps]

## Recommendations
[Prioritized list of fixes]

## Residual Risk
[What risks remain after controls]
```

---

## Automated Checks

```bash
# 1. Scan for secrets in agent configs
grep -rn "sk_\|api[_-]?key\|password\|token\|secret" ~/.openclaw/workspace/skills/ --include="*.md" --include="*.json"

# 2. Check skill permissions
find ~/.openclaw/workspace/skills/ -name "SKILL.md" -exec grep -l "exec\|shell\|run\|eval" {} \;

# 3. Audit log inspection
ls -la ~/.openclaw/workspace/lehrocode/workflows/
```

## Remediation Priority

1. **Critical** — Fix immediately (blocks deployment)
2. **High** — Fix within 24 hours
3. **Medium** — Fix within 1 sprint
4. **Low** — Backlog
