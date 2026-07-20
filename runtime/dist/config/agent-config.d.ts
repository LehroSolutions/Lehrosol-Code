import { AgentConfig, AgentRole } from '../types/index.js';
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
export declare function createDefaultAgentConfigs(): Map<AgentRole, AgentConfig>;
export declare function loadAgentConfigs(agentConfigPath: string): Map<AgentRole, AgentConfig>;
//# sourceMappingURL=agent-config.d.ts.map