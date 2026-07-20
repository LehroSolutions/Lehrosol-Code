/**
 * LehroCode Runtime Types
 * Core type definitions for the swarm orchestrator
 */
export interface Task {
    id: string;
    name: string;
    agent: AgentRole;
    status: TaskStatus;
    dependencies: string[];
    files: FileOperation[];
    input: string;
    output?: string;
    acceptance: string;
    result?: TaskResult;
    startedAt?: Date;
    completedAt?: Date;
    error?: string;
}
export type AgentRole = 'architect' | 'coder' | 'frontend-dev' | 'backend-dev' | 'reviewer' | 'tester' | 'deployer';
export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
export interface TaskResult {
    success: boolean;
    output: string;
    filesCreated: string[];
    filesModified: string[];
    testsPassed?: number;
    testsFailed?: number;
}
export interface FileOperation {
    action: 'create' | 'modify' | 'delete';
    path: string;
    description?: string;
}
export type ProviderId = string;
export type ProviderTransport = 'openai-compatible' | 'anthropic-messages';
export interface ProviderProfile {
    id: ProviderId;
    label: string;
    transport: ProviderTransport;
    endpoint?: string;
    endpointEnv?: string;
    apiKeyEnv: string;
    defaultModel: string;
    authHeader?: 'authorization' | 'x-api-key';
    notes?: string;
    source?: 'builtin' | 'config';
}
export interface ProviderResolution {
    known: boolean;
    profile?: ProviderProfile;
    endpoint?: string;
    apiKey?: string;
    model: string;
    configured: boolean;
    missing: string[];
}
export interface Workflow {
    name: string;
    projectPath: string;
    tasks: Task[];
    status: WorkflowStatus;
    currentTaskId?: string;
    startedAt?: Date;
    completedAt?: Date;
    stateSnapshots: StateSnapshot[];
}
export type WorkflowStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'rolled_back';
export interface StateSnapshot {
    id: string;
    timestamp: Date;
    action: string;
    gitHash?: string;
    fileDiff: FileDiff[];
    taskResults: Record<string, TaskResult>;
}
export interface FileDiff {
    path: string;
    before?: string;
    after?: string;
    operation: 'created' | 'modified' | 'deleted';
}
export interface AgentConfig {
    role: AgentRole;
    provider: ProviderId;
    model: string;
    skills: string[];
    systemPrompt: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs: number;
    maxRetries: number;
}
export interface Skill {
    name: string;
    description: string;
    content: string;
    metadata?: SkillMetadata;
}
export interface SkillMetadata {
    emoji?: string;
    os?: string[];
    requires?: {
        anyBins?: string[];
        allBins?: string[];
    };
}
export interface Plan {
    name: string;
    description: string;
    dependencies: string[][];
    tasks: PlanTask[];
}
export interface PlanTask {
    id: string;
    name: string;
    agent: AgentRole;
    files: FileOperation[];
    input: string;
    output: string;
    acceptance: string;
    dependsOn: string[];
}
export interface Session {
    id: string;
    agentId: AgentRole;
    taskId: string;
    providerId?: ProviderId;
    model?: string;
    status: 'active' | 'completed' | 'failed';
    context: Record<string, unknown>;
    messages: Message[];
    startedAt: Date;
    completedAt?: Date;
}
export interface Message {
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp: Date;
}
//# sourceMappingURL=index.d.ts.map