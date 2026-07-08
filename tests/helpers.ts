import { expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VersionFetcher } from '@/bin/doctor/system-info';
import { analyzeCommand } from '@/core/analyze';
import { listAuditLogFiles } from '@/core/audit-scan';
import { loadConfig } from '@/core/config';
import { envTruthy } from '@/core/env';
import type { AnalyzeOptions, AuditLogEntry, Config, ExplainResult, TraceStep } from '@/types';

// Default empty config for tests that don't specify a cwd.
// This prevents loading the project's rulebook-backed config.
const DEFAULT_TEST_CONFIG: Config = { version: 1, rules: [] };
const CLI_ENTRYPOINT = join(process.cwd(), 'src/bin/cc-safety-net.ts');

function getOptionsFromEnv(cwd?: string, config?: Config): AnalyzeOptions {
  // If no cwd specified, use empty config to avoid loading project's config
  const effectiveConfig = config ?? (cwd ? loadConfig(cwd) : DEFAULT_TEST_CONFIG);
  return {
    cwd,
    config: effectiveConfig,
    strict: envTruthy('SAFETY_NET_STRICT'),
    paranoidRm: envTruthy('SAFETY_NET_PARANOID') || envTruthy('SAFETY_NET_PARANOID_RM'),
    paranoidInterpreters:
      envTruthy('SAFETY_NET_PARANOID') || envTruthy('SAFETY_NET_PARANOID_INTERPRETERS'),
    worktreeMode: envTruthy('SAFETY_NET_WORKTREE'),
  };
}

export function assertBlocked(command: string, reasonContains: string, cwd?: string): void {
  const options = getOptionsFromEnv(cwd);
  const result = analyzeCommand(command, options);
  expect(result).not.toBeNull();
  expect(result?.reason).toContain(reasonContains);
}

export function assertAllowed(command: string, cwd?: string): void {
  const options = getOptionsFromEnv(cwd);
  const result = analyzeCommand(command, options);
  expect(result).toBeNull();
}

export function runGuard(command: string, cwd?: string, config?: Config): string | null {
  const options = getOptionsFromEnv(cwd, config);
  return analyzeCommand(command, options)?.reason ?? null;
}

export function writeLockedGitHubRulebookPolicy(
  cwd: string,
  content: string,
  options: { cacheAsDirectory?: boolean } = {},
): void {
  const digest = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  const cachePath = join(
    cwd,
    '.cc-safety-net',
    'cache',
    'rulebooks',
    `owner-repo-main-policy--${digest.slice(7, 19)}`,
    'rulebook.json',
  );

  mkdirSync(join(cwd, '.cc-safety-net', 'rules'), { recursive: true });
  writeFileSync(
    join(cwd, '.cc-safety-net', 'rules', 'rule.json'),
    JSON.stringify({ version: 1, rules: ['owner/repo#main/policy'], overrides: {} }),
  );
  writeFileSync(
    join(cwd, '.cc-safety-net', 'rules', 'rule.lock'),
    JSON.stringify({
      version: 1,
      rulebooks: [
        {
          spec: 'owner/repo#main/policy',
          kind: 'github',
          owner: 'owner',
          repo: 'repo',
          ref: 'main',
          commit: 'abc123',
          path: '.cc-safety-net/rules/policy/rulebook.json',
          name: 'policy',
          version: '1.0.0',
          digest,
        },
      ],
    }),
  );
  if (options.cacheAsDirectory) {
    mkdirSync(cachePath, { recursive: true });
    return;
  }
  mkdirSync(join(cachePath, '..'), { recursive: true });
  writeFileSync(cachePath, content);
}

export function readLatestAuditLogEntry(homeDir: string, sessionId: string): AuditLogEntry {
  const files = listAuditLogFiles(join(homeDir, '.cc-safety-net', 'logs'))
    .filter((file) => file.endsWith(`${sessionId}.jsonl`))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  const lines = readFileSync(files[files.length - 1] ?? '', 'utf-8')
    .trim()
    .split('\n');
  return JSON.parse(lines[lines.length - 1] ?? '{}') as AuditLogEntry;
}

