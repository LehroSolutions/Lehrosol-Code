import { existsSync, readFileSync } from 'fs';
import YAML from 'yaml';
import { z } from 'zod';
const providerManifestSchema = z.object({
    providers: z.record(z.string(), z.object({
        label: z.string().optional(),
        transport: z.enum(['openai-compatible', 'anthropic-messages']).optional(),
        endpoint: z.string().optional(),
        endpointEnv: z.string().optional(),
        apiKeyEnv: z.string().optional(),
        defaultModel: z.string().optional(),
        authHeader: z.enum(['authorization', 'x-api-key']).optional(),
        notes: z.string().optional()
    }).strict()).optional()
}).strict();
const BUILTIN_PROVIDER_PROFILES = [
    {
        id: 'openai',
        label: 'OpenAI',
        transport: 'openai-compatible',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        apiKeyEnv: 'OPENAI_API_KEY',
        defaultModel: 'gpt-4.1',
        authHeader: 'authorization',
        source: 'builtin'
    },
    {
        id: 'claude',
        label: 'Claude',
        transport: 'anthropic-messages',
        endpoint: 'https://api.anthropic.com/v1/messages',
        apiKeyEnv: 'ANTHROPIC_API_KEY',
        defaultModel: 'claude-sonnet-4-20250514',
        authHeader: 'x-api-key',
        source: 'builtin'
    },
    {
        id: 'github-copilot',
        label: 'GitHub Copilot',
        transport: 'openai-compatible',
        endpoint: 'https://models.inference.ai.azure.com/chat/completions',
        endpointEnv: 'GITHUB_COPILOT_ENDPOINT',
        apiKeyEnv: 'GITHUB_TOKEN',
        defaultModel: 'gpt-4.1',
        authHeader: 'authorization',
        notes: 'Use a Copilot-compatible or GitHub Models gateway endpoint.',
        source: 'builtin'
    },
    {
        id: 'qwen',
        label: 'Qwen',
        transport: 'openai-compatible',
        endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        apiKeyEnv: 'DASHSCOPE_API_KEY',
        defaultModel: 'qwen-plus',
        authHeader: 'authorization',
        source: 'builtin'
    },
    {
        id: 'kimi',
        label: 'Kimi',
        transport: 'openai-compatible',
        endpoint: 'https://api.moonshot.cn/v1/chat/completions',
        apiKeyEnv: 'MOONSHOT_API_KEY',
        defaultModel: 'kimi-k2',
        authHeader: 'authorization',
        source: 'builtin'
    },
    {
        id: 'glm',
        label: 'GLM',
        transport: 'openai-compatible',
        endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        apiKeyEnv: 'ZHIPUAI_API_KEY',
        defaultModel: 'glm-4.5',
        authHeader: 'authorization',
        source: 'builtin'
    }
];
function normalizeProviderId(providerId) {
    return providerId.trim().toLowerCase();
}
function labelFromId(providerId) {
    return providerId
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}
function defaultAuthHeader(transport) {
    return transport === 'anthropic-messages' ? 'x-api-key' : 'authorization';
}
function loadManifest(providersPath) {
    if (!existsSync(providersPath)) {
        return {};
    }
    const rawContent = readFileSync(providersPath, 'utf-8').trim();
    if (!rawContent) {
        return {};
    }
    const parsed = providerManifestSchema.parse(YAML.parse(rawContent));
    return parsed.providers ?? {};
}
function mergeProviderProfile(providerId, entry, existing) {
    const transport = entry.transport ?? existing?.transport;
    if (!transport) {
        throw new Error(`Provider ${providerId} is missing a transport type`);
    }
    const apiKeyEnv = entry.apiKeyEnv ?? existing?.apiKeyEnv;
    if (!apiKeyEnv) {
        throw new Error(`Provider ${providerId} is missing apiKeyEnv`);
    }
    const defaultModel = entry.defaultModel ?? existing?.defaultModel;
    if (!defaultModel) {
        throw new Error(`Provider ${providerId} is missing defaultModel`);
    }
    const endpoint = entry.endpoint ?? existing?.endpoint;
    const endpointEnv = entry.endpointEnv ?? existing?.endpointEnv;
    if (!endpoint && !endpointEnv) {
        throw new Error(`Provider ${providerId} is missing endpoint or endpointEnv`);
    }
    return {
        id: providerId,
        label: entry.label ?? existing?.label ?? labelFromId(providerId),
        transport,
        endpoint,
        endpointEnv,
        apiKeyEnv,
        defaultModel,
        authHeader: entry.authHeader ?? existing?.authHeader ?? defaultAuthHeader(transport),
        notes: entry.notes ?? existing?.notes,
        source: 'config'
    };
}
export class ProviderRegistry {
    env;
    providers = new Map();
    constructor(options) {
        this.env = options.env ?? process.env;
        for (const provider of BUILTIN_PROVIDER_PROFILES) {
            this.providers.set(provider.id, provider);
        }
        const overrides = loadManifest(options.providersPath);
        for (const [providerId, entry] of Object.entries(overrides)) {
            const normalizedId = normalizeProviderId(providerId);
            const existing = this.providers.get(normalizedId);
            const merged = mergeProviderProfile(normalizedId, entry, existing);
            this.providers.set(normalizedId, merged);
        }
    }
    listProviders() {
        return Array.from(this.providers.values()).sort((left, right) => left.label.localeCompare(right.label));
    }
    getProvider(providerId) {
        return this.providers.get(normalizeProviderId(providerId));
    }
    resolve(providerId, modelOverride) {
        const profile = this.getProvider(providerId);
        if (!profile) {
            return {
                known: false,
                model: modelOverride?.trim() || '',
                configured: false,
                missing: [`Unknown provider: ${providerId}`]
            };
        }
        const endpoint = profile.endpointEnv
            ? this.env[profile.endpointEnv] ?? profile.endpoint
            : profile.endpoint;
        const apiKey = this.env[profile.apiKeyEnv];
        const model = modelOverride?.trim() || profile.defaultModel;
        const missing = [];
        if (!endpoint) {
            missing.push(profile.endpointEnv ? `endpoint (${profile.endpointEnv})` : 'endpoint');
        }
        if (!apiKey) {
            missing.push(`api key (${profile.apiKeyEnv})`);
        }
        if (!model) {
            missing.push('model');
        }
        return {
            known: true,
            profile,
            endpoint,
            apiKey,
            model,
            configured: missing.length === 0,
            missing
        };
    }
    listStatuses() {
        return this.listProviders().map(provider => this.resolve(provider.id, provider.defaultModel));
    }
}
