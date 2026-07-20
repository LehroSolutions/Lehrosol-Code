/**
 * State Store
 * Workflow state persistence and rollback management
 */
import { Workflow, StateSnapshot } from '../types/index.js';
export declare class StateStore {
    private basePath;
    constructor(basePath: string);
    private ensureDirectory;
    getWorkflowPath(projectName: string): string;
    private getStatesPath;
    /**
     * Create a state snapshot before executing a task
     */
    createSnapshot(projectName: string, action: string, projectPath: string): StateSnapshot;
    private captureFileState;
    private getAllFiles;
    private copyProjectState;
    /**
     * Restore project to a previous snapshot
     */
    rollback(projectName: string, snapshotId: string, projectPath: string): void;
    private clearDirectory;
    /**
     * List all snapshots for a project
     */
    listSnapshots(projectName: string): StateSnapshot[];
    /**
     * Load every persisted workflow in the state directory.
     */
    loadAllWorkflows(): Workflow[];
    /**
     * Save workflow state to file
     */
    saveWorkflow(workflow: Workflow): void;
    private generateStatusMarkdown;
    private getStatusIcon;
    /**
     * Load workflow state from file
     */
    loadWorkflow(projectName: string): Workflow | null;
    /**
     * Create workflow documentation files
     */
    createWorkflowDocs(projectName: string, spec: string, plan: string, context: string): void;
}
//# sourceMappingURL=state-store.d.ts.map