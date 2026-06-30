import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUILTIN_RULE_IDS } from '@/core/builtin-rules';
import {
  BUILTIN_RULE_METADATA,
  DEFAULT_GUI_POLICY,
  readUserPolicyForGui,
  writeUserPolicyFromGui,
} from '@/core/policy';

describe('policy GUI helpers', () => {
  let tempDir: string;
  let safetyNetHome: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safety-net-policy-gui-'));
    safetyNetHome = join(tempDir, '.cc-safety-net');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('missing user policy returns defaults without creating a file', () => {
    const result = readUserPolicyForGui({ userConfigDir: join(safetyNetHome, 'rules') });

    expect(result.exists).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.policy).toEqual(DEFAULT_GUI_POLICY);
    expect(existsSync(join(safetyNetHome, 'policy.json'))).toBe(false);
  });

  test('valid user policy reads and rewrites as canonical JSON', () => {
    mkdirSync(safetyNetHome, { recursive: true });
    writeFileSync(
      join(safetyNetHome, 'policy.json'),
      JSON.stringify({
        version: 1,
        modes: { paranoid_rm: true },
        builtins: { overrides: { 'git.reset-hard': 'off' } },
        secret_protection: { enabled: true, allow_paths: ['.env.local'] },
      }),
      'utf-8',
    );

    const readResult = readUserPolicyForGui({ userConfigDir: join(safetyNetHome, 'rules') });
    expect(readResult.errors).toEqual([]);
    expect(readResult.policy.modes.paranoid_rm).toBe(true);
    expect(readResult.policy.builtins.overrides).toEqual({ 'git.reset-hard': 'off' });

    const writeResult = writeUserPolicyFromGui(readResult.policy, {
      userConfigDir: join(safetyNetHome, 'rules'),
    });

    expect(writeResult.errors).toEqual([]);
    expect(readFileSync(join(safetyNetHome, 'policy.json'), 'utf-8')).toBe(
      `${JSON.stringify(readResult.policy, null, 2)}\n`,
    );
  });

  test('invalid user policy can be read with errors and rejected on save', () => {
    mkdirSync(safetyNetHome, { recursive: true });
    writeFileSync(join(safetyNetHome, 'policy.json'), '{bad json', 'utf-8');

    const readResult = readUserPolicyForGui({ userConfigDir: join(safetyNetHome, 'rules') });
    expect(readResult.exists).toBe(true);
    expect(readResult.raw).toBe('{bad json');
    expect(readResult.errors[0]).toContain('Invalid JSON');

    const writeResult = writeUserPolicyFromGui(
      {
        ...DEFAULT_GUI_POLICY,
        builtins: { overrides: { 'git.reset-hard': 'allow' } },
      },
      { userConfigDir: join(safetyNetHome, 'rules') },
    );

    expect(writeResult.errors).toContain('builtins.overrides.git.reset-hard must be "off"');
    expect(readFileSync(join(safetyNetHome, 'policy.json'), 'utf-8')).toBe('{bad json');
  });

  test('save writes only user policy and rejects policy allow paths', () => {
    const projectPolicyPath = join(tempDir, '.cc-safety-net', 'policy.json');
    mkdirSync(join(tempDir, '.cc-safety-net'), { recursive: true });
    writeFileSync(projectPolicyPath, JSON.stringify({ version: 1 }), 'utf-8');

    const result = writeUserPolicyFromGui(
      {
        ...DEFAULT_GUI_POLICY,
        secret_protection: {
          ...DEFAULT_GUI_POLICY.secret_protection,
          allow_paths: ['~/.cc-safety-net/policy.json'],
        },
      },
      { cwd: tempDir, userConfigDir: join(safetyNetHome, 'rules') },
    );

    expect(result.errors).toContain('secret_protection.allow_paths[0] cannot target policy config');
    expect(readFileSync(projectPolicyPath, 'utf-8')).toBe(JSON.stringify({ version: 1 }));
  });

  test('built-in metadata covers every stable built-in id', () => {
    expect(BUILTIN_RULE_METADATA.map((entry) => entry.id).sort()).toEqual(
      [...BUILTIN_RULE_IDS].sort(),
    );
    for (const entry of BUILTIN_RULE_METADATA) {
      expect(entry.category).not.toBe('');
      expect(entry.label).not.toBe('');
      expect(entry.description).not.toBe('');
    }
  });
});
