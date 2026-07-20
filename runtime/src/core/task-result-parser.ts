import { z } from 'zod';
import { TaskResult } from '../types/index.js';

const taskResultSchema = z.object({
  status: z.enum(['success', 'partial', 'failed']),
  summary: z.string().default(''),
  filesCreated: z.array(z.string()).default([]),
  filesModified: z.array(z.string()).default([]),
  output: z.string().default(''),
  issues: z.array(z.string()).default([])
}).strict();

function extractJsonCandidate(content: string): string | null {
  const fencedMatch = content.match(/```json\s*([\s\S]*?)```/i) ?? content.match(/```\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] ?? content;
  const startIndex = candidate.indexOf('{');
  const endIndex = candidate.lastIndexOf('}');

  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    return null;
  }

  return candidate.slice(startIndex, endIndex + 1);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function parseTaskResponse(content: string): TaskResult {
  const candidate = extractJsonCandidate(content.trim());

  if (candidate) {
    try {
      const parsed = taskResultSchema.parse(JSON.parse(candidate) as unknown);
      const outputSections = [
        parsed.summary,
        parsed.output,
        parsed.issues.length > 0 ? `Issues:\n${parsed.issues.map((issue: string) => `- ${issue}`).join('\n')}` : ''
      ].filter(Boolean);

      return {
        success: parsed.status !== 'failed',
        output: outputSections.join('\n\n'),
        filesCreated: uniqueStrings(parsed.filesCreated),
        filesModified: uniqueStrings(parsed.filesModified)
      };
    } catch {
      // Fall through to the raw-text response.
    }
  }

  return {
    success: true,
    output: content.trim(),
    filesCreated: [],
    filesModified: []
  };
}
