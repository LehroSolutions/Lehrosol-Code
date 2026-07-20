/**
 * State Store
 * Workflow state persistence and rollback management
 */

import { 
  Workflow, 
  StateSnapshot, 
  FileDiff,
  WorkflowStatus 
} from '../types/index.js';
import { 
  existsSync, 
  mkdirSync, 
  writeFileSync, 
  readFileSync,
  copyFileSync,
  statSync,
  readdirSync,
  rmSync
} from 'fs';
import { join, dirname, relative } from 'path';
import { execSync } from 'child_process';

export class StateStore {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  getWorkflowPath(projectName: string): string {
    return join(this.basePath, projectName);
  }

  private getStatesPath(projectName: string): string {
    const statesPath = join(this.getWorkflowPath(projectName), 'states');
    if (!existsSync(statesPath)) {
      mkdirSync(statesPath, { recursive: true });
    }
    return statesPath;
  }

  /**
   * Create a state snapshot before executing a task
   */
  createSnapshot(
    projectName: string, 
    action: string,
    projectPath: string
  ): StateSnapshot {
    const timestamp = new Date();
    const snapshotId = `${timestamp.getTime()}_${action.replace(/\s+/g, '_')}`;
    
    // Get git hash if available
    let gitHash: string | undefined;
    try {
      gitHash = execSync('git rev-parse HEAD', { 
        cwd: projectPath,
        encoding: 'utf-8'
      }).trim();
    } catch {
      // Not a git repo or git not available
    }

    // Capture file state
    const fileDiff = this.captureFileState(projectPath);

    // Save snapshot to states directory
    const statesPath = this.getStatesPath(projectName);
    const snapshotPath = join(statesPath, `${snapshotId}.json`);
    
    const snapshot: StateSnapshot = {
      id: snapshotId,
      timestamp,
      action,
      gitHash,
      fileDiff,
      taskResults: {}
    };

    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

    // Also save a full copy of current files for rollback
    const snapshotDir = join(statesPath, snapshotId);
    this.copyProjectState(projectPath, snapshotDir);

    return snapshot;
  }

  private captureFileState(projectPath: string): FileDiff[] {
    const diffs: FileDiff[] = [];
    
    try {
      const files = this.getAllFiles(projectPath);
      for (const file of files) {
        // Skip node_modules, .git, etc.
        if (file.includes('node_modules') || 
            file.includes('.git') || 
            file.includes('__pycache__')) {
          continue;
        }

        const content = readFileSync(file, 'utf-8');
        diffs.push({
          path: relative(projectPath, file),
          after: content,
          operation: 'modified'
        });
      }
    } catch (error) {
      console.error('Error capturing file state:', error);
    }

    return diffs;
  }

  private getAllFiles(dir: string): string[] {
    const files: string[] = [];
    
    try {
      const items = readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const path = join(dir, item.name);
        
        if (item.isDirectory()) {
          files.push(...this.getAllFiles(path));
        } else {
          files.push(path);
        }
      }
    } catch {
      // Directory might not exist or be accessible
    }
    
