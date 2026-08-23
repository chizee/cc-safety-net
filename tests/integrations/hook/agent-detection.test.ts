import { describe, expect, test } from 'bun:test';
import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { PATH_CANONICALIZATION_LIMITS } from '@/analyzer/path-canonicalization';
import { detectClaudeShapeAgent } from '@/integrations/hook/agent-detection';
import { withEnv, withTempDir } from '../../helpers';

describe('Claude-shaped hook agent detection', () => {
  test.each([
    ['.codex', 'codex'],
    ['.copilot', 'copilot-cli'],
    ['.claude', 'claude-code'],
  ] as const)('detects the default %s root', async (directory, agent) => {
    await withTempDir('cc-safety-net-agent-home-', (home) => {
      const transcript = join(home, directory, 'sessions', 'transcript.jsonl');
      mkdirSync(join(transcript, '..'), { recursive: true });

      expect(withEnv({ HOME: home }, () => detectClaudeShapeAgent(transcript))).toBe(agent);
    });
  });

  test.each([
    ['CODEX_HOME', 'codex'],
    ['COPILOT_HOME', 'copilot-cli'],
    ['CLAUDE_CONFIG_DIR', 'claude-code'],
  ] as const)('honors the %s root override', async (variable, agent) => {
    await withTempDir('cc-safety-net-agent-override-', (root) => {
      const configuredRoot = join(root, 'state');
      const transcript = join(configuredRoot, 'sessions', 'transcript.jsonl');
      mkdirSync(join(transcript, '..'), { recursive: true });

      expect(
        withEnv({ [variable]: configuredRoot }, () => detectClaudeShapeAgent(transcript)),
      ).toBe(agent);
    });
  });

  test('returns unknown for absent, relative, sibling-prefix, and ambiguous evidence', async () => {
    await withTempDir('cc-safety-net-agent-unknown-', (root) => {
      const codex = join(root, '.codex');
      const sibling = join(root, '.codex-evil', 'transcript.jsonl');
      const shared = join(root, 'shared');
      mkdirSync(join(sibling, '..'), { recursive: true });
      mkdirSync(shared, { recursive: true });

      expect(detectClaudeShapeAgent(null)).toBe('unknown');
      expect(detectClaudeShapeAgent(undefined)).toBe('unknown');
      expect(detectClaudeShapeAgent('relative/transcript.jsonl')).toBe('unknown');
      expect(detectClaudeShapeAgent({ nested: true })).toBe('unknown');
      expect(detectClaudeShapeAgent(42)).toBe('unknown');
      expect(withEnv({ CODEX_HOME: codex }, () => detectClaudeShapeAgent(sibling))).toBe('unknown');
      expect(
        withEnv({ CODEX_HOME: shared, COPILOT_HOME: shared }, () =>
          detectClaudeShapeAgent(join(shared, 'transcript.jsonl')),
        ),
      ).toBe('unknown');
    });
  });

  test('canonicalizes symlinked transcript paths', async () => {
    await withTempDir('cc-safety-net-agent-symlink-', (root) => {
      const codex = join(root, 'codex');
      const link = join(root, 'codex-link');
      mkdirSync(codex);
      symlinkSync(codex, link, 'dir');

      expect(
        withEnv({ CODEX_HOME: codex }, () =>
          detectClaudeShapeAgent(join(link, 'sessions', 'transcript.jsonl')),
        ),
      ).toBe('codex');
    });
  });

  test('uses Claude environment evidence only when no path root matches', async () => {
    await withTempDir('cc-safety-net-agent-env-', (root) => {
      const transcript = join(root, 'elsewhere', 'transcript.jsonl');
      expect(
        withEnv({ HOME: root, CLAUDECODE: '1' }, () => detectClaudeShapeAgent(transcript)),
      ).toBe('claude-code');
      expect(
        withEnv({ HOME: root, CLAUDE_CODE_ENTRYPOINT: 'cli' }, () =>
          detectClaudeShapeAgent(transcript),
        ),
      ).toBe('claude-code');
    });
  });

  test('returns unknown when canonicalization exceeds its work limit', async () => {
    await withTempDir('cc-safety-net-agent-limit-', (root) => {
      const transcript = join(
        root,
        'm'.repeat(PATH_CANONICALIZATION_LIMITS.maxProcessedCandidateBytes + 1),
      );
      expect(withEnv({ CODEX_HOME: root }, () => detectClaudeShapeAgent(transcript))).toBe(
        'unknown',
      );
    });
  });
});
