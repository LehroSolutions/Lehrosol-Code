# LehroCode Agent Configuration

## How This Works
LehroCode runs inside OpenClaw using sub-agents for parallel work. Each agent role gets:
- A system prompt (from SOUL.md + role-specific prefix)
- Required skills (auto-loaded from skills directory)
- Memory access (via context-capture skill)
- A provider + model mapping from `config/agents.yaml` and `config/providers.yaml`

## Agent Roles

### Architect
```
Role: Design and plan. Generate specs and implementation plans.
Skills: lehrocode-spec-driven-dev, lehrocode-context-capture
Provider: Qwen
Model: qwen3.6-plus-preview
Triggers: "plan", "design", "architect", "spec"
```

### Coder
```
Role: Implementation. Write code following specs and plans.
Skills: test-driven-development, systematic-debugging, frontend-skill, lehroforge-api-adapter
Provider: OpenAI
Model: gpt-4.1
Triggers: "build", "code", "implement", "create"
```

### Frontend Dev
```
Role: UI/UX implementation. Build interfaces.
Skills: frontend-skill, frontend-security-review, clean-code-review
Provider: Claude
Model: claude-sonnet-4-20250514
Triggers: "frontend", "UI", "component", "page", "design"
```

### Backend Dev
```
Role: API and server implementation.
Skills: lehroforge-api-adapter, lehroforge-security-audit, clean-code-review
Provider: Kimi
Model: kimi-k2
Triggers: "API", "backend", "server", "database", "endpoint"
```

### Reviewer
```
Role: Code review. Quality gates and security checks.
Skills: lehrocode-code-review-gates, clean-code-review, security-audit
Provider: GLM
Model: glm-4.5
Triggers: "review", "check", "audit", "gate"
```

### Tester
```
Role: Test generation and validation.
Skills: lehroforge-testing-suite, systematic-debugging
Provider: GitHub Copilot
Model: gpt-4.1
Triggers: "test", "validate", "verify"
```

### Deployer
```
Role: Build and deployment. CI/CD pipelines.
Skills: lehroforge-deployment, vercel-deploy, docker-essentials-1-0-0
Provider: OpenAI
Model: gpt-4.1-mini
Triggers: "deploy", "build", "CI/CD", "release"
```

## Sub-Agent Spawn Pattern

```typescript
// When main agent (Lehro Bits) needs to build something:
//
// 1. Architect generates spec + plan
// 2. Main agent reads plan, identifies parallelizable tasks
// 3. For each parallel task → spawn sub-agent:
//
// sessions_spawn({
//   task: "Implement Task 3: Stripe API Adapter. See PLAN.md for specs. Files: adapters/StripeAdapter.ts",
//   agentId: "coder",  // or "frontend-dev", "backend-dev"
//   mode: "run",       // one-shot execution
// })
//
// 4. Reviewer reviews each completed sub-agent output
// 5. Tester validates
// 6. Deployer deploys (optional)
```

## Rollback System

Every workflow state is saved before changes:

```bash
# Before any build phase
cp -r project/ workflows/<name>/states/$(date +%s)_pre-build/

# On failure
rm -rf project/*
cp -r workflows/<name>/states/<timestamp>/* project/
```

State files are written to `workflows/<name>/states/` as markdown with:
- Git commit hash
- File diff
- Build status
- Agent outputs

## Config File
The runtime loads `config/agents.yaml` for agent/provider overrides and `config/providers.yaml` for model endpoints.
This markdown file is the readable mirror of those live manifests.
