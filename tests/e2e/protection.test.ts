import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRuntimeBundles } from '../../scripts/build-runtime';
import { readAuditLogEntriesForSession } from '../helpers';

const adapters = [
  {
    agent: 'claude-code',
    flag: '--claude-code',
    commandInput: (command: string, cwd: string, home: string, sessionId: string) => ({
      hook_event_name: 'PreToolUse',
      session_id: sessionId,
      transcript_path: join(home, '.claude', 'sessions', 'transcript.jsonl'),
      cwd,
      tool_name: 'Bash',
      tool_input: { command },
    }),
    denyReason: getClaudeStyleDenyReason,
  },
  {
    agent: 'gemini-cli',
    flag: '-gc',
    commandInput: (command: string, cwd: string, _home: string, sessionId: string) => ({
      hook_event_name: 'BeforeTool',
      session_id: sessionId,
      cwd,
      tool_name: 'run_shell_command',
      tool_input: { command },
    }),
    denyReason: (output: Record<string, unknown>) => {
      expect(output.decision).toBe('deny');
      return String(output.reason);
    },
  },
  {
    agent: 'kimi-code',
    flag: '-kc',
    commandInput: (command: string, cwd: string, _home: string, sessionId: string) => ({
      hook_event_name: 'PreToolUse',
      session_id: sessionId,
      cwd,
      tool_name: 'Bash',
      tool_input: { command },
      tool_call_id: `${sessionId}-tool-call`,
    }),
    denyReason: getClaudeStyleDenyReason,
  },
  {
    agent: 'copilot-cli',
    flag: '-cp',
    commandInput: (command: string, cwd: string, _home: string, sessionId: string) => ({
      sessionId,
      timestamp: Date.now(),
      cwd,
      toolName: 'bash',
      toolArgs: JSON.stringify({ command }),
    }),
    denyReason: (output: Record<string, unknown>) => {
      expect(output.permissionDecision).toBe('deny');
      return String(output.permissionDecisionReason);
    },
  },
  {
    agent: 'antigravity-cli',
    flag: '-ac',
    commandInput: (command: string, cwd: string, _home: string, sessionId: string) => ({
      toolCall: {
        name: 'run_command',
        args: { CommandLine: command, Cwd: cwd, WaitMsBeforeAsync: 1_000 },
      },
      conversationId: sessionId,
      workspacePaths: [cwd],
    }),
    denyReason: (output: Record<string, unknown>) => {
      expect(output.decision).toBe('deny');
      return String(output.reason);
    },
  },
] as const;

let buildRoot = '';
let cliPath = '';
let openCodePath = '';
let piPath = '';

beforeAll(async () => {
  const cacheRoot = join(process.cwd(), 'node_modules', '.cache');
  mkdirSync(cacheRoot, { recursive: true });
  buildRoot = mkdtempSync(join(cacheRoot, 'cc-safety-net-e2e-'));
  const result = await buildRuntimeBundles(join(buildRoot, 'dist'));
  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join('\n'));
  }
  cliPath = join(buildRoot, 'dist', 'bin', 'cc-safety-net.js');
  openCodePath = join(buildRoot, 'dist', 'index.js');
  piPath = join(buildRoot, 'dist', 'pi', 'index.js');
});

afterAll(() => {
  if (buildRoot) rmSync(buildRoot, { recursive: true, force: true });
});

