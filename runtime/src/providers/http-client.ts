import { z } from 'zod';
import {
  Message,
  ProviderResolution,
  ProviderTransport
} from '../types/index.js';

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

const openAIResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullable().optional()
    }).optional(),
    text: z.string().optional()
  })).min(1)
});

const anthropicResponseSchema = z.object({
  content: z.array(z.object({
    type: z.string().optional(),
    text: z.string().optional()
  })).min(1)
});

function parseJsonResponse(bodyText: string): unknown {
  return JSON.parse(bodyText) as unknown;
}

function ensureConfigured(resolution: ProviderResolution): asserts resolution is ProviderResolution & {
  known: true;
  profile: NonNullable<ProviderResolution['profile']>;
  endpoint: string;
  apiKey: string;
} {
  if (!resolution.known) {
    throw new Error(resolution.missing.join(', '));
  }

  if (!resolution.configured || !resolution.profile || !resolution.endpoint || !resolution.apiKey) {
    throw new Error(resolution.missing.join(', '));
  }
}

class OpenAICompatibleClient implements ProviderChatClient {
  constructor(private readonly resolution: ProviderResolution & {
    known: true;
    profile: NonNullable<ProviderResolution['profile']>;
    endpoint: string;
    apiKey: string;
  }) {}

  async complete(request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const response = await fetch(this.resolution.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resolution.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 4096
      })
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Provider request failed (${response.status} ${response.statusText}): ${rawText}`);
    }

    const raw = parseJsonResponse(rawText);
    const parsed = openAIResponseSchema.parse(raw);
    const firstChoice = parsed.choices[0];
    const content = firstChoice.message?.content ?? firstChoice.text ?? '';

    return {
      content,
      raw
    };
  }
}

class AnthropicClient implements ProviderChatClient {
  constructor(private readonly resolution: ProviderResolution & {
    known: true;
    profile: NonNullable<ProviderResolution['profile']>;
    endpoint: string;
    apiKey: string;
  }) {}

  async complete(request: ProviderChatRequest): Promise<ProviderChatResponse> {
    const systemMessage = request.messages.find(message => message.role === 'system')?.content ?? '';
    const messages = request.messages.filter(message => message.role !== 'system');

    const response = await fetch(this.resolution.endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': this.resolution.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.2,
        system: systemMessage,
        messages
      })
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new Error(`Provider request failed (${response.status} ${response.statusText}): ${rawText}`);
    }

    const raw = parseJsonResponse(rawText);
    const parsed = anthropicResponseSchema.parse(raw);
    const content = parsed.content
      .map((chunk: { type?: string; text?: string }) => chunk.text ?? '')
      .join('')
      .trim();

    return {
      content,
      raw
    };
  }
}

export function createProviderClient(resolution: ProviderResolution): ProviderChatClient {
  ensureConfigured(resolution);

  const transport: ProviderTransport = resolution.profile.transport;
  if (transport === 'anthropic-messages') {
    return new AnthropicClient(resolution);
  }

  return new OpenAICompatibleClient(resolution);
}