    return files;
  }

  private copyProjectState(sourcePath: string, destPath: string): void {
    if (!existsSync(destPath)) {
      mkdirSync(destPath, { recursive: true });
    }

    try {
      const items = readdirSync(sourcePath, { withFileTypes: true });
      
      for (const item of items) {
        const srcPath = join(sourcePath, item.name);
        const dstPath = join(destPath, item.name);

        // Skip certain directories
        if (item.name === 'node_modules' || 
            item.name === '.git' || 
            item.name === '__pycache__') {
          continue;
        }

        if (item.isDirectory()) {
          this.copyProjectState(srcPath, dstPath);
        } else {
          copyFileSync(srcPath, dstPath);
        }
      }
    } catch (error) {
      console.error('Error copying project state:', error);
    }
  }

  /**
   * Restore project to a previous snapshot
   */
  rollback(projectName: string, snapshotId: string, projectPath: string): void {
    const statesPath = this.getStatesPath(projectName);
    const snapshotDir = join(statesPath, snapshotId);

    if (!existsSync(snapshotDir)) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    // Clear current project state
    this.clearDirectory(projectPath);

    // Restore from snapshot
    this.copyProjectState(snapshotDir, projectPath);

    console.log(`Rolled back to snapshot: ${snapshotId}`);
  }

  private clearDirectory(dir: string): void {
    try {
      const items = readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const path = join(dir, item.name);
        
        // Keep .git and node_modules
        if (item.name === '.git' || item.name === 'node_modules') {
          continue;
        }

        rmSync(path, { recursive: true, force: true });
      }
    } catch (error) {
      console.error('Error clearing directory:', error);
    }
  }

  /**
   * List all snapshots for a project
   */
  listSnapshots(projectName: string): StateSnapshot[] {
    const statesPath = this.getStatesPath(projectName);
    const snapshots: StateSnapshot[] = [];

    try {
      const files = readdirSync(statesPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = readFileSync(join(statesPath, file), 'utf-8');
            snapshots.push(JSON.parse(content));
          } catch {
            // Skip invalid snapshots
          }
        }
      }
    } catch {
      // No states directory yet
    }

    return snapshots.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Load every persisted workflow in the state directory.
   */
  loadAllWorkflows(): Workflow[] {
    const workflows: Workflow[] = [];

    try {
      const entries = readdirSync(this.basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const workflow = this.loadWorkflow(entry.name);
        if (workflow) {
          workflows.push(workflow);
        }
      }
    } catch {
      // No workflows have been persisted yet.
    }

    return workflows;
  }

  /**
   * Save workflow state to file
   */
  saveWorkflow(workflow: Workflow): void {
    const workflowPath = this.getWorkflowPath(workflow.name);
    
    if (!existsSync(workflowPath)) {
      mkdirSync(workflowPath, { recursive: true });
    }

    const statusPath = join(workflowPath, 'STATUS.md');
    const statusContent = this.generateStatusMarkdown(workflow);
    writeFileSync(statusPath, statusContent);

    // Also save as JSON for programmatic access
    const jsonPath = join(workflowPath, 'workflow.json');
    writeFileSync(jsonPath, JSON.stringify(workflow, null, 2));
  }

  private generateStatusMarkdown(workflow: Workflow): string {
    const lines = [
      `# ${workflow.name} - Workflow Status`,
      '',
      `**Status:** ${workflow.status}`,
      `**Started:** ${workflow.startedAt?.toISOString() || 'Not started'}`,
      `**Completed:** ${workflow.completedAt?.toISOString() || 'In progress'}`,
      '',
      '## Tasks',
      ''
    ];

    for (const task of workflow.tasks) {
      const status = task.status.toUpperCase();
      const icon = this.getStatusIcon(task.status);
      lines.push(`- ${icon} **${task.name}** (${task.agent}) - ${status}`);
      
      if (task.result) {
        lines.push(`  - Result: ${task.result.success ? '✓ Success' : '✗ Failed'}`);
        if (task.result.filesCreated.length > 0) {
          lines.push(`  - Created: ${task.result.filesCreated.join(', ')}`);
        }
      }
      
      if (task.error) {
        lines.push(`  - Error: ${task.error}`);
      }
      
      lines.push('');
    }

    lines.push('');
    lines.push('---');
    lines.push(`*Last updated: ${new Date().toISOString()}*`);

    return lines.join('\n');
  }

  private getStatusIcon(status: WorkflowStatus | string): string {
    const icons: Record<string, string> = {
      'completed': '✓',
      'failed': '✗',
      'running': '▶',
      'pending': '○',
      'skipped': '⊘',
      'paused': '⏸',
      'rolled_back': '↩'
    };
    return icons[status] || '?';
  }

  /**
   * Load workflow state from file
   */
  loadWorkflow(projectName: string): Workflow | null {
    const jsonPath = join(this.getWorkflowPath(projectName), 'workflow.json');
    
    if (!existsSync(jsonPath)) {
      return null;
    }

    try {
      const content = readFileSync(jsonPath, 'utf-8');
      const data = JSON.parse(content);
      
      // Restore Date objects
      return {
        ...data,
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
        tasks: data.tasks.map((t: Record<string, unknown>) => ({
          ...t,
          startedAt: t.startedAt ? new Date(t.startedAt as string) : undefined,
          completedAt: t.completedAt ? new Date(t.completedAt as string) : undefined
        })),
        stateSnapshots: data.stateSnapshots.map((s: Record<string, unknown>) => ({
          ...s,
          timestamp: new Date(s.timestamp as string)
        }))
      };
    } catch (error) {
      console.error('Error loading workflow:', error);
      return null;
    }
  }

  /**
   * Create workflow documentation files
   */
  createWorkflowDocs(
    projectName: string, 
    spec: string, 
    plan: string,
    context: string
  ): void {
    const workflowPath = this.getWorkflowPath(projectName);
    
    if (!existsSync(workflowPath)) {
      mkdirSync(workflowPath, { recursive: true });
    }

    writeFileSync(join(workflowPath, 'SPEC.md'), spec);
    writeFileSync(join(workflowPath, 'PLAN.md'), plan);
    writeFileSync(join(workflowPath, 'CONTEXT.md'), context);
  }
}