describe('built CLI protection contract', () => {
  for (const adapter of adapters) {
    test(`${adapter.agent} gates destructive commands through its real hook protocol`, async () => {
      await withWorkspace(async ({ cwd, home }) => {
        const safeSession = `${adapter.agent}-safe`;
        const safeAction = join(cwd, 'safe-action-ran');
        const safeResult = await runGated(
          adapter,
          adapter.commandInput('git status', cwd, home, safeSession),
          cwd,
          home,
          () => writeFileSync(safeAction, 'ran'),
        );

        expect(safeResult).toEqual({ allowed: true });
        expect(readFileSync(safeAction, 'utf8')).toBe('ran');
        expect(readAuditLogEntriesForSession(home, safeSession)).toEqual([]);

        const gitSession = `${adapter.agent}-git-reset`;
        const gitSentinel = join(cwd, 'git-sentinel');
        writeFileSync(gitSentinel, 'preserve');
        const gitResult = await runGated(
          adapter,
          adapter.commandInput('git reset --hard', cwd, home, gitSession),
          cwd,
          home,
          () => rmSync(gitSentinel),
        );

        expect(gitResult.allowed).toBe(false);
        expect(gitResult.reason).toContain('git.reset-hard');
        expect(readFileSync(gitSentinel, 'utf8')).toBe('preserve');
        expectSingleAudit(home, gitSession, {
          agent: adapter.agent,
          command: 'git reset --hard',
          ruleId: 'git.reset-hard',
        });

        const rmSession = `${adapter.agent}-rm-cwd`;
        const rmSentinel = join(cwd, 'rm-sentinel');
        writeFileSync(rmSentinel, 'preserve');
        const rmResult = await runGated(
          adapter,
          adapter.commandInput('rm -rf .', cwd, home, rmSession),
          cwd,
          home,
          () => rmSync(rmSentinel),
        );

        expect(rmResult.allowed).toBe(false);
        expect(rmResult.reason).toContain('rm.recursive-force-cwd-self');
        expect(readFileSync(rmSentinel, 'utf8')).toBe('preserve');
        expectSingleAudit(home, rmSession, {
          agent: adapter.agent,
          command: 'rm -rf .',
          ruleId: 'rm.recursive-force-cwd-self',
        });
      });
    });
  }

  test('Claude Code preserves log-derived false-positive and strict-mode boundaries', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      const standardAllows = [
        ['bash-syntax', "bash -n -c '(( rm -rf / root ))'"],
        ['node-data', `node -e 'console.log("rm -rf /")'`],
        ['xargs-positional', `find src -type f | xargs sh -c 'wc -l "$1"' _`],
        ['parallel-probe', 'command -v parallel'],
        ['secret-metadata', 'test -f "$HOME/.ssh/id_rsa"'],
        [
          'self-explain',
          `bun src/bin/cc-safety-net.ts explain --json --cwd /tmp/ccsn-scout 'cat /tmp/ccsn-scout/fixture/.env' | jq -c '{result}'`,
        ],
      ] as const;

      for (const [name, command] of standardAllows) {
        const sessionId = `log-regression-${name}-standard`;
        const action = join(cwd, `${name}-allowed`);
        expect(
          await runClaudeTool(
            'Bash',
            { command },
            cwd,
            home,
            sessionId,
            () => writeFileSync(action, 'ran'),
            'standard',
          ),
        ).toEqual({ allowed: true });
        expect(readFileSync(action, 'utf8')).toBe('ran');
        expect(readAuditLogEntriesForSession(home, sessionId)).toEqual([]);
      }

      const strictCommand = 'test -f "$HOME/.ssh/id_rsa"';
      const strictSession = 'log-regression-secret-metadata-strict';
      const strictResult = await runClaudeTool(
        'Bash',
        { command: strictCommand },
        cwd,
        home,
        strictSession,
        () => writeFileSync(join(cwd, 'strict-secret-metadata-ran'), 'ran'),
        'strict',
      );
      expect(strictResult.allowed).toBe(false);
      expect(strictResult.reason).toContain('secret.home.ssh');
      expectSingleAudit(home, strictSession, {
        agent: 'claude-code',
        command: strictCommand,
        ruleId: 'secret.home.ssh',
      });

      const standardDenies = [
        ['bash-executes', "bash -c 'rm -rf /'", 'rm.recursive-force-root-or-home'],
        [
          'node-executes',
          `node -e 'require("node:child_process").execSync("rm -rf /")'`,
          'interpreter.dangerous-command',
        ],
        [
          'xargs-source',
          `find src -type f | xargs -I{} sh -c 'echo {}; sed -n 1,20p {}'`,
          'xargs.shell-dynamic',
        ],
        ['parallel-stream', 'parallel', 'parallel.command-stream-dynamic'],
        ['secret-content', 'cat "$HOME/.ssh/id_rsa"', 'secret.home.ssh'],
      ] as const;

      for (const [name, command, ruleId] of standardDenies) {
        const sessionId = `log-regression-${name}-standard`;
        const result = await runClaudeTool(
          'Bash',
          { command },
          cwd,
          home,
          sessionId,
          () => writeFileSync(join(cwd, `${name}-ran`), 'ran'),
          'standard',
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain(ruleId);
        expectSingleAudit(home, sessionId, { agent: 'claude-code', command, ruleId });
      }
    });
  });

  test('Claude Code blocks secret paths while allowing nearby harmless inputs', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      mkdirSync(join(cwd, 'src'));
      mkdirSync(join(cwd, 'nested'));
      writeFileSync(join(cwd, '.env'), 'SECRET=protected');
      writeFileSync(join(cwd, '.env.example'), 'SECRET=example');
      writeFileSync(join(cwd, 'README.md'), 'public');
      symlinkSync(join(cwd, '.env'), join(cwd, 'public.txt'));
      const reads: string[] = [];

      const secretSession = 'claude-secret-env';
      const secretResult = await runClaudeTool(
        'Read',
        { file_path: '.env' },
        cwd,
        home,
        secretSession,
        () => reads.push(readFileSync(join(cwd, '.env'), 'utf8')),
      );
      expect(secretResult.allowed).toBe(false);
      expect(secretResult.reason).toContain('secret.basename.env');
      expect(reads).toEqual([]);
      expectSingleAudit(home, secretSession, {
        agent: 'claude-code',
        command: '.env',
        ruleId: 'secret.basename.env',
      });

      for (const [sessionId, filePath, expected] of [
        ['claude-env-example', '.env.example', 'SECRET=example'],
        ['claude-readme', 'README.md', 'public'],
      ] as const) {
        const result = await runClaudeTool(
          'Read',
          { file_path: filePath },
          cwd,
          home,
          sessionId,
          () => reads.push(readFileSync(join(cwd, filePath), 'utf8')),
        );
        expect(result).toEqual({ allowed: true });
        expect(reads.at(-1)).toBe(expected);
        expect(readAuditLogEntriesForSession(home, sessionId)).toEqual([]);
      }

      for (const [sessionId, toolName, toolInput] of [
        ['claude-grep-content', 'Grep', { pattern: '.env', path: 'src' }],
        [
          'claude-patch-content',
          'apply_patch',
          {
            command: [
              '*** Begin Patch',
              '*** Update File: tests/example.test.ts',
              '@@',
              ' rm -rf ~',
              '*** End Patch',
            ].join('\n'),
          },
        ],
      ] as const) {
        const action = join(cwd, `${sessionId}-ran`);
        expect(
          await runClaudeTool(toolName, toolInput, cwd, home, sessionId, () =>
            writeFileSync(action, 'ran'),
          ),
        ).toEqual({ allowed: true });
        expect(readFileSync(action, 'utf8')).toBe('ran');
        expect(readAuditLogEntriesForSession(home, sessionId)).toEqual([]);
      }

      for (const [sessionId, executionCwd, filePath] of [
        ['claude-relative-secret', join(cwd, 'nested'), '../.env'],
        ['claude-symlink-secret', cwd, 'public.txt'],
      ] as const) {
        const result = await runClaudeTool(
          'Read',
          { file_path: filePath },
          executionCwd,
          home,
          sessionId,
          () => reads.push(readFileSync(join(executionCwd, filePath), 'utf8')),
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('secret.basename.env');
        expectSingleAudit(home, sessionId, {
          agent: 'claude-code',
          command: filePath,
          ruleId: 'secret.basename.env',
        });
      }
      expect(reads).toEqual(['SECRET=example', 'public']);
    });
  });

  test('Claude Code protects only policy mutations across direct and aliased paths', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      const safetyNetHome = join(home, '.cc-safety-net');
      const policyPath = join(safetyNetHome, 'policy.json');
      const originalPolicy = JSON.stringify({ version: 1 });
      mkdirSync(safetyNetHome, { recursive: true });
      writeFileSync(policyPath, originalPolicy);
      symlinkSync(policyPath, join(cwd, 'policy-alias.json'));

      for (const [sessionId, toolName, toolInput] of [
        ['claude-policy-write', 'Write', { file_path: policyPath, content: '{}' }],
        ['claude-policy-redirect', 'Bash', { command: `printf mutated > ${policyPath}` }],
        [
          'claude-policy-env',
          'Bash',
          { command: 'printf mutated > $CC_SAFETY_NET_HOME/policy.json' },
        ],
        [
          'claude-policy-symlink',
          'Write',
          { file_path: join(cwd, 'policy-alias.json'), content: '{}' },
        ],
      ] as const) {
        const result = await runClaudeTool(toolName, toolInput, cwd, home, sessionId, () =>
          writeFileSync(policyPath, 'mutated'),
        );
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Policy config is protected and you must not modify it.');
        expect(readFileSync(policyPath, 'utf8')).toBe(originalPolicy);
        expectSingleAudit(home, sessionId, { agent: 'claude-code' });
      }

      const reads: string[] = [];
      const readSession = 'claude-policy-read';
      expect(
        await runClaudeTool('Read', { file_path: policyPath }, cwd, home, readSession, () =>
          reads.push(readFileSync(policyPath, 'utf8')),
        ),
      ).toEqual({ allowed: true });
      expect(reads).toEqual([originalPolicy]);
      expect(readAuditLogEntriesForSession(home, readSession)).toEqual([]);

      const inspectSession = 'claude-policy-inspect';
      expect(
        await runGated(
          adapters[0],
          adapters[0].commandInput(`ls -la ${safetyNetHome}`, cwd, home, inspectSession),
          cwd,
          home,
          () => reads.push(readdirSync(safetyNetHome).join(',')),
        ),
      ).toEqual({ allowed: true });
      expect(reads.at(-1)).toContain('policy.json');
      expect(readAuditLogEntriesForSession(home, inspectSession)).toEqual([]);
    });
  });
});

