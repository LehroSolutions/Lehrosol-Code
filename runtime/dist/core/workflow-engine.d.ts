/**
 * Workflow Engine
 * DAG-based task execution with parallel processing support
 */
import { Task, Workflow, TaskResult, Plan } from '../types/index.js';
import { EventEmitter } from 'events';
export declare class WorkflowEngine extends EventEmitter {
    private workflow;
    private dag;
    private runningTasks;
    private maxConcurrency;
    constructor(workflow: Workflow, maxConcurrency?: number);
    private buildDAG;
    private detectCycles;
    execute(taskExecutor: (task: Task) => Promise<TaskResult>): Promise<Workflow>;
    private executeTask;
    private skipDependents;
    private waitForTaskCompletion;
    pause(): void;
    resume(): void;
    getReadyTasks(): Task[];
    static fromPlan(plan: Plan, projectPath: string): Workflow;
}
//# sourceMappingURL=workflow-engine.d.ts.map