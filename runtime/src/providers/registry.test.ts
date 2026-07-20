import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { ProviderRegistry } from './registry.js';

describe('ProviderRegistry', () => {
  it('exposes the built-in provider profiles', () => {
    const registry = new ProviderRegistry({
      providersPath: join(tmpdir(), 'lehrocode-missing-providers.yaml'),
      env: {}
    });

    const providerIds = registry.listProviders().map(provider => provider.id);

    expect(providerIds).toContain('openai');
    expect(providerIds).toContain('claude');
    expect(providerIds).toContain('github-copilot');
    expect(providerIds).toContain('qwen');
    expect(providerIds).toContain('kimi');
    expect(providerIds).toContain('glm');
    expect(registry.resolve('openai').configured).toBe(false);
  });

  it('merges provider overrides and custom providers from YAML', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'lehrocode-provider-config-'));
    const configPath = join(tempDir, 'providers.yaml');

    writeFileSync(
      configPath,
      [
        'providers:',
        '  openai:',
        '    defaultModel: gpt-4.1-mini',
        '  local:',
        '    label: Local Gateway',
        '    transport: openai-compatible',
        '    endpoint: https://example.com/v1/chat/completions',
        '    apiKeyEnv: LOCAL_GATEWAY_KEY',
        '    defaultModel: local-model',
        ''
      ].join('\n')
    );

    const registry = new ProviderRegistry({
      providersPath: configPath,
      env: {
        OPENAI_API_KEY: 'openai-test-key',
        LOCAL_GATEWAY_KEY: 'local-test-key'
      }
    });

    expect(registry.getProvider('openai')?.defaultModel).toBe('gpt-4.1-mini');
    expect(registry.getProvider('local')?.label).toBe('Local Gateway');
    expect(registry.resolve('local').configured).toBe(true);
    expect(registry.resolve('local').model).toBe('local-model');

    rmSync(tempDir, { recursive: true, force: true });
  });
});