describe('built Pi extension protection contract', () => {
  test('loads through the Pi extension host and registers its public contracts', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      const result = await runBuiltHost(
        piPath,
        PI_HOST_SCRIPT,
        {
          kind: 'registration',
          commandArgs: 'block git reset',
          idle: false,
        },
        cwd,
        home,
      );

      expect(result).toMatchObject({
        eventNames: ['tool_call'],
        commandNames: ['cc-safety-net'],
        commandDescription: 'Manage CC Safety Net rulebooks',
        sentMessages: [
          {
            content: expect.stringContaining('## User request\n\nblock git reset'),
            options: { deliverAs: 'followUp' },
          },
        ],
      });
    });
  });

  test('gates destructive, secret, and policy actions without blocking nearby safe inputs', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      await expectIntegrationProtection({
        agent: 'pi',
        cwd,
        home,
        run: runPiGated,
        readTool: 'Read',
        readPathField: 'file_path',
      });
    });
  });
});

describe('built OpenCode plugin protection contract', () => {
  test('loads every legacy export like OpenCode and augments its config', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      const result = await runBuiltHost(
        openCodePath,
        OPENCODE_HOST_SCRIPT,
        {
          kind: 'config',
          config: {
            shell: '/bin/bash',
            command: { existing: { description: 'Existing command', template: 'keep' } },
          },
        },
        cwd,
        home,
      );

      expect(result).toMatchObject({
        exportNames: ['CCSafetyNetPlugin'],
        pluginCount: 1,
        commandNames: expect.arrayContaining(['cc-safety-net', 'existing']),
        existingCommand: { description: 'Existing command', template: 'keep' },
      });
    });
  });

  test('gates destructive, secret, policy, and patchText actions without false positives', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      const policyPath = await expectIntegrationProtection({
        agent: 'opencode',
        cwd,
        home,
        run: runOpenCodeGated,
        readTool: 'read',
        readPathField: 'path',
      });

      const patchSession = 'opencode-patch-content';
      const patchAction = join(cwd, 'opencode-patch-ran');
      expect(
        await runOpenCodeGated(
          'apply_patch',
          {
            patchText: [
              '*** Begin Patch',
              '*** Update File: README.md',
              '@@',
              '+rm -rf .',
              '+.env',
              '*** End Patch',
            ].join('\n'),
          },
          cwd,
          home,
          patchSession,
          () => writeFileSync(patchAction, 'ran'),
        ),
      ).toEqual({ allowed: true });
      expect(readFileSync(patchAction, 'utf8')).toBe('ran');
      expect(readAuditLogEntriesForSession(home, patchSession)).toEqual([]);

      const policySession = 'opencode-policy-patch';
      const policyResult = await runOpenCodeGated(
        'apply_patch',
        {
          patchText: [
            '*** Begin Patch',
            `*** Update File: ${policyPath}`,
            '@@',
            '-{"version":1}',
            '+{}',
            '*** End Patch',
          ].join('\n'),
        },
        cwd,
        home,
        policySession,
        () => writeFileSync(policyPath, 'mutated'),
      );
      expect(policyResult.allowed).toBe(false);
      expect(policyResult.reason).toContain('Policy config is protected');
      expect(readFileSync(policyPath, 'utf8')).toBe('{"version":1}');
      expectSingleAudit(home, policySession, { agent: 'opencode' });
    });
  });
});

