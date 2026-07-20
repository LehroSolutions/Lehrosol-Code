/**
 * Workflow Engine
 * DAG-based task execution with parallel processing support
 */

import { 
  Task, 
  Workflow, 
  WorkflowStatus, 
  TaskStatus, 
  TaskResult,
  Plan,
  PlanTask 
} from '../types/index.js';
import { EventEmitter } from 'events';

interface DAGNode {
  task: Task;
  dependencies: Set<string>;
  dependents: Set<string>;
}

export class WorkflowEngine extends EventEmitter {
  private workflow: Workflow;
  private dag: Map<string, DAGNode> = new Map();
  private runningTasks: Set<string> = new Set();
  private maxConcurrency: number;

  constructor(workflow: Workflow, maxConcurrency = 4) {
    super();
    this.workflow = workflow;
    this.maxConcurrency = maxConcurrency;
    this.buildDAG();
  }

  private buildDAG(): void {
    // Initialize nodes
    for (const task of this.workflow.tasks) {
      this.dag.set(task.id, {
        task,
        dependencies: new Set(task.dependencies),
        dependents: new Set()
      });
    }

    // Build reverse edges (dependents)
    for (const [id, node] of this.dag) {
      for (const depId of node.dependencies) {
        const depNode = this.dag.get(depId);
        if (depNode) {
          depNode.dependents.add(id);
        }
      }
    }

    // Check for circular dependencies
    this.detectCycles();
  }

  private detectCycles(): void {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const visit = (id: string): boolean => {
      visited.add(id);
      recStack.add(id);

      const node = this.dag.get(id);
      if (node) {
        for (const dep of node.dependencies) {
          if (!visited.has(dep)) {
            if (visit(dep)) return true;
          } else if (recStack.has(dep)) {
            throw new Error(`Circular dependency detected: ${id} -> ${dep}`);
          }
        }
      }

      recStack.delete(id);
      return false;
    };

    for (const id of this.dag.keys()) {
      if (!visited.has(id)) {
        visit(id);
      }
    }
  }

  async execute(
    taskExecutor: (task: Task) => Promise<TaskResult>
  ): Promise<Workflow> {
    this.workflow.status = 'running';
    this.workflow.startedAt = new Date();
    this.emit('started', this.workflow);

    try {
      // Topological sort with parallel execution
      const pending = new Set<string>();
      const completed = new Set<string>();

      // Find initial tasks (no dependencies)
      for (const [id, node] of this.dag) {
        if (node.dependencies.size === 0) {
          pending.add(id);
        }
      }

      while (pending.size > 0 || this.runningTasks.size > 0) {
        // Start new tasks up to max concurrency
        while (
          pending.size > 0 && 
          this.runningTasks.size < this.maxConcurrency
        ) {
          const taskId = pending.values().next().value as string;
          pending.delete(taskId);
          this.runningTasks.add(taskId);
          
          // Execute task asynchronously
          this.executeTask(taskId, taskExecutor, completed, pending)
            .catch(err => {
              this.emit('error', { taskId, error: err });
            });
        }

        // Wait for at least one task to complete
        if (this.runningTasks.size > 0) {
          await this.waitForTaskCompletion();
        }
      }

      // Check if all tasks completed
      const failedTasks = this.workflow.tasks.filter(
        t => t.status === 'failed'
      );

      if (failedTasks.length > 0) {
        this.workflow.status = 'failed';
        this.emit('failed', { workflow: this.workflow, failedTasks });
      } else {
        this.workflow.status = 'completed';
        this.emit('completed', this.workflow);
      }

    } catch (error) {
      this.workflow.status = 'failed';
      this.emit('error', { workflow: this.workflow, error });
      throw error;
    } finally {
      this.workflow.completedAt = new Date();
    }

    return this.workflow;
  }

  private async executeTask(
    taskId: string,
    executor: (task: Task) => Promise<TaskResult>,
    completed: Set<string>,
    pending: Set<string>
  ): Promise<void> {
    const node = this.dag.get(taskId);
    if (!node) return;

    const task = node.task;
    task.status = 'running';
    task.startedAt = new Date();
    this.emit('task:started', task);

    try {
      const result = await executor(task);
      
      task.result = result;
      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = new Date();
      
      completed.add(taskId);
      this.runningTasks.delete(taskId);

      this.emit('task:completed', { task, result });

      // Queue dependent tasks if all their dependencies are met
      for (const dependentId of node.dependents) {
        const dependentNode = this.dag.get(dependentId);
        if (dependentNode) {
          const allDepsMet = [...dependentNode.dependencies]
            .every(depId => completed.has(depId));
          
          if (allDepsMet && !completed.has(dependentId)) {
            pending.add(dependentId);
          }
        }
      }

    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : String(error);
      task.completedAt = new Date();
      
      this.runningTasks.delete(taskId);
      this.emit('task:failed', { task, error });

      // Skip dependent tasks on failure
      this.skipDependents(taskId);
    }
  }

  private skipDependents(taskId: string): void {
    const node = this.dag.get(taskId);
    if (!node) return;

    for (const dependentId of node.dependents) {
      const dependent = this.dag.get(dependentId);
      if (dependent && dependent.task.status === 'pending') {
        dependent.task.status = 'skipped';
        this.emit('task:skipped', dependent.task);
        this.skipDependents(dependentId);
      }
    }
  }

  private waitForTaskCompletion(): Promise<void> {
    return new Promise(resolve => {
      const check = () => {
        if (this.runningTasks.size === 0) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  pause(): void {
    this.workflow.status = 'paused';
    this.emit('paused', this.workflow);
  }

  resume(): void {
    this.workflow.status = 'running';
    this.emit('resumed', this.workflow);
  }

  getReadyTasks(): Task[] {
    const ready: Task[] = [];
    for (const [id, node] of this.dag) {
      if (node.task.status === 'pending') {
        const depsCompleted = [...node.dependencies].every(depId => {
          const dep = this.dag.get(depId);
          return dep?.task.status === 'completed';
        });
        if (depsCompleted) {
          ready.push(node.task);
        }
      }
    }
    return ready;
  }

  static fromPlan(plan: Plan, projectPath: string): Workflow {
    const tasks: Task[] = plan.tasks.map(pt => ({
      id: pt.id,
      name: pt.name,
      agent: pt.agent,
      status: 'pending',
      dependencies: pt.dependsOn,
      files: pt.files,
      input: pt.input,
      output: pt.output,
      acceptance: pt.acceptance
    }));

    return {
      name: plan.name,
      projectPath,
      tasks,
      status: 'idle',
      stateSnapshots: []
    };
  }
}