export function writeJsonlFixture(
  filePath: string,
  entries: readonly Record<string, unknown>[],
): void {
  writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join('\n'));
}

export function writeNestedAuditLogFixture(
  logsDir: string,
  projectDir: string,
  entry: Record<string, unknown> & { ts: string; sessionId: string },
): void {
  const date = entry.ts.slice(0, 10);
  const monthDir = join(logsDir, projectDir, date.slice(0, 7));
  mkdirSync(monthDir, { recursive: true });
  writeJsonlFixture(join(monthDir, `${date}-${entry.sessionId}.jsonl`), [entry]);
}

export function withEnv<T>(env: Record<string, string>, fn: () => T): T {
  const effectiveEnv =
    env.HOME !== undefined && env.CC_SAFETY_NET_AUDIT_HOME === undefined
      ? { ...env, CC_SAFETY_NET_AUDIT_HOME: env.HOME }
      : env;
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(effectiveEnv)) {
    original[key] = process.env[key];
    process.env[key] = effectiveEnv[key];
  }

  const restore = () => {
    for (const key of Object.keys(effectiveEnv)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  };

  try {
    const result = fn();
    if (result instanceof Promise) return result.finally(restore) as T;
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

export async function withTempDir<T>(prefix: string, fn: (dir: string) => T | Promise<T>) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    const result = await fn(dir);
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function withSymlinkedHomeCwd<T>(prefix: string, fn: (home: string, cwd: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), prefix));
  try {
    const home = join(root, 'home');
    const cwd = join(root, 'home-link');
    mkdirSync(home);
    symlinkSync(home, cwd, 'dir');
    return fn(home, cwd);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export async function runCCSafetyNetCli(
  args: string[],
  env?: Record<string, string>,
  cwd?: string,
): Promise<{ output: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', CLI_ENTRYPOINT, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, ...(env ?? {}) },
    cwd,
  });
  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { output, stderr, exitCode };
}

export function withStdoutColor<T>(enabled: boolean, fn: () => T): T {
  const originalIsTTY = process.stdout.isTTY;
  const originalNoColor = process.env.NO_COLOR;
  // This mutates process-global stdout state; keep color assertions single-process.
  Object.defineProperty(process.stdout, 'isTTY', {
    value: enabled,
    writable: true,
    configurable: true,
  });
  if (enabled) {
    delete process.env.NO_COLOR;
  }
  try {
    return fn();
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
  }
}

export function getTraceSteps(result: Pick<ExplainResult, 'trace'>): TraceStep[] {
  return result.trace.segments.flatMap((segment) => segment.steps);
}

/**
 * Mock version fetcher for testing.
 * Returns predefined versions instantly without spawning processes.
 * @internal Exported for testing
 */
export const mockVersionFetcher: VersionFetcher = async (args: string[]) => {
  if (args[0] === 'claude' && args[1] === 'plugin') {
    return `Installed plugins:

  ❯ safety-net@cc-marketplace
    Version: 0.8.2
    Scope: user
    Status: ✔ enabled`;
  }

  if (args[0] === 'codex' && args[1] === 'plugin') {
    return 'cc-safety-net https://github.com/kenryu42/cc-safety-net.git installed, enabled';
  }

  // Handle multi-word commands like `copilot plugin list`
  if (args[0] === 'copilot' && args[1] === 'plugin') {
    return 'Installed plugins:\n  • copilot-safety-net (v1.0.0)';
  }

  if (args[0] === 'gemini' && args[1] === 'extensions') {
    return `✓ gemini-safety-net (1.0.0)
 Source: https://github.com/kenryu42/gemini-safety-net (Type: github-release)
 Enabled (User): true
 Enabled (Workspace): true`;
  }

  const cmd = args[0];
  const mockVersions: Record<string, string> = {
    claude: '1.0.0',
    agy: 'Antigravity CLI v2.0.0',
    opencode: '0.1.0',
    codex: 'codex 1.2.0',
    gemini: '0.20.0',
    kimi: 'kimi 0.3.0',
    pi: 'pi 0.4.0',
    copilot: 'Copilot binary version: 1.0.9',
    node: 'v22.0.0',
    npm: '10.0.0',
    bun: '1.0.0',
  };
  return mockVersions[cmd ?? ''] ?? null;
};