async function withWorkspace<T>(run: (context: { cwd: string; home: string }) => T | Promise<T>) {
  const root = mkdtempSync(join(tmpdir(), 'cc-safety-net-e2e-'));
  const cwd = join(root, 'workspace');
  const home = join(root, 'home');
  mkdirSync(cwd);
  mkdirSync(home);
  try {
    return await run({ cwd, home });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function runGated(
  adapter: (typeof adapters)[number],
  input: unknown,
  cwd: string,
  home: string,
  action: () => void,
  level?: 'standard' | 'strict',
) {
  const result = await runBuiltHook(adapter.flag, input, cwd, home, level);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe('');
  if (!result.stdout) {
    action();
    return { allowed: true } as const;
  }
  return {
    allowed: false,
    reason: adapter.denyReason(JSON.parse(result.stdout) as Record<string, unknown>),
  } as const;
}

function runClaudeTool(
  toolName: string,
  toolInput: unknown,
  cwd: string,
  home: string,
  sessionId: string,
  action: () => void,
  level?: 'standard' | 'strict',
) {
  return runGated(
    adapters[0],
    {
      hook_event_name: 'PreToolUse',
      session_id: sessionId,
      transcript_path: join(home, '.claude', 'sessions', 'transcript.jsonl'),
      cwd,
      tool_name: toolName,
      tool_input: toolInput,
    },
    cwd,
    home,
    action,
    level,
  );
}

async function runBuiltHook(
  flag: string,
  input: unknown,
  cwd: string,
  home: string,
  level?: 'standard' | 'strict',
) {
  const { stdout, stderr, exitCode } = await runNode(
    [cliPath, 'hook', flag],
    input,
    cwd,
    home,
    level,
  );
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

type IntegrationGate = (
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
  home: string,
  sessionId: string,
  action: () => void,
) => Promise<{ allowed: true } | { allowed: false; reason: string }>;

async function expectIntegrationProtection(options: {
  agent: 'opencode' | 'pi';
  cwd: string;
  home: string;
  run: IntegrationGate;
  readTool: string;
  readPathField: 'file_path' | 'path';
}) {
  writeFileSync(join(options.cwd, '.env'), 'SECRET=protected');
  writeFileSync(join(options.cwd, '.env.example'), 'SECRET=example');
  writeFileSync(join(options.cwd, 'README.md'), 'public');

  const safeSession = `${options.agent}-safe`;
  const safeAction = join(options.cwd, `${options.agent}-safe-ran`);
  expect(
    await options.run(
      'bash',
      { command: 'git status' },
      options.cwd,
      options.home,
      safeSession,
      () => writeFileSync(safeAction, 'ran'),
    ),
  ).toEqual({ allowed: true });
  expect(readFileSync(safeAction, 'utf8')).toBe('ran');
  expect(readAuditLogEntriesForSession(options.home, safeSession)).toEqual([]);

  const resetSession = `${options.agent}-reset`;
  const resetSentinel = join(options.cwd, `${options.agent}-reset-sentinel`);
  writeFileSync(resetSentinel, 'preserve');
  const resetResult = await options.run(
    'bash',
    { command: 'git reset --hard' },
    options.cwd,
    options.home,
    resetSession,
    () => rmSync(resetSentinel),
  );
  expect(expectDeniedReason(resetResult)).toContain('git.reset-hard');
  expect(readFileSync(resetSentinel, 'utf8')).toBe('preserve');
  expectSingleAudit(options.home, resetSession, {
    agent: options.agent,
    command: 'git reset --hard',
    ruleId: 'git.reset-hard',
  });

  const secretSession = `${options.agent}-secret`;
  const secretReads: string[] = [];
  const secretResult = await options.run(
    options.readTool,
    { [options.readPathField]: '.env' },
    options.cwd,
    options.home,
    secretSession,
    () => secretReads.push(readFileSync(join(options.cwd, '.env'), 'utf8')),
  );
  expect(expectDeniedReason(secretResult)).toContain('secret.basename.env');
  expect(secretReads).toEqual([]);
  expectSingleAudit(options.home, secretSession, {
    agent: options.agent,
    command: '.env',
    ruleId: 'secret.basename.env',
  });

  for (const filePath of ['.env.example', 'README.md']) {
    const sessionId = `${options.agent}-${filePath.replaceAll('.', '-')}`;
    expect(
      await options.run(
        options.readTool,
        { [options.readPathField]: filePath },
        options.cwd,
        options.home,
        sessionId,
        () => secretReads.push(readFileSync(join(options.cwd, filePath), 'utf8')),
      ),
    ).toEqual({ allowed: true });
    expect(readAuditLogEntriesForSession(options.home, sessionId)).toEqual([]);
  }
  expect(secretReads).toEqual(['SECRET=example', 'public']);

  const policyPath = join(options.home, '.cc-safety-net', 'policy.json');
  mkdirSync(join(options.home, '.cc-safety-net'), { recursive: true });
  writeFileSync(policyPath, '{"version":1}');
  const policySession = `${options.agent}-policy-write`;
  const policyResult = await options.run(
    'Write',
    { file_path: policyPath, content: 'mutated' },
    options.cwd,
    options.home,
    policySession,
    () => writeFileSync(policyPath, 'mutated'),
  );
  expect(expectDeniedReason(policyResult)).toContain('Policy config is protected');
  expect(readFileSync(policyPath, 'utf8')).toBe('{"version":1}');
  expectSingleAudit(options.home, policySession, { agent: options.agent });
  return policyPath;
}

function expectDeniedReason(result: Awaited<ReturnType<IntegrationGate>>) {
  expect(result.allowed).toBe(false);
  if (result.allowed) throw new Error('Expected the integration host to block the action');
  return result.reason;
}

async function runPiGated(
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
  home: string,
  sessionId: string,
  action: () => void,
) {
  const output = await runBuiltHost(
    piPath,
    PI_HOST_SCRIPT,
    {
      kind: 'tool_call',
      event: { type: 'tool_call', toolCallId: `${sessionId}-call`, toolName, input },
      sessionId,
    },
    cwd,
    home,
  );
  const result = output.result as { block: true; reason: string } | null;
  if (result?.block) return { allowed: false, reason: result.reason } as const;
  action();
  return { allowed: true } as const;
}

async function runOpenCodeGated(
  tool: string,
  args: Record<string, unknown>,
  cwd: string,
  home: string,
  sessionId: string,
  action: () => void,
) {
  const output = await runBuiltHost(
    openCodePath,
    OPENCODE_HOST_SCRIPT,
    { kind: 'tool', tool, args, sessionId },
    cwd,
    home,
  );
  if (!output.allowed) return { allowed: false, reason: String(output.reason) } as const;
  action();
  return { allowed: true } as const;
}

async function runBuiltHost(
  bundlePath: string,
  hostScript: string,
  input: unknown,
  cwd: string,
  home: string,
) {
  const { stdout, stderr, exitCode } = await runNode(
    ['--input-type=module', '--eval', hostScript, bundlePath],
    input,
    cwd,
    home,
  );
  expect(exitCode).toBe(0);
  expect(stderr.trim()).toBe('');
  return JSON.parse(stdout) as Record<string, unknown>;
}

async function runNode(
  args: string[],
  input: unknown,
  cwd: string,
  home: string,
  level?: 'standard' | 'strict',
) {
  const proc = Bun.spawn(['node', ...args], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    cwd,
    env: isolatedEnv(home, level),
  });
  proc.stdin.write(JSON.stringify(input));
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

function isolatedEnv(home: string, level?: 'standard' | 'strict') {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    HOME: home,
    USERPROFILE: home,
    CC_SAFETY_NET_HOME: join(home, '.cc-safety-net'),
    CC_SAFETY_NET_AUDIT_HOME: home,
    CC_SAFETY_NET_LEVEL: level ?? '',
    CC_SAFETY_NET_STRICT: '',
    CC_SAFETY_NET_PARANOID: '',
    CC_SAFETY_NET_PARANOID_RM: '',
    CC_SAFETY_NET_PARANOID_INTERPRETERS: '',
    CC_SAFETY_NET_WORKTREE: '',
  };
}

function expectSingleAudit(
  home: string,
  sessionId: string,
  expected: { agent: string; command?: string; ruleId?: string },
) {
  const entries = readAuditLogEntriesForSession(home, sessionId);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    sessionId,
    decision: 'deny',
    ...expected,
  });
}

