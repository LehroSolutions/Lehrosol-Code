---
name: lehroforge-security-audit
description: >
  Run security audits on codebases and API integrations via LehroForge. Use when asked to scan code for vulnerabilities, 
  audit an API connection, review security posture, check for secrets leaks, or validate zero-trust compliance.
---

# LehroForge Security Audit

Comprehensive security review for LehroForge adapters, integrations, and deployment.

## When to Use
- User requests security audit or vulnerability scan
- New API adapter before production deployment
- After security incident
- Periodic compliance check (quarterly)
- Before sharing code publicly

## Steps

### 1. Code Vulnerability Scan
```bash
# Find hardcoded secrets
grep -rni "sk_\|api[_-]?key\|password\|token\|secret" --include="*.ts" --include="*.js" --include="*.env"

# Scan for known vulnerabilities
npm audit --production

# Run static analysis
lehroforge audit --static
```

### 2. Injection Testing
- [ ] SQL injection vectors in queries
- [ ] XSS in response handlers
- [ ] Command injection in shell calls
- [ ] Path traversal in file operations
- [ ] Header injection in API requests

### 3. Security Pipeline Verification
```typescript
// Every adapter passes through:
verify(Authenticate)     // Identity check
verify(ValidateRequest)  // Schema validation (Zod)
verify(Sanitize)         // Input cleaning
verify(RateLimit)        // Per-user, per-API limits
verify(Audit)            // Log for compliance
```

### 4. Secret Management Review
- [ ] No secrets in code, logs, or git
- [ ] AES-256-GCM encryption for stored keys
- [ ] Auto-rotation enabled where supported
- [ ] Vault integration for production
- [ ] Secrets scoped to least-privilege

### 5. API Security Config
- [ ] TLS everywhere (HTTPS only)
- [ ] Certificate pinning where supported
- [ ] Rate limiting configured
- [ ] Circuit breakers for failing APIs
- [ ] Egress filtering enabled

### 6. Generate Audit Report
```bash
lehroforge audit --report --format=markdown
```

## Output Template
```markdown
# Security Audit Report - [API/Component]
**Date:** YYYY-MM-DD
**Status:** ✅ PASS / ❌ FAIL / ⚠️ WARNINGS

## Findings
| Severity | Issue | Location | Fix |
|----------|-------|----------|-----|

## Passed Checks
- Auth validation
- Encryption
- Rate limiting

## Failed Checks
- [ ] [issue description]

## Recommendations
1. ...
```

## Severity Levels
- **Critical**: Immediate exploit risk (block deployment)
- **High**: Significant risk (fix before merge)
- **Medium**: Addressable risk (fix within sprint)
- **Low**: Minor concern (backlog)