/**
 * Convert Windows backslashes to forward slashes for shell command embedding.
 * shell-quote interprets backslashes as escape characters, which corrupts
 * Windows paths like C:\Users\... into C:Users...
 */
export function toShellPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export interface LinkedWorktreeFixture {
  rootDir: string;
  mainWorktree: string;
  linkedWorktree: string;
  cleanup: () => void;
}

function runGit(args: readonly string[], cwd: string): void {
  execFileSync('git', [...args], {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'CC Safety Net Test',
      GIT_AUTHOR_EMAIL: 'safety-net@example.test',
      GIT_COMMITTER_NAME: 'CC Safety Net Test',
      GIT_COMMITTER_EMAIL: 'safety-net@example.test',
    },
  });
}

export function createLinkedWorktreeFixture(): LinkedWorktreeFixture {
  const rootDir = mkdtempSync(join(tmpdir(), 'safety-net-worktree-'));
  const mainWorktree = join(rootDir, 'main');
  const linkedWorktree = join(rootDir, 'linked');

  mkdirSync(mainWorktree);
  runGit(['init'], mainWorktree);
  runGit(['config', 'user.email', 'safety-net@example.test'], mainWorktree);
  runGit(['config', 'user.name', 'CC Safety Net Test'], mainWorktree);
  runGit(['config', 'commit.gpgsign', 'false'], mainWorktree);
  writeFileSync(join(mainWorktree, 'file.txt'), 'initial\n');
  runGit(['add', 'file.txt'], mainWorktree);
  runGit(['commit', '-m', 'initial'], mainWorktree);
  runGit(['worktree', 'add', '-b', 'feature/worktree-test', linkedWorktree], mainWorktree);

  return {
    rootDir,
    mainWorktree,
    linkedWorktree,
    cleanup: () => {
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

export async function withLinkedWorktreeFixture<T>(
  fn: (fixture: LinkedWorktreeFixture) => T | Promise<T>,
) {
  const fixture = createLinkedWorktreeFixture();
  try {
    const result = await fn(fixture);
    return result;
  } finally {
    fixture.cleanup();
  }
}

let readonlyLinkedWorktreeFixture: LinkedWorktreeFixture | undefined;

process.on('exit', () => {
  readonlyLinkedWorktreeFixture?.cleanup();
});

export async function withReadonlyLinkedWorktreeFixture<T>(
  fn: (fixture: LinkedWorktreeFixture) => T | Promise<T>,
) {
  readonlyLinkedWorktreeFixture ??= createLinkedWorktreeFixture();
  return await fn(readonlyLinkedWorktreeFixture);
}

export interface FakeGitFileFixture {
  rootDir: string;
  cwd: string;
  cleanup: () => void;
}

export function createSubmoduleLikeGitFileFixture(): FakeGitFileFixture {
  const rootDir = mkdtempSync(join(tmpdir(), 'safety-net-submodule-like-'));
  const cwd = join(rootDir, 'submodule');
  const gitDir = join(rootDir, '.git', 'modules', 'submodule');

  mkdirSync(cwd, { recursive: true });
  mkdirSync(gitDir, { recursive: true });
  writeFileSync(join(cwd, '.git'), 'gitdir: ../.git/modules/submodule\n');

  return {
    rootDir,
    cwd,
    cleanup: () => {
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}
