# OWASP Top 10 for Agentic AI Applications — 2026

## Overview

This file maps the **OWASP Top 10 for Agentic Applications (2026)** to LehroCode/LehroForge security controls. Use this to audit every AI agent, tool, or API integration before deployment.

---

## The 10 Risks

### AAI01: Prompt Injection
**Description:** Untrusted input manipulates agent behavior through crafted prompts (direct or indirect injection).
**Examples:** Hidden instructions in scraped web content, malicious documents, API responses.
**Controls for LehroCode:**
| Control | Where | How |
|--------|-------|-----|
| Input sandboxing | lehrocode-spec-driven-dev | Never pass unescaped user input directly to LLM system prompts |
| Input validation | All agents | Sanitize text inputs before LLM passes — strip zero-width chars, control chars, HTML |
| System prompt isolation | Every agent | Keep system prompts in immutable template files — never concatenate user input into system prompt |
| Context separation | Multi-agent orchestrator | Isolate untrusted content in its own message role — never merge with instructions |
| Output filtering | Review stage | Use a lightweight validator (rule-based, not LLM) to detect injected commands in outputs |

### AAI02: Insecure Output Handling
**Description:** Agent output is consumed by downstream systems without validation, enabling code injection, XSS, or privilege escalation.
**Examples:** Agent generates code that gets auto-executed, agent writes to files with injected payloads, markdown output triggers HTML rendering.
**Controls:**
| Control | Where | How |
|--------|-------|-----|
| Output validation gates | lehroforge-testing-suite | Validate all agent outputs before passing to external systems (Zod schemas, CSP headers) |
| Sandboxed execution | workflow-orchestration | Never eval() or exec() agent output directly — use AST parsing, static analysis |
| Content-type enforcement | adapter-layer | Enforce MIME types on all API responses — reject unexpected types |
| Template sanitization | frontend-skill | Escape all dynamic content in templates (HTML entities, JS escaping) |

### AAI03: Agent Lifecycle Management
**Description:** Agents lack proper authentication, authorization, logging, and monitoring throughout their lifecycle.
**Examples:** Agent credentials hard-coded, no audit trails, agents run indefinitely without governance.
**Controls:**
| Control | Where | How |
|--------|-------|-----|
| Credential rotation | lehroforge-security-audit | Rotate API keys quarterly — use vault for all secrets, never in code |
| Audit logging | Workflow Executor | Log every agent action: tool call, result, timestamp, agent ID |
| Session timeouts | lehrocode-rollback-recovery | Auto-terminate idle agents after 30 min — enforce max lifecycle |
| Least privilege | All adapters | Each API adapter gets minimum permissions — no admin keys |
| Agent registry | lehrocode-multi-agent-orchestration | Maintain registry of all active agents with roles, permissions, lifecycle state |

### AAI04: Data Poisoning
**Description:** Training data or context documents are manipulated to corrupt agent behavior.
**Examples:** Malicious code samples in training data, poisoned context files, corrupted vector DB embeddings.
**Controls:**
| Control | Where | How |
|--------|-------|-----|
| Source verification | context-capture | Verify provenance of all context documents and reference materials |
| Integrity checking | lehrocode-context-capture | Hash and sign all context files — verify on load |
| Data pipeline segregation | lehroforge-deployment | Separate training/data pipeline from runtime pipeline |
| Embedding validation | context-capture | Monitor embedding anomaly scores — flag outliers above threshold |

### AAI05: Excessive Agency
**Description:** Agent has more tools, access, and autonomy than needed, amplifying the damage from injection or errors.
**Examples:** Agent can both read and write to production DB, agent has SSH access when it only needs API access.
**Controls:**
| Control | Where | How |
|--------|-------|-----|
| Tool whitelisting | lehrocode-spec-driven-dev | Each agent role declares exactly which tools it can call — deny all others |
| Scope limiting | adapter-registry | API adapters restricted to specific endpoints — no wildcard access |
| Human-in-the-loop | lehrocode-code-review-gates | Destructive operations require human approval before execution |
| Capability scoping | agent-roles.md | Define each agent's capabilities in a capabilities manifest — enforce at runtime |

