/**
 * Main Orchestrator
 * Coordinates workflow execution with agent spawning and state management
 */
import { WorkflowEngine } from './workflow-engine.js';
import { SessionManager } from './session-manager.js';
import { StateStore } from '../memory/state-store.js';
import { EventEmitter } from 'events';
export class Orchestrator extends EventEmitter {
    sessionManager;
    stateStore;
    maxConcurrency;
    activeWorkflows = new Map();
    constructor(options) {
        super();
        this.sessionManager = new SessionManager({
            skillsPath: options.skillsPath,
            agentsPath: options.agentsPath,
            agentConfigPath: options.agentConfigPath ?? './config/agents.yaml',
            providersPath: options.providersPath ?? './config/providers.yaml'
        });
        this.stateStore = new StateStore(options.workflowsPath);
        this.maxConcurrency = options.maxConcurrency || 4;
    }
    /**
     * Execute a workflow with full orchestration
     */
    async execute(options) {
        const { workflow, dryRun = false, autoRollback = true, providerId, model } = options;
        this.emit('workflow:started', workflow);
        // Create initial state snapshot
        this.stateStore.createSnapshot(workflow.name, 'pre-execution', workflow.projectPath);
        const engine = new WorkflowEngine(workflow, this.maxConcurrency);
        this.activeWorkflows.set(workflow.name, engine);
        // Wire up event handlers
        engine.on('task:started', (task) => {
            this.emit('task:started', task);
            options.onTaskStart?.(task);
        });
        engine.on('task:completed', ({ task, result }) => {
            this.emit('task:completed', { task, result });
            options.onTaskComplete?.(task, result);
            // Save progress after each task
            this.stateStore.saveWorkflow(workflow);
        });
        engine.on('task:failed', ({ task, error }) => {
            this.emit('task:failed', { task, error });
            options.onTaskFail?.(task, error);
            // Auto-rollback if enabled
            if (autoRollback) {
                this.rollback(workflow.name, workflow.projectPath);
            }
        });
        // Execute with agent spawning
        try {
            if (dryRun) {
                // Simulate execution without actual LLM calls
                await this.simulateExecution(engine, workflow);
            }
            else {
                await engine.execute((task) => this.executeTaskWithAgent(task, providerId, model));
            }
            // Create final snapshot on success
            this.stateStore.createSnapshot(workflow.name, 'post-execution', workflow.projectPath);
            this.emit('workflow:completed', workflow);
        }
        catch (error) {
            workflow.status = 'failed';
            this.emit('workflow:failed', { workflow, error });
            throw error;
        }
        finally {
            this.activeWorkflows.delete(workflow.name);
            this.stateStore.saveWorkflow(workflow);
        }
        return workflow;
    }
    async executeTaskWithAgent(task, providerId, model) {
        // Create state snapshot before task execution
        const workflow = this.findWorkflowForTask(task);
        if (workflow) {
            this.stateStore.createSnapshot(workflow.name, `pre-task-${task.id}`, workflow.projectPath);
        }
        const session = await this.sessionManager.spawn({
            agentId: task.agent,
            task,
            providerId,
            model,
            context: {
                files: task.files,
                dependencies: task.dependencies
            }
        });
        this.emit('agent:spawned', { session, task });
        try {
            const result = await this.sessionManager.executeTask(session);
            this.sessionManager.completeSession(session.id, result.success);
            this.emit('agent:completed', { session, result });
            return result;
        }
        catch (error) {
            this.sessionManager.completeSession(session.id, false);
            this.emit('agent:failed', { session, error });
            return {
                success: false,
                output: error instanceof Error ? error.message : String(error),
                filesCreated: [],
                filesModified: []
            };
        }
    }
    findWorkflowForTask(task) {
        // Find the workflow containing this task
        for (const workflow of this.stateStore.loadAllWorkflows()) {
            if (workflow.tasks.some(t => t.id === task.id)) {
                return workflow;
            }
        }
        return undefined;
    }
    /**
     * Simulate workflow execution for testing/dry-run
     */
    async simulateExecution(engine, workflow) {
        console.log('[DRY RUN] Simulating workflow execution...\n');
        const tasks = workflow.tasks;
        for (const task of tasks) {
            console.log(`[DRY RUN] Task: ${task.name} (${task.agent})`);
            console.log(`  Status: ${task.status}`);
            console.log(`  Files: ${task.files.map(f => f.path).join(', ') || 'none'}`);
            console.log(`  Dependencies: ${task.dependencies.join(', ') || 'none'}\n`);
            // Simulate successful completion
            task.status = 'completed';
            task.result = {
                success: true,
                output: '[Simulated output]',
                filesCreated: task.files
                    .filter(f => f.action === 'create')
                    .map(f => f.path),
                filesModified: task.files
                    .filter(f => f.action === 'modify')
                    .map(f => f.path)
            };
        }
        workflow.status = 'completed';
        console.log('[DRY RUN] Workflow simulation complete.\n');
    }
    /**
     * Create a new workflow from a Plan
     */
    createWorkflowFromPlan(plan, projectPath) {
        const workflow = WorkflowEngine.fromPlan(plan, projectPath);
        // Save initial state
        this.stateStore.saveWorkflow(workflow);
        return workflow;
    }
    /**
     * Load an existing workflow
     */
    loadWorkflow(projectName) {
        return this.stateStore.loadWorkflow(projectName);
    }
    /**
     * Rollback a workflow to last good state
     */
    rollback(projectName, projectPath) {
        const snapshots = this.stateStore.listSnapshots(projectName);
        if (snapshots.length < 2) {
            console.log('No previous state to rollback to');
            return;
        }
        // Find last successful snapshot
        const lastGoodSnapshot = snapshots.find(s => !s.action.startsWith('pre-task-') &&
            !s.action.startsWith('post-'));
        if (!lastGoodSnapshot) {
            console.log('No valid rollback point found');
            return;
        }
        this.stateStore.rollback(projectName, lastGoodSnapshot.id, projectPath);
        const workflow = this.loadWorkflow(projectName);
        if (workflow) {
            workflow.status = 'rolled_back';
            this.stateStore.saveWorkflow(workflow);
        }
        this.emit('workflow:rolled_back', { projectName, snapshot: lastGoodSnapshot });
    }
    /**
     * Pause a running workflow
     */
    pauseWorkflow(projectName) {
        const engine = this.activeWorkflows.get(projectName);
        if (engine) {
            engine.pause();
        }
    }
    /**
     * Resume a paused workflow
     */
    resumeWorkflow(projectName) {
        const engine = this.activeWorkflows.get(projectName);
        if (engine) {
            engine.resume();
        }
    }
    /**
     * Get workflow status
     */
    getStatus(projectName) {
        const workflow = this.loadWorkflow(projectName);
        const snapshots = this.stateStore.listSnapshots(projectName);
        return {
            workflow: workflow || undefined,
            snapshots: snapshots.length
        };
    }
    /**
     * List all managed workflows
     */
    listWorkflows() {
        return this.stateStore.loadAllWorkflows().map(workflow => workflow.name);
    }
    /**
     * Get available agents
     */
    getAvailableAgents() {
        return this.sessionManager.listAgents();
    }
    /**
     * Get a specific agent config.
     */
    getAgentConfig(role) {
        return this.sessionManager.getAgentConfig(role);
    }
    /**
     * Resolve a provider profile to see whether the required secrets are present.
     */
    resolveProvider(providerId, model) {
        return this.sessionManager.resolveProvider(providerId, model);
    }
    /**
     * Get full agent configuration records.
     */
    getAgentConfigs() {
        return this.sessionManager.listAgentConfigs();
    }
    /**
     * Get configured provider profiles and their runtime status.
     */
    getAvailableProviders() {
        return this.sessionManager.listProviders();
    }
}