function getClaudeStyleDenyReason(output: Record<string, unknown>) {
  const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
  expect(hookOutput.hookEventName).toBe('PreToolUse');
  expect(hookOutput.permissionDecision).toBe('deny');
  return String(hookOutput.permissionDecisionReason);
}

const PI_HOST_SCRIPT = `
import { pathToFileURL } from 'node:url';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const events = new Map();
const commands = new Map();
const sentMessages = [];
const pi = {
  on(name, handler) {
    events.set(name, handler);
  },
  registerCommand(name, command) {
    commands.set(name, command);
  },
  sendUserMessage(content, options) {
    sentMessages.push({ content, options });
  },
};
const extension = (await import(pathToFileURL(process.argv[1]).href)).default;
await extension(pi);

if (request.kind === 'registration') {
  await commands.get('cc-safety-net').handler(request.commandArgs, {
    isIdle: () => request.idle,
  });
  process.stdout.write(JSON.stringify({
    eventNames: [...events.keys()],
    commandNames: [...commands.keys()],
    commandDescription: commands.get('cc-safety-net').description,
    sentMessages,
  }));
} else {
  const result = await events.get('tool_call')(request.event, {
    cwd: process.cwd(),
    sessionManager: { getSessionId: () => request.sessionId },
  });
  process.stdout.write(JSON.stringify({ result: result ?? null }));
}
`;

