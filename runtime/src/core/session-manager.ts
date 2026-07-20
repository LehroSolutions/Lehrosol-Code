/**
 * Session Manager
 * Handles sub-agent spawning and session lifecycle
 */

import { 
  Session, 
  AgentRole, 
  Message, 
  AgentConfig,
  Task,
  TaskResult,
  ProviderResolution
} from '../types/index.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { loadAgentConfigs } from '../config/agent-config.js';
import { ProviderRegistry } from '../providers/registry.js';
import { createProviderClient } from '../providers/http-client.js';
import { parseTaskResponse } from './task-result-parser.js';

export interface SpawnOptions {
  agentId: AgentRole;
  task: Task;
  context?: Record<string, unknown>;
  timeoutMs?: number;
  providerId?: string;
  model?: string;
}

export interface SessionManagerOptions {
  skillsPath: string;
  agentsPath: string;
  agentConfigPath: string;
  providersPath: string;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private agentConfigs: Map<AgentRole, AgentConfig>;
  private skillsPath: string;
  private agentsPath: string;
  private providerRegistry: ProviderRegistry;
  private agentConfigPath: string;

  constructor(options: SessionManagerOptions) {
    this.skillsPath = options.skillsPath;
    this.agentsPath = options.agentsPath;
    this.agentConfigPath = options.agentConfigPath;
    this.providerRegistry = new ProviderRegistry({ providersPath: options.providersPath });
    this.agentConfigs = loadAgentConfigs(this.agentConfigPath);
  }

  private loadAgentPrompt(agentName: string): string {
    const candidateNames = [agentName];

    for (const candidateName of candidateNames) {
      try {
        const path = join(this.agentsPath, `${candidateName}.md`);
        return readFileSync(path, 'utf-8');
      } catch {
        // Try the next prompt source.
      }
    }

    if (agentName === 'frontend-dev') {
      return this.loadSkillPrompt('frontend-agent');
    }

    if (agentName === 'backend-dev') {
      return this.loadSkillPrompt('backend');
    }

    return `You are the ${agentName} agent for LehroCode.`;
  }

  private loadSkillPrompt(skillName: string): string {
    try {
      const path = join(this.skillsPath, skillName, 'SKILL.md');
      return readFileSync(path, 'utf-8');
    } catch {
      return '';
    }
  }

  async spawn(options: SpawnOptions): Promise<Session> {
    const config = this.agentConfigs.get(options.agentId);
    if (!config) {
      throw new Error(`Unknown agent: ${options.agentId}`);
    }

    const providerId = options.providerId ?? config.provider;
    const model = options.model ?? config.model;
    const agentPrompt = this.loadAgentPrompt(options.agentId);

    const session: Session = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId: options.agentId,
      taskId: options.task.id,
      providerId,
      model,
      status: 'active',
      context: options.context || {},
      messages: [],
      startedAt: new Date()
    };

    // Load skill content
    const skillContents = config.skills.map(skill => 
      this.loadSkillPrompt(skill)
    ).filter(Boolean);

    // Build system message
    const systemMessage: Message = {
      role: 'system',
      content: this.buildSystemPrompt(config, skillContents, options.task, agentPrompt, providerId, model),
      timestamp: new Date()
    };

    session.messages.push(systemMessage);

    // Add task instruction
    const taskMessage: Message = {
      role: 'user',
      content: this.buildTaskPrompt(options.task),
      timestamp: new Date()
    };

    session.messages.push(taskMessage);
    this.sessions.set(session.id, session);

    return session;
  }

  private buildSystemPrompt(
    config: AgentConfig, 
    skills: string[], 
    task: Task,
    agentPrompt: string,
    providerId: string,
    model: string
  ): string {
    return `# ${config.role.toUpperCase()} AGENT

${agentPrompt}

## Runtime Provider
- Provider: ${providerId}
- Model: ${model}
- Timeout: ${config.timeoutMs}ms
- Retries: ${config.maxRetries}

${config.systemPrompt ? `## Agent Manifest\n${config.systemPrompt}\n` : ''}

## Loaded Skills
${skills.map(s => `---\n${s}`).join('\n\n')}

## Task Context
- Task ID: ${task.id}
- Task Name: ${task.name}
- Agent Role: ${config.role}

Execute the task according to the provided PLAN.md and your role responsibilities.

Respond with a single JSON object using this shape:
{
  "status": "success" | "partial" | "failed",
  "summary": "Short summary of what you did",
  "filesCreated": ["path/to/file.ts"],
  "filesModified": ["path/to/file.ts"],
  "output": "Detailed output, implementation notes, or patch summary",
  "issues": ["Any blockers or follow-up items"]
}

Do not wrap the JSON object in markdown fences.
`;
  }

  private buildTaskPrompt(task: Task): string {
    const filesSection = task.files.map(f => 
      `- ${f.action.toUpperCase()}: ${f.path}${f.description ? ` (${f.description})` : ''}`
    ).join('\n');

    return `## Task: ${task.name}

### Input
${task.input}

### Files to Operate On
${filesSection || 'None specified'}

### Expected Output
${task.output}

### Acceptance Criteria
${task.acceptance}

Execute this task now and return only the JSON object requested by the system prompt.
`;
  }

  addMessage(sessionId: string, role: Message['role'], content: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push({
        role,
        content,
        timestamp: new Date()
      });
    }
  }

  completeSession(sessionId: string, success: boolean): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = success ? 'completed' : 'failed';
      session.completedAt = new Date();
    }
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'active');
  }

  /**
   * Execute a task using a simulated agent
   * In production, this would call an LLM API
   */
  async executeTask(session: Session): Promise<TaskResult> {
    const config = this.agentConfigs.get(session.agentId);
    if (!config) {
      throw new Error(`Unknown agent: ${session.agentId}`);
    }

    const resolution = this.providerRegistry.resolve(
      session.providerId ?? config.provider,
      session.model ?? config.model
    );

    if (!resolution.known || !resolution.configured) {
      return {
        success: false,
        output: `Provider ${session.providerId ?? config.provider} is not ready: ${resolution.missing.join(', ')}`,
        filesCreated: [],
        filesModified: []
      };
    }

    try {
      const client = createProviderClient(resolution);
      const response = await client.complete({
        messages: session.messages,
        model: resolution.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens
      });

      return parseTaskResponse(response.content);
    } catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : String(error),
        filesCreated: [],
        filesModified: []
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getAgentConfig(role: AgentRole): AgentConfig | undefined {
    return this.agentConfigs.get(role);
  }

  resolveProvider(providerId: string, model?: string): ProviderResolution {
    return this.providerRegistry.resolve(providerId, model);
  }

  listAgentConfigs(): AgentConfig[] {
    return Array.from(this.agentConfigs.values());
  }

  listAgents(): AgentRole[] {
    return Array.from(this.agentConfigs.keys());
  }

  listProviders(): ProviderResolution[] {
    return this.providerRegistry.listStatuses();
  }
}
