import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { redactSecrets } from '@/core/audit';
import { buildRuntimeBundles } from '../../scripts/build-runtime';
import { OPENCODE_HOST_SCRIPT, PI_HOST_SCRIPT } from '../../scripts/integration-host-scripts';
import { readAuditLogEntriesForSession } from '../helpers';

const adapters = [
  {
    agent: 'claude-code',
    flag: '--coding-cli',
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
    describe(`${adapter.agent === 'claude-code' ? 'Coding CLI' : adapter.agent} hook protocol`, () => {
      test('allows git status and produces no audit', async () => {
        await withWorkspace(async ({ cwd, home }) => {
          const safeSession = `${adapter.agent}-safe`;
          await expectAllowedAction(cwd, home, safeSession, (action) =>
            runGated(
              adapter,
              adapter.commandInput('git status', cwd, home, safeSession),
              cwd,
              home,
              action,
            ),
          );
        });
      });

      test.each([
        ['git reset --hard', 'git.reset-hard', 'git-reset'],
        ['rm -rf .', 'rm.recursive-force-cwd-self', 'rm-cwd'],
      ] as const)('blocks %s and preserves the target', async (command, ruleId, name) => {
        await withWorkspace(async ({ cwd, home }) => {
          const sessionId = `${adapter.agent}-${name}`;
          const sentinel = join(cwd, `${name}-sentinel`);
          writeFileSync(sentinel, 'preserve');
          const result = await runGated(
            adapter,
            adapter.commandInput(command, cwd, home, sessionId),
            cwd,
            home,
            () => rmSync(sentinel),
          );

          expect(result.allowed).toBe(false);
          expect(result.reason).toContain(ruleId);
          expect(readFileSync(sentinel, 'utf8')).toBe('preserve');
          expectSingleAudit(home, sessionId, {
            agent: adapter.agent,
            command,
            ruleId,
          });
        });
      });
    });
  }

  test.each([
    ['bash syntax', "bash -n -c '(( rm -rf / root ))'"],
    ['Node data', `node -e 'console.log("rm -rf /")'`],
    ['xargs positional input', `find src -type f | xargs sh -c 'wc -l "$1"' _`],
    ['parallel probe', 'command -v parallel'],
    ['secret metadata', 'test -f "$HOME/.ssh/id_rsa"'],
    [
      'self-explain output',
      `bun src/bin/cc-safety-net.ts explain --json --cwd /tmp/ccsn-scout 'cat /tmp/ccsn-scout/fixture/.env' | jq -c '{result}'`,
    ],
  ] as const)('Coding CLI allows log-derived %s in standard mode', async (name, command) => {
    await withWorkspace(async ({ cwd, home }) => {
      const sessionId = `log-regression-${name}-standard`;
      await expectAllowedAction(cwd, home, sessionId, (action) =>
        runCodingCliTool('Bash', { command }, cwd, home, sessionId, action, 'standard'),
      );
    });
  });

  test('Coding CLI blocks secret metadata in strict mode', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      const strictCommand = 'test -f "$HOME/.ssh/id_rsa"';
      const strictSession = 'log-regression-secret-metadata-strict';
      const strictResult = await runCodingCliTool(
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
    });
  });

  test.each([
    ['Bash execution', 'bash-executes', "bash -c 'rm -rf /'", 'rm.recursive-force-root-or-home'],
    [
      'Node execution',
      'node-executes',
      `node -e 'require("node:child_process").execSync("rm -rf /")'`,
      'interpreter.dangerous-command',
    ],
    [
      'xargs source execution',
      'xargs-source',
      `find src -type f | xargs -I{} sh -c 'echo {}; sed -n 1,20p {}'`,
      'xargs.shell-dynamic',
    ],
    ['parallel command stream', 'parallel-stream', 'parallel', 'parallel.command-stream-dynamic'],
    ['secret content', 'secret-content', 'cat "$HOME/.ssh/id_rsa"', 'secret.home.ssh'],
  ] as const)('Coding CLI blocks log-derived %s in standard mode', async (_name, slug, command, ruleId) => {
    await withWorkspace(async ({ cwd, home }) => {
      const sessionId = `log-regression-${slug}-standard`;
      const result = await runCodingCliTool(
        'Bash',
        { command },
        cwd,
        home,
        sessionId,
        () => writeFileSync(join(cwd, `${slug}-ran`), 'ran'),
        'standard',
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain(ruleId);
      expectSingleAudit(home, sessionId, { agent: 'claude-code', command, ruleId });
    });
  });

  test('Coding CLI blocks direct .env reads', async () => {
    await withSecretWorkspace(async ({ cwd, home }) => {
      const reads: string[] = [];
      const secretSession = 'claude-secret-env';
      const secretResult = await runCodingCliTool(
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
    });
  });

  test.each([
    ['.env.example', 'SECRET=example'],
    ['README.md', 'public'],
  ] as const)('Coding CLI allows harmless %s reads', async (filePath, expected) => {
    await withSecretWorkspace(async ({ cwd, home }) => {
      const reads: string[] = [];
      const sessionId = `claude-${filePath.replaceAll('.', '-')}`;
      const result = await runCodingCliTool(
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
    });
  });

  test.each([
    ['Grep content', 'Grep', { pattern: '.env', path: 'src' }],
    [
      'patch content',
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
  ] as const)('Coding CLI allows harmless %s', async (name, toolName, toolInput) => {
    await withSecretWorkspace(async ({ cwd, home }) => {
      const sessionId = `claude-${name.replaceAll(' ', '-')}`;
      await expectAllowedAction(cwd, home, sessionId, (action) =>
        runCodingCliTool(toolName, toolInput, cwd, home, sessionId, action),
      );
    });
  });

  test.each([
    ['relative path', 'relative', '../.env'],
    ['symlink', 'symlink', 'public.txt'],
  ] as const)('Coding CLI blocks .env reads through a %s', async (_name, pathKind, filePath) => {
    await withSecretWorkspace(async ({ cwd, home }) => {
      const sessionId = `claude-${pathKind}-secret`;
      const executionCwd = pathKind === 'relative' ? join(cwd, 'nested') : cwd;
      const reads: string[] = [];
      const result = await runCodingCliTool(
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
      expect(reads).toEqual([]);
    });
  });

  test.each([
    ['direct Write', 'write'],
    ['absolute shell redirect', 'redirect'],
    ['environment shell redirect', 'env'],
    ['symlink Write', 'symlink'],
  ] as const)('Coding CLI blocks policy mutation through %s', async (_name, kind) => {
    await withPolicyWorkspace(async ({ cwd, home, policyPath, originalPolicy }) => {
      const sessionId = `claude-policy-${kind}`;
      const [toolName, toolInput] = policyMutation(kind, cwd, policyPath);
      const result = await runCodingCliTool(toolName, toolInput, cwd, home, sessionId, () =>
        writeFileSync(policyPath, 'mutated'),
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Policy config is protected and you must not modify it.');
      expect(readFileSync(policyPath, 'utf8')).toBe(originalPolicy);
      expectSingleAudit(home, sessionId, { agent: 'claude-code' });
    });
  });

  test('Coding CLI allows policy reads', async () => {
    await withPolicyWorkspace(async ({ cwd, home, policyPath, originalPolicy }) => {
      const reads: string[] = [];
      const readSession = 'claude-policy-read';
      expect(
        await runCodingCliTool('Read', { file_path: policyPath }, cwd, home, readSession, () =>
          reads.push(readFileSync(policyPath, 'utf8')),
        ),
      ).toEqual({ allowed: true });
      expect(reads).toEqual([originalPolicy]);
      expect(readAuditLogEntriesForSession(home, readSession)).toEqual([]);
    });
  });

  test('Coding CLI allows policy directory inspection', async () => {
    await withPolicyWorkspace(async ({ cwd, home, safetyNetHome }) => {
      const reads: string[] = [];
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

  test('allows harmless patchText content', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      const patchSession = 'opencode-patch-content';
      await expectAllowedAction(cwd, home, patchSession, (action) =>
        runOpenCodeGated(
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
          action,
        ),
      );
    });
  });

  test('blocks policy mutation through patchText', async () => {
    await withPolicyWorkspace(async ({ cwd, home, policyPath, originalPolicy }) => {
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
      expect(readFileSync(policyPath, 'utf8')).toBe(originalPolicy);
      expectSingleAudit(home, policySession, { agent: 'opencode' });
    });
  });
});

for (const integration of [
  {
    agent: 'pi',
    title: 'built Pi extension protection contract',
    run: runPiGated,
    readTool: 'Read',
    readPathField: 'file_path',
  },
  {
    agent: 'opencode',
    title: 'built OpenCode plugin protection contract',
    run: runOpenCodeGated,
    readTool: 'read',
    readPathField: 'path',
  },
] as const) {
  describe(integration.title, () => {
    test('allows git status and produces no audit', async () => {
      await withWorkspace(async ({ cwd, home }) => {
        const sessionId = `${integration.agent}-safe`;
        await expectAllowedAction(cwd, home, sessionId, (action) =>
          integration.run('bash', { command: 'git status' }, cwd, home, sessionId, action),
        );
      });
    });

    test('blocks git reset --hard and preserves the target', async () => {
      await withWorkspace(async ({ cwd, home }) => {
        const sessionId = `${integration.agent}-reset`;
        const sentinel = join(cwd, `${integration.agent}-reset-sentinel`);
        writeFileSync(sentinel, 'preserve');
        const result = await integration.run(
          'bash',
          { command: 'git reset --hard' },
          cwd,
          home,
          sessionId,
          () => rmSync(sentinel),
        );
        expect(expectDeniedReason(result)).toContain('git.reset-hard');
        expect(readFileSync(sentinel, 'utf8')).toBe('preserve');
        expectSingleAudit(home, sessionId, {
          agent: integration.agent,
          command: 'git reset --hard',
          ruleId: 'git.reset-hard',
        });
      });
    });

    test('blocks direct .env reads', async () => {
      await withSecretWorkspace(async ({ cwd, home }) => {
        const sessionId = `${integration.agent}-secret`;
        const reads: string[] = [];
        const result = await integration.run(
          integration.readTool,
          { [integration.readPathField]: '.env' },
          cwd,
          home,
          sessionId,
          () => reads.push(readFileSync(join(cwd, '.env'), 'utf8')),
        );
        expect(expectDeniedReason(result)).toContain('secret.basename.env');
        expect(reads).toEqual([]);
        expectSingleAudit(home, sessionId, {
          agent: integration.agent,
          command: '.env',
          ruleId: 'secret.basename.env',
        });
      });
    });

    test.each([
      ['.env.example', 'SECRET=example'],
      ['README.md', 'public'],
    ] as const)('allows harmless %s reads', async (filePath, expected) => {
      await withSecretWorkspace(async ({ cwd, home }) => {
        const sessionId = `${integration.agent}-${filePath.replaceAll('.', '-')}`;
        const reads: string[] = [];
        expect(
          await integration.run(
            integration.readTool,
            { [integration.readPathField]: filePath },
            cwd,
            home,
            sessionId,
            () => reads.push(readFileSync(join(cwd, filePath), 'utf8')),
          ),
        ).toEqual({ allowed: true });
        expect(reads).toEqual([expected]);
        expect(readAuditLogEntriesForSession(home, sessionId)).toEqual([]);
      });
    });

    test('blocks policy writes', async () => {
      await withPolicyWorkspace(async ({ cwd, home, policyPath, originalPolicy }) => {
        const sessionId = `${integration.agent}-policy-write`;
        const result = await integration.run(
          'Write',
          { file_path: policyPath, content: 'mutated' },
          cwd,
          home,
          sessionId,
          () => writeFileSync(policyPath, 'mutated'),
        );
        expect(expectDeniedReason(result)).toContain('Policy config is protected');
        expect(readFileSync(policyPath, 'utf8')).toBe(originalPolicy);
        expectSingleAudit(home, sessionId, { agent: integration.agent });
      });
    });
  });
}

function withSecretWorkspace<T>(run: (context: { cwd: string; home: string }) => T | Promise<T>) {
  return withWorkspace((context) => {
    mkdirSync(join(context.cwd, 'src'));
    mkdirSync(join(context.cwd, 'nested'));
    writeFileSync(join(context.cwd, '.env'), 'SECRET=protected');
    writeFileSync(join(context.cwd, '.env.example'), 'SECRET=example');
    writeFileSync(join(context.cwd, 'README.md'), 'public');
    symlinkSync(join(context.cwd, '.env'), join(context.cwd, 'public.txt'));
    return run(context);
  });
}

function withPolicyWorkspace<T>(
  run: (context: {
    cwd: string;
    home: string;
    safetyNetHome: string;
    policyPath: string;
    originalPolicy: string;
  }) => T | Promise<T>,
) {
  return withWorkspace((context) => {
    const safetyNetHome = join(context.home, '.cc-safety-net');
    const policyPath = join(safetyNetHome, 'policy.json');
    const originalPolicy = JSON.stringify({ version: 1 });
    mkdirSync(safetyNetHome, { recursive: true });
    writeFileSync(policyPath, originalPolicy);
    symlinkSync(policyPath, join(context.cwd, 'policy-alias.json'));
    return run({ ...context, safetyNetHome, policyPath, originalPolicy });
  });
}

function policyMutation(
  kind: 'write' | 'redirect' | 'env' | 'symlink',
  cwd: string,
  policyPath: string,
) {
  if (kind === 'write') return ['Write', { file_path: policyPath, content: '{}' }] as const;
  if (kind === 'redirect') {
    return ['Bash', { command: `printf mutated > ${policyPath}` }] as const;
  }
  if (kind === 'env') {
    return ['Bash', { command: 'printf mutated > $CC_SAFETY_NET_HOME/policy.json' }] as const;
  }
  return ['Write', { file_path: join(cwd, 'policy-alias.json'), content: '{}' }] as const;
}

async function withWorkspace<T>(run: (context: { cwd: string; home: string }) => T | Promise<T>) {
  const root = mkdtempSync(join(tmpdir(), 'cc-safety-net-e2e-'));
  const cwd = join(root, 'workspace');
  const home = join(root, 'home');
  mkdirSync(cwd);
  mkdirSync(home);
  try {
    return await run({ cwd, home });
  } catch (error) {
    try {
      preserveFailureEvidence(root, home, error);
    } catch (artifactError) {
      console.error(`Failed to preserve E2E evidence: ${redactSecrets(String(artifactError))}`);
    }
    throw error;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function preserveFailureEvidence(root: string, home: string, error: unknown) {
  const artifactRoot = process.env.CC_SAFETY_NET_E2E_ARTIFACTS?.trim();
  if (!artifactRoot) return;
  const destination = join(artifactRoot, basename(root));
  mkdirSync(destination, { recursive: true });
  writeFileSync(
    join(destination, 'failure.txt'),
    redactSecrets(error instanceof Error ? (error.stack ?? error.message) : String(error)),
  );
  const auditLogs = join(home, '.cc-safety-net', 'logs');
  if (existsSync(auditLogs)) {
    cpSync(auditLogs, join(destination, 'audit-logs'), { recursive: true });
  }
}

async function expectAllowedAction(
  cwd: string,
  home: string,
  sessionId: string,
  run: (action: () => void) => Promise<{ allowed: true } | { allowed: false; reason: string }>,
) {
  const action = join(cwd, `${sessionId}-ran`);
  expect(await run(() => writeFileSync(action, 'ran'))).toEqual({ allowed: true });
  expect(readFileSync(action, 'utf8')).toBe('ran');
  expect(readAuditLogEntriesForSession(home, sessionId)).toEqual([]);
}

async function runGated(
  adapter: (typeof adapters)[number],
  input: unknown,
  cwd: string,
  home: string,
  action: () => void,
  level?: 'standard' | 'strict',
) {
  const stdout = await runBuiltHook(adapter.flag, input, cwd, home, level);
  if (!stdout) {
    action();
    return { allowed: true } as const;
  }
  return {
    allowed: false,
    reason: adapter.denyReason(parseJsonOutput('CLI hook', stdout)),
  } as const;
}

function runCodingCliTool(
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
  return (await runNode([cliPath, 'hook', flag], input, cwd, home, level)).stdout.trim();
}

type IntegrationGate = (
  toolName: string,
  input: Record<string, unknown>,
  cwd: string,
  home: string,
  sessionId: string,
  action: () => void,
) => Promise<{ allowed: true } | { allowed: false; reason: string }>;

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
  const { stdout } = await runNode(
    ['--input-type=module', '--eval', hostScript, bundlePath],
    input,
    cwd,
    home,
  );
  return parseJsonOutput('integration host', stdout);
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
  const result = { command: ['node', ...args], cwd, input, stdout, stderr, exitCode };
  if (exitCode === 0 && stderr.trim() === '') return result;
  throw new Error(
    `Node subprocess violated the E2E contract:\n${redactSecrets(JSON.stringify(result, null, 2))}`,
  );
}

function parseJsonOutput(label: string, output: string) {
  try {
    return JSON.parse(output) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${label} returned invalid JSON:\n${redactSecrets(output)}`, { cause: error });
  }
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
