import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import {
  createPathCanonicalizationBudget,
  isSameOrInsidePath,
  PathCanonicalizationLimitError,
  processPathResolver,
  resolveExistingPath,
} from '@/integrations/runtime';

type ClaudeShapeAgent = 'codex' | 'copilot-cli' | 'claude-code' | 'unknown';

/** Detect the caller behind a Claude Code-shaped hook payload. */
export function detectClaudeShapeAgent(
  transcriptPath: string | null | undefined,
): ClaudeShapeAgent {
  if (transcriptPath !== undefined && transcriptPath !== null && !isAbsolute(transcriptPath)) {
    return 'unknown';
  }

  try {
    const budget = createPathCanonicalizationBudget();
    const transcript = transcriptPath
      ? resolveExistingPath(transcriptPath, processPathResolver, budget)
      : undefined;
    const home = process.env.HOME || homedir();
    const roots = [
      ['codex', process.env.CODEX_HOME || join(home, '.codex')],
      ['copilot-cli', process.env.COPILOT_HOME || join(home, '.copilot')],
      ['claude-code', process.env.CLAUDE_CONFIG_DIR || join(home, '.claude')],
    ] as const;
    const matches = transcript
      ? roots.flatMap(([agent, root]) => {
          if (!isAbsolute(root)) return [];
          return isSameOrInsidePath(
            transcript,
            resolveExistingPath(root, processPathResolver, budget),
          )
            ? [agent]
            : [];
        })
      : [];

    if (matches.length === 1) return matches[0] ?? 'unknown';
    if (matches.length > 1) return 'unknown';
  } catch (error) {
    if (error instanceof PathCanonicalizationLimitError) return 'unknown';
    return 'unknown';
  }

  if (process.env.CLAUDECODE === '1' || Boolean(process.env.CLAUDE_CODE_ENTRYPOINT)) {
    return 'claude-code';
  }
  return 'unknown';
}
