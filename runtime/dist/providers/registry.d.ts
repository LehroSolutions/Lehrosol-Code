import { ProviderId, ProviderProfile, ProviderResolution } from '../types/index.js';
export interface ProviderRegistryOptions {
    providersPath: string;
    env?: NodeJS.ProcessEnv;
}
export declare class ProviderRegistry {
    private readonly env;
    private readonly providers;
    constructor(options: ProviderRegistryOptions);
    listProviders(): ProviderProfile[];
    getProvider(providerId: ProviderId): ProviderProfile | undefined;
    resolve(providerId: ProviderId, modelOverride?: string): ProviderResolution;
    listStatuses(): ProviderResolution[];
}
//# sourceMappingURL=registry.d.ts.map