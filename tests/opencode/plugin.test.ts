import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getUserPolicyPath } from '@/core/policy';
import { CCSafetyNetPlugin } from '@/index';
import {
  gitCommitRule,
  syncInitialGitRulebook,
  syncTransparentGitCommitRulebook,
  updatedGitRule,
  writeUpdatedGitRulebook,
} from '../helpers/rulebook';

type ToolPlugin = {
  'tool.execute.before': (
    input: { tool: string; sessionID?: string },
    output: { args: Record<string, unknown> },
  ) => Promise<void>;
};

describe('OpenCode plugin', () => {
  test('reads current environment mode names', async () => {
    const original = process.env.CC_SAFETY_NET_PARANOID_INTERPRETERS;
    process.env.CC_SAFETY_NET_PARANOID_INTERPRETERS = '1';
    try {
      const plugin = await loadToolPlugin(process.cwd());

      await expect(
        plugin['tool.execute.before'](
          { tool: 'bash' },
          { args: { command: 'node -e "console.log(1)"' } },
        ),
      ).rejects.toThrow('paranoid');
    } finally {
      if (original === undefined) {
        delete process.env.CC_SAFETY_NET_PARANOID_INTERPRETERS;
      } else {
        process.env.CC_SAFETY_NET_PARANOID_INTERPRETERS = original;
      }
    }
  });

  test('registers built-in commands without removing existing commands', async () => {
    const plugin = (await CCSafetyNetPlugin({
      directory: process.cwd(),
    } as Parameters<typeof CCSafetyNetPlugin>[0])) as unknown as {
      config: (opencodeConfig: Record<string, unknown>) => Promise<void>;
    };
    const opencodeConfig = {
      command: {
        existing: { description: 'Existing command', template: 'keep' },
      },
    };

    await plugin.config(opencodeConfig);

    expect(Object.keys(opencodeConfig.command)).toContain('cc-safety-net');
    expect(opencodeConfig.command.existing).toEqual({
      description: 'Existing command',
      template: 'keep',
    });
  });

  test('fails closed when OpenCode passes malformed bash output', async () => {
    const plugin = await loadToolPlugin(process.cwd());

    await expect(plugin['tool.execute.before']({ tool: 'bash' }, { args: {} })).rejects.toThrow(
      'CC Safety Net failed closed',
    );
  });

  test('blocks sensitive non-bash tool path inputs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-opencode-secret-'));
    try {
      const plugin = await loadToolPlugin(dir);

      await expect(
        plugin['tool.execute.before']({ tool: 'read' }, { args: { path: '.env' } }),
      ).rejects.toThrow('Access to a sensitive path is not allowed.');
      await expect(
        plugin['tool.execute.before']({ tool: 'Read' }, { args: { file_path: '.env.local' } }),
      ).rejects.toThrow('Command: .env.local');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('allows non-sensitive non-bash tool path inputs', async () => {
    const plugin = await loadToolPlugin(process.cwd());

    await expect(
      plugin['tool.execute.before']({ tool: 'read' }, { args: { path: 'README.md' } }),
    ).resolves.toBeUndefined();
  });

  test('blocks policy config mutations before loading config', async () => {
    await withSafetyNetHomeDir('safety-net-opencode-policy-protection-', async (dir) => {
      const plugin = await loadToolPlugin(dir);
      const policyPath = getUserPolicyPath();

      await expect(
        plugin['tool.execute.before'](
          { tool: 'Write' },
          { args: { file_path: policyPath, content: '{}' } },
        ),
      ).rejects.toThrow('Policy config is protected and you must not modify it.');
      await expect(
        plugin['tool.execute.before'](
          { tool: 'bash' },
          { args: { command: `cat package.json > ${policyPath}` } },
        ),
      ).rejects.toThrow(`Segment: ${policyPath}`);
    });
  });

  test('allows read-only access to policy config', async () => {
    await withSafetyNetHomeDir('safety-net-opencode-policy-read-', async (dir) => {
      const plugin = await loadToolPlugin(dir);
      const policyPath = getUserPolicyPath();

      await expect(
        plugin['tool.execute.before']({ tool: 'Read' }, { args: { file_path: policyPath } }),
      ).resolves.toBeUndefined();
      await expect(
        plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: `cat ${policyPath}` } }),
      ).resolves.toBeUndefined();
    });
  });

  test('honors user secret protection policy without weakening destructive blocking', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-opencode-secret-policy-'));
    const safetyNetHome = join(dir, 'home', '.cc-safety-net');
    try {
      writeUserPolicy(safetyNetHome, {
        version: 1,
        secret_protection: { enabled: false },
      });
      await withSafetyNetHome(safetyNetHome, async () => {
        const plugin = await loadToolPlugin(dir);

        await expect(
          plugin['tool.execute.before']({ tool: 'read' }, { args: { path: '.env' } }),
        ).resolves.toBeUndefined();
        await expect(
          plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'rm -rf /' } }),
        ).rejects.toThrow('root or home directory');
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('honors user secret protection overrides and deny paths', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-opencode-secret-rules-'));
    const safetyNetHome = join(dir, 'home', '.cc-safety-net');
    try {
      writeUserPolicy(safetyNetHome, {
        version: 1,
        secret_protection: {
          overrides: { 'secret.ext.pem': 'off' },
          deny_paths: ['private-note.txt'],
        },
      });
      await withSafetyNetHome(safetyNetHome, async () => {
        const plugin = await loadToolPlugin(dir);

        await expect(
          plugin['tool.execute.before']({ tool: 'read' }, { args: { path: 'server.pem' } }),
        ).resolves.toBeUndefined();
        await expect(
          plugin['tool.execute.before']({ tool: 'read' }, { args: { path: 'id_rsa.pem' } }),
        ).rejects.toThrow('Access to a sensitive path is not allowed.');
        await expect(
          plugin['tool.execute.before']({ tool: 'read' }, { args: { path: 'private-note.txt' } }),
        ).rejects.toThrow('Access to a sensitive path is not allowed.');
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('fails closed for non-bash tools when policy config is invalid', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-opencode-invalid-policy-'));
    const safetyNetHome = join(dir, 'home', '.cc-safety-net');
    try {
      writeUserPolicy(safetyNetHome, {
        version: 1,
        secret_protection: { enabled: 'yes' },
      });
      await withSafetyNetHome(safetyNetHome, async () => {
        const plugin = await loadToolPlugin(dir);

        await expect(
          plugin['tool.execute.before']({ tool: 'read' }, { args: { path: 'README.md' } }),
        ).rejects.toThrow('invalid policy config');
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('writes audit log for blocked commands with session id', async () => {
    await withAuditDirs(
      'safety-net-opencode-home-',
      'safety-net-opencode-project-',
      async (homeDir, projectDir) => {
        const plugin = await loadToolPlugin(projectDir, homeDir);

        await expect(
          plugin['tool.execute.before'](
            { tool: 'bash', sessionID: 'opencode-test-session' },
            { args: { command: 'git reset --hard' } },
          ),
        ).rejects.toThrow('git reset --hard');

        const logFile = join(homeDir, '.cc-safety-net', 'logs', 'opencode-test-session.jsonl');
        expect(existsSync(logFile)).toBe(true);
        const entry = JSON.parse(readFileSync(logFile, 'utf-8').trim());
        expect(entry.decision).toBe('deny');
        expect(entry.command).toBe('git reset --hard');
        expect(entry.segment).toBe('git reset --hard');
        expect(entry.reason).toContain('git reset --hard');
        expect(entry.cwd).toBe(projectDir);
      },
    );
  });

  test('writes audit log for secret protection blocks with session id', async () => {
    await withAuditDirs(
      'safety-net-opencode-secret-home-',
      'safety-net-opencode-secret-project-',
      async (homeDir, projectDir) => {
        const plugin = await loadToolPlugin(projectDir, homeDir);

        await expect(
          plugin['tool.execute.before'](
            { tool: 'read', sessionID: 'opencode-secret-session' },
            { args: { path: '.env' } },
          ),
        ).rejects.toThrow('Access to a sensitive path is not allowed.');

        const logFile = join(homeDir, '.cc-safety-net', 'logs', 'opencode-secret-session.jsonl');
        expect(existsSync(logFile)).toBe(true);
        const entry = JSON.parse(readFileSync(logFile, 'utf-8').trim());
        expect(entry.decision).toBe('deny');
        expect(entry.command).toBe('.env');
        expect(entry.segment).toBe('.env');
        expect(entry.reason).toBe('Access to a sensitive path is not allowed.');
        expect(entry.cwd).toBe(projectDir);
      },
    );
  });

  test('reloads and repairs local rules before each tool execution', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-opencode-plugin-'));
    try {
      await syncInitialGitRulebook(dir);
      const plugin = await loadToolPlugin(dir);

      writeUpdatedGitRulebook(dir);

      await expect(
        plugin['tool.execute.before']({ tool: 'bash' }, { args: { command: 'git status' } }),
      ).rejects.toThrow(updatedGitRule.reason);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('blocks configured transparent wrapper child command', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'safety-net-opencode-plugin-'));
    try {
      await syncTransparentGitCommitRulebook(dir);
      const plugin = await loadToolPlugin(dir);

      await expect(
        plugin['tool.execute.before'](
          { tool: 'bash' },
          { args: { command: 'rtk git commit -m msg' } },
        ),
      ).rejects.toThrow(gitCommitRule.reason);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

async function loadToolPlugin(directory: string, homeDir?: string): Promise<ToolPlugin> {
  return (await CCSafetyNetPlugin({
    directory,
    homeDir,
  } as Parameters<typeof CCSafetyNetPlugin>[0])) as unknown as ToolPlugin;
}

function writeUserPolicy(safetyNetHome: string, policy: unknown): void {
  mkdirSync(safetyNetHome, { recursive: true });
  writeFileSync(join(safetyNetHome, 'policy.json'), JSON.stringify(policy), 'utf-8');
}

async function withSafetyNetHome<T>(safetyNetHome: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env.CC_SAFETY_NET_HOME;
  process.env.CC_SAFETY_NET_HOME = safetyNetHome;
  try {
    return await fn();
  } finally {
    if (original === undefined) {
      delete process.env.CC_SAFETY_NET_HOME;
    } else {
      process.env.CC_SAFETY_NET_HOME = original;
    }
  }
}

async function withSafetyNetHomeDir<T>(
  prefix: string,
  fn: (dir: string, safetyNetHome: string) => Promise<T>,
): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const safetyNetHome = join(dir, 'home', '.cc-safety-net');
  try {
    return await withSafetyNetHome(safetyNetHome, () => fn(dir, safetyNetHome));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withAuditDirs<T>(
  homePrefix: string,
  projectPrefix: string,
  fn: (homeDir: string, projectDir: string) => Promise<T>,
): Promise<T> {
  const homeDir = mkdtempSync(join(tmpdir(), homePrefix));
  const projectDir = mkdtempSync(join(tmpdir(), projectPrefix));
  try {
    return await fn(homeDir, projectDir);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  }
}
