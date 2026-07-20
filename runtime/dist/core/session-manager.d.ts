/**
 * Session Manager
 * Handles sub-agent spawning and session lifecycle
 */
import { Session, AgentRole, Message, AgentConfig, Task, TaskResult, ProviderResolution } from '../types/index.js';
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
export declare class SessionManager {
    private sessions;
    private agentConfigs;
    private skillsPath;
    private agentsPath;
    private providerRegistry;
    private agentConfigPath;
    constructor(options: SessionManagerOptions);
    private loadAgentPrompt;
    private loadSkillPrompt;
    spawn(options: SpawnOptions): Promise<Session>;
    private buildSystemPrompt;
    private buildTaskPrompt;
    addMessage(sessionId: string, role: Message['role'], content: string): void;
    completeSession(sessionId: string, success: boolean): void;
    getSession(sessionId: string): Session | undefined;
    getActiveSessions(): Session[];
    /**
     * Execute a task using a simulated agent
     * In production, this would call an LLM API
     */
    executeTask(session: Session): Promise<TaskResult>;
    private delay;
    getAgentConfig(role: AgentRole): AgentConfig | undefined;
    resolveProvider(providerId: string, model?: string): ProviderResolution;
    listAgentConfigs(): AgentConfig[];
    listAgents(): AgentRole[];
    listProviders(): ProviderResolution[];
}
//# sourceMappingURL=session-manager.d.ts.map