import { existsSync, readFileSync } from 'fs';
import { z } from 'zod';
import YAML from 'yaml';
import { AgentConfig, AgentRole } from '../types/index.js';

const AGENT_ROLES: AgentRole[] = [
  'architect',
  'coder',
  'frontend-dev',
  'backend-dev',
  'reviewer',
  'tester',
  'deployer'
];

const agentOverrideSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  skills: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional()
}).strict();

const agentManifestSchema = z.object({
  agents: z.record(z.string(), agentOverrideSchema).optional()
}).strict();

export interface AgentOverride {
  provider?: string;
  model?: string;
  skills?: string[];
  timeoutMs?: number;
  maxRetries?: number;
}

export interface AgentManifest {
  agents?: Record<string, AgentOverride>;
}

export function createDefaultAgentConfigs(): Map<AgentRole, AgentConfig> {
  const configs = new Map<AgentRole, AgentConfig>();

  configs.set('architect', {
    role: 'architect',
    skills: ['lehrocode-spec-driven-dev', 'lehrocode-context-capture'],
    systemPrompt: '',
    provider: 'qwen',
    model: 'qwen3.6-plus-preview',
    timeoutMs: 120000,
    maxRetries: 2
  });

  configs.set('coder', {
    role: 'coder',
    skills: ['test-driven-development', 'systematic-debugging', 'lehroforge-api-adapter'],
    systemPrompt: '',
    provider: 'openai',
    model: 'gpt-4.1',
    timeoutMs: 180000,
    maxRetries: 3
  });

  configs.set('frontend-dev', {
    role: 'frontend-dev',
    skills: ['frontend-skill', 'frontend-security-review', 'clean-code-review'],
    systemPrompt: '',
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    timeoutMs: 180000,
    maxRetries: 3
  });

  configs.set('backend-dev', {
    role: 'backend-dev',
    skills: ['lehroforge-api-adapter', 'lehroforge-security-audit', 'clean-code-review'],
    systemPrompt: '',
    provider: 'kimi',
    model: 'kimi-k2',
    timeoutMs: 180000,
    maxRetries: 3
  });

  configs.set('reviewer', {
    role: 'reviewer',
    skills: ['lehrocode-code-review-gates', 'clean-code-review', 'security-audit'],
    systemPrompt: '',
    provider: 'glm',
    model: 'glm-4.5',
    timeoutMs: 90000,
    maxRetries: 2
  });

  configs.set('tester', {
    role: 'tester',
    skills: ['lehroforge-testing-suite', 'systematic-debugging'],
    systemPrompt: '',
    provider: 'github-copilot',
    model: 'gpt-4.1',
    timeoutMs: 120000,
    maxRetries: 2
  });

  configs.set('deployer', {
    role: 'deployer',
    skills: ['lehroforge-deployment', 'vercel-deploy', 'docker-essentials-1-0-0'],
    systemPrompt: '',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    timeoutMs: 300000,
    maxRetries: 1
  });

  return configs;
}

export function loadAgentConfigs(agentConfigPath: string): Map<AgentRole, AgentConfig> {
  const configs = createDefaultAgentConfigs();

  if (!existsSync(agentConfigPath)) {
    return configs;
  }

  const rawConfig = readFileSync(agentConfigPath, 'utf-8');
  const parsed = agentManifestSchema.parse(YAML.parse(rawConfig));
  const overrides = (parsed.agents ?? {}) as Record<string, AgentOverride>;

  for (const [roleName, override] of Object.entries(overrides)) {
    if (!isAgentRole(roleName)) {
      continue;
    }

    const current = configs.get(roleName);
    if (!current) {
      continue;
    }

    configs.set(roleName, {
      ...current,
      ...(override.provider !== undefined ? { provider: override.provider } : {}),
      ...(override.model !== undefined ? { model: override.model } : {}),
      ...(override.skills !== undefined ? { skills: override.skills } : {}),
      ...(override.timeoutMs !== undefined ? { timeoutMs: override.timeoutMs } : {}),
      ...(override.maxRetries !== undefined ? { maxRetries: override.maxRetries } : {})
    });
  }

  return configs;
}

function isAgentRole(value: string): value is AgentRole {
  return AGENT_ROLES.includes(value as AgentRole);
}
