import { describe, expect, it } from 'vitest';
import { parseTaskResponse } from './task-result-parser.js';

describe('parseTaskResponse', () => {
  it('parses structured JSON output from the model', () => {
    const result = parseTaskResponse(`
      {
        "status": "success",
        "summary": "Implemented the provider layer",
        "filesCreated": ["src/providers/registry.ts", "src/providers/http-client.ts"],
        "filesModified": ["src/core/session-manager.ts"],
        "output": "Added provider resolution and live HTTP clients.",
        "issues": ["None"]
      }
    `);

    expect(result.success).toBe(true);
    expect(result.filesCreated).toEqual(['src/providers/registry.ts', 'src/providers/http-client.ts']);
    expect(result.filesModified).toEqual(['src/core/session-manager.ts']);
    expect(result.output).toContain('Implemented the provider layer');
    expect(result.output).toContain('Added provider resolution and live HTTP clients.');
  });

  it('falls back to the raw text when the output is not JSON', () => {
    const result = parseTaskResponse('Plain text response from a model.');

    expect(result.success).toBe(true);
    expect(result.output).toBe('Plain text response from a model.');
    expect(result.filesCreated).toEqual([]);
    expect(result.filesModified).toEqual([]);
  });
});