const OPENCODE_HOST_SCRIPT = `
import { pathToFileURL } from 'node:url';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const pluginModule = await import(pathToFileURL(process.argv[1]).href);
const factories = Object.values(pluginModule).filter((value) => typeof value === 'function');
const pluginInput = {
  client: {},
  project: {},
  directory: process.cwd(),
  worktree: process.cwd(),
  experimental_workspace: { register() {} },
  serverUrl: new URL('http://127.0.0.1:4096'),
  $: () => {},
};
const hooks = await Promise.all(factories.map((factory) => factory(pluginInput)));

if (request.kind === 'config') {
  for (const hook of hooks) await hook.config?.(request.config);
  process.stdout.write(JSON.stringify({
    exportNames: Object.keys(pluginModule),
    pluginCount: hooks.length,
    commandNames: Object.keys(request.config.command ?? {}),
    existingCommand: request.config.command?.existing,
  }));
} else {
  try {
    for (const hook of hooks) {
      await hook['tool.execute.before']?.(
        { tool: request.tool, sessionID: request.sessionId, callID: request.sessionId + '-call' },
        { args: request.args },
      );
    }
    process.stdout.write(JSON.stringify({ allowed: true }));
  } catch (error) {
    process.stdout.write(JSON.stringify({
      allowed: false,
      reason: error instanceof Error ? error.message : String(error),
    }));
  }
}
`;