### AAI06: Insecure Tool Design
**Description:** Agent tools (APIs, functions, scripts) have security flaws that attackers can exploit through agents.
**Examples:** SQL injection in tool parameters, path traversal in file tools, command injection in shell tools.
**Controls:**
| Control | Where | How |
|--------|-------|-----|
| Parameterized tool calls | All adapters | Use parameterized queries for all DB/file operations — no string interpolation |
| Input schemas | Zod validators | Every tool input defined with Zod schema — reject unknown fields |
| Rate limiting | BaseAdapter | Per-tool rate limits — prevent abuse and DoS |
| Tool isolation | Docker/runtime | Each tool runs in isolated context — no shared state between tools |

### AAI07: Over-Transparency (Data Leakage)
**Description:** Agent inadvertently exposes sensitive data through its outputs, tool calls, error messages, or memory.
**Examples:** Agent reveals API keys in responses, system prompts leaked in error output, memory contains PII.
**Controls:**
| Control | Where | How |
|--------|-------|-----|
| Response sanitization | Workflow Executor | Strip PII, secrets, sensitive patterns from all agent outputs |
| Error message scrubbing | All agents | Generic error messages only — never expose stack traces, paths, keys |
| Memory encryption | lehrocode-context-capture | Encrypt stored memory at rest — separate keys per tenant |
| Log scrubbing | AuditLogger | Auto-redact secrets from logs using pattern matching before writing |
| Data classification | lehroforge-deployment | Classify data by sensitivity level — restrict access based on agent role |

### AAI08: Supply Chain Vulnerabilities
**Description:** Compromised LLMs, tools, embeddings, or third-party integrations introduce vulnerabilities into the agent system.
**Examples:** Malicious LLM provider injects backdoors, compromised plugin, poisoned model fine-tuning.
**Controls:**
| Control | Where | How |
|--------|-------|-----|
| Provider attestation | lehroforge-security-audit | Verify LLM provider integrity — use attested endpoints only |
| Skill verification | skill-vetting | Scan all installed skills for malicious code before activation |
| Dependency scanning | CI/CD | Automate dependency vulnerability scanning (npm audit, Dependabot) |
| Contract verification | adapter-registry | Verify API contracts match specification — detect drift |

### AAI09: Unauthorized Code Execution
**Description:** Agent generates or executes code without proper authorization, sandboxing, or validation.
**Examples:** Agent writes and runs arbitrary scripts, agent accesses production systems it shouldn't, agent modifies infrastructure.
**Controls:**
| Control | Where | How |
|--------|-------|-----|
| Code execution policy | lehrocode-spec-driven-dev | Define which environments can execute code — default: nothing |
| Sandbox enforcement | workflow-orchestration | All code runs in containerized sandbox — no host access |
| Approval gates | lehrocode-code-review-gates | Code execution requires review + approval |
| Immutable infrastructure | lehroforge-deployment | No direct agent access to production — deploy through CI/CD only |

### AAI10: Agent Entanglement
**Description:** Complex agent-to-agent interactions create unexpected security risks through cascading failures or emergent behavior.
**Examples:** Agent A's output corrupts Agent B's input, circular dependency between agents, race conditions in multi-agent workflows.
**Controls:**
| Control | Where | How |
|--------|-------|-----|
| Communication contracts | lehrocode-multi-agent-orchestration | Define strict contracts for inter-agent communication |
| Dependency mapping | orchestrator | Map all agent dependencies — detect circular dependencies at plan time |
| Isolation domains | workflow-orchestration | Agents run in isolated domains — cross-agent calls go through gateway |
| Circuit breakers | rollback-recovery | Kill cascading failures — circuit breaker between agent chains |

---

## Quick Audit Checklist

Use this checklist before deploying any LehroCode agent or LehroForge integration:

- [ ] **Injection:** All system prompts isolated from user input
- [ ] **Output:** All outputs validated before downstream consumption
- [ ] **Lifecycle:** Credentials rotated, audit logs active, session timeouts configured
- [ ] **Poisoning:** Context documents verified and signed
- [ ] **Agency:** Agent has minimum necessary tools — tool whitelist enforced
- [ ] **Tools:** All tool inputs validated with schemas — parameterized calls only
- [ ] **Leakage:** PII and secrets scrubbed from outputs and logs
- [ ] **Supply Chain:** All skills scanned — dependencies audited
- [ ] **Code Exec:** Sandboxed execution — approval gates for production
- [ ] **Entanglement:** Agent contracts defined — no circular dependencies

---

*Based on OWASP Top 10 for Agentic Applications — 2026 Edition*  
*OWASP is a community-led open project. The OWASP name and logo are trademarks.*
