import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { loadAgentConfigs } from './agent-config.js';

describe('loadAgentConfigs', () => {
  it('merges YAML overrides into the built-in agent defaults', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'lehrocode-agent-config-'));
    const configPath = join(tempDir, 'agents.yaml');

    writeFileSync(
      configPath,
      [
        'agents:',
        '  coder:',
        '    provider: claude',
        '    model: claude-sonnet-4-20250514',
        '  reviewer:',
        '    maxRetries: 5',
        ''
      ].join('\n')
    );

    const configs = loadAgentConfigs(configPath);

    expect(configs.get('coder')?.provider).toBe('claude');
    expect(configs.get('coder')?.model).toBe('claude-sonnet-4-20250514');
    expect(configs.get('coder')?.skills).toContain('test-driven-development');
    expect(configs.get('reviewer')?.maxRetries).toBe(5);
    expect(configs.get('architect')?.provider).toBe('qwen');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('falls back to the built-in defaults when the manifest is absent', () => {
    const configs = loadAgentConfigs(join(tmpdir(), 'lehrocode-missing-agent-config.yaml'));

    expect(configs.get('architect')?.provider).toBe('qwen');
    expect(configs.get('tester')?.provider).toBe('github-copilot');
  });
});
