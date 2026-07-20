/**
 * Main Orchestrator
 * Coordinates workflow execution with agent spawning and state management
 */
import { Workflow, Task, TaskResult, AgentRole, Plan, ProviderResolution } from '../types/index.js';
import { EventEmitter } from 'events';
export interface OrchestratorOptions {
    skillsPath: string;
    agentsPath: string;
    workflowsPath: string;
    agentConfigPath?: string;
    providersPath?: string;
    maxConcurrency?: number;
}
export interface ExecuteOptions {
    workflow: Workflow;
    dryRun?: boolean;
    autoRollback?: boolean;
    providerId?: string;
    model?: string;
    onTaskStart?: (task: Task) => void;
    onTaskComplete?: (task: Task, result: TaskResult) => void;
    onTaskFail?: (task: Task, error: Error) => void;
}
export declare class Orchestrator extends EventEmitter {
    private sessionManager;
    private stateStore;
    private maxConcurrency;
    private activeWorkflows;
    constructor(options: OrchestratorOptions);
    /**
     * Execute a workflow with full orchestration
     */
    execute(options: ExecuteOptions): Promise<Workflow>;
    private executeTaskWithAgent;
    private findWorkflowForTask;
    /**
     * Simulate workflow execution for testing/dry-run
     */
    private simulateExecution;
    /**
     * Create a new workflow from a Plan
     */
    createWorkflowFromPlan(plan: Plan, projectPath: string): Workflow;
    /**
     * Load an existing workflow
     */
    loadWorkflow(projectName: string): Workflow | null;
    /**
     * Rollback a workflow to last good state
     */
    rollback(projectName: string, projectPath: string): void;
    /**
     * Pause a running workflow
     */
    pauseWorkflow(projectName: string): void;
    /**
     * Resume a paused workflow
     */
    resumeWorkflow(projectName: string): void;
    /**
     * Get workflow status
     */
    getStatus(projectName: string): {
        workflow?: Workflow;
        snapshots: number;
    };
    /**
     * List all managed workflows
     */
    listWorkflows(): string[];
    /**
     * Get available agents
     */
    getAvailableAgents(): AgentRole[];
    /**
     * Get a specific agent config.
     */
    getAgentConfig(role: AgentRole): import("../types/index.js").AgentConfig | undefined;
    /**
     * Resolve a provider profile to see whether the required secrets are present.
     */
    resolveProvider(providerId: string, model?: string): ProviderResolution;
    /**
     * Get full agent configuration records.
     */
    getAgentConfigs(): import("../types/index.js").AgentConfig[];
    /**
     * Get configured provider profiles and their runtime status.
     */
    getAvailableProviders(): ProviderResolution[];
}
//# sourceMappingURL=orchestrator.d.ts.map