---
name: lehroforge-testing-suite
description: >
  Run comprehensive tests for LehroForge adapters and API integrations. 
  Use when testing API connections, running test suites, generating tests from specs, 
  or validating integration quality.
---

# LehroForge Testing Suite

Run rigorous tests across 6 tiers before any integration ships.

## When to Use
- Testing new API adapter
- Running regression tests after changes
- Validating integration before production
- Load testing before deployment
- User requests test report

## Test Tiers

### 1. Unit Tests (60%+ coverage required)
```bash
pnpm test:unit --coverage
```
Tests: schema validation, secret masking, rate limits, response transforms

### 2. Integration Tests
```bash
pnpm test:integration        # Mock servers
pnpm test:integration --live # Sandbox APIs
```
Tests: real adapter behavior, schema mismatches, auth flows

### 3. E2E Tests
```bash
pnpm test:e2e
```
Tests: complete user workflows as they'd actually use them

### 4. Security Tests
```bash
pnpm test:security:secrets   # gitleaks
pnpm test:security:owasp     # OWASP ZAP
pnpm test:security:injection # SQL/XSS/Command
pnpm test:security:fuzz      # API fuzzing
```

### 5. Load Tests
```bash
pnpm test:load
```
Targets:
- 100 concurrent: <200ms p95
- 1000 req/s: <2% error rate
- 24hr soak: no memory leaks

### 6. Regression Tests
```bash
pnpm test:regression --baseline=main
```
Detects: API changes, performance degradation >10%, policy drifts

## Auto-Generate Tests

From OpenAPI spec:
```bash
lehroforge generate-tests --spec <url>
# Generates: auth tests, operation tests, error tests, security tests
```

## Test Output
```
🧪 LehroForge Test Suite - [Adapter Name]
✅ Unit Tests: 47/47 passed (82% coverage)
✅ Integration: 23/23 passed
✅ E2E: 8/8 workflows passed
✅ Security: All 4 suites passed
⚠️  Load: 95ms p95 (target: <200ms) - PASS
✅ Regression: No changes detected

STATUS: ✅ READY FOR DEPLOYMENT
```

## CI Integration
Tests run automatically in GitHub Actions:
```yaml
- name: Run LehroForge Tests
  run: pnpm test:all --reporter=github

- name: Security Scan
  if: success()
  run: pnpm test:security --ci
```

## Quick Test Mode (for users)
```
🧪 Let's test your [API] connection!
   [1] Test authentication ✓
   [2] Make a test request ✓
   [3] Verify response ✓
   [4] Test error handling ✓

✅ All tests passed! Your integration is ready.
```
