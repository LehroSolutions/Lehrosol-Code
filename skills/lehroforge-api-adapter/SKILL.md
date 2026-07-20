---
name: lehroforge-api-adapter
description: >
  Create production-ready API adapters for LehroForge. Use when building, configuring, 
  or testing API integrations. Supports REST, GraphQL, and gRPC with auto-discovery from OpenAPI/Swagger specs.
  Use for: connecting to Stripe/SendGrid/GitHub/OpenAI/Slack/etc., generating adapters from specs,
  configuring authentication, testing connections, creating multi-API workflows.
---

# LehroForge API Adapter

Build, configure, and manage API adapters for the LehroForge orchestration layer.

## When to Use
- Connect a new API to LehroForge
- Generate adapter from OpenAPI/Swagger spec
- Test existing API connection
- Create multi-API orchestration workflow
- Debug API integration issues

## Steps

### 1. Identify the API
- What service? (Stripe, SendGrid, GitHub, OpenAI, etc.)
- What operations needed?
- Auth method available? (API key, OAuth, JWT, mTLS)

### 2. Check for existing adapter
- Search `adapters/` directory
- If exists: load and configure
- If not: generate new one

### 3. Generate adapter

**From spec:**
```bash
lehroforge generate-adapter --openapi <spec-url>
```

**From GraphQL:**
```bash
lehroforge generate-adapter --graphql <endpoint-url>
```

**Manual creation:**
- Scaffold structure: `lehroforge scaffold-adapter <name>`
- Fill in adapter.ts, schema.json, auth config

### 4. Configure Authentication
- Guide user through secure key entry
- Store secrets encrypted (AES-256-GCM)
- Test with minimal request
- Verify scopes/permissions

### 5. Run Tests
```bash
# Required tests before activation
lehroforge test <adapter> --auth          # Auth test
lehroforge test <adapter> --operations    # CRUD operations
lehroforge test <adapter> --rate-limit    # Rate limits
lehroforge test <adapter> --errors        # Error handling
lehroforge test <adapter> --security      # Security injection tests
```

### 6. Activate & Monitor
```bash
lehroforge activate <adapter>
```
- Register in connection registry
- Enable health monitoring (every 5 min)
- Set up rate limiting
- Enable audit logging

## Adapter Structure
```
adapters/<name>/
├── adapter.ts        # Connection logic
├── schema.json       # Operations & parameters
├── SECURITY.md       # Security notes
├── docs.md           # User docs
└── tests/
    ├── auth.test.ts
    ├── operations.test.ts
    └── security.test.ts
```

## Best Practices
- Never store secrets in code or logs
- Use vault integration for production
- Auto-rotate keys when supported
- Enforce least-privilege scopes
- Document all error codes

## Output
- Working adapter in adapters/<name>/
- Test suite with 80%+ coverage
- Security review in SECURITY.md
- User documentation in docs.md
