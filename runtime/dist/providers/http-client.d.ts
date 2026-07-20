import { Message, ProviderResolution } from '../types/index.js';
export interface ProviderChatRequest {
    messages: Array<Pick<Message, 'role' | 'content'>>;
    model: string;
    temperature?: number;
    maxTokens?: number;
}
export interface ProviderChatResponse {
    content: string;
    raw: unknown;
}
export interface ProviderChatClient {
    complete(request: ProviderChatRequest): Promise<ProviderChatResponse>;
}
export declare function createProviderClient(resolution: ProviderResolution): ProviderChatClient;
//# sourceMappingURL=http-client.d.ts.map