import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DESTRUCTIVE_COMMAND_RULE_IDS } from '@/core/destructive-command-rules';
import {
  DEFAULT_GUI_POLICY,
  DESTRUCTIVE_COMMAND_RULE_METADATA,
  readUserPolicyForGui,
  repairUserPolicyForGui,
  SECRET_PROTECTION_RULE_METADATA,
  writeUserPolicyFromGui,
} from '@/core/policy';

describe('policy GUI helpers', () => {
  let tempDir: string;
  let safetyNetHome: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safety-net-policy-gui-'));
    safetyNetHome = join(tempDir, 'home', '.cc-safety-net');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('missing user policy returns defaults without creating a file', () => {
    const result = readUserPolicyForGui({ userConfigDir: join(safetyNetHome, 'rules') });

    expect(result.exists).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.policy).toEqual(DEFAULT_GUI_POLICY);
    expect(result.policy.destructive_command_protection.enabled).toBe(true);
    expect(result.policy.secret_protection.enabled).toBe(true);
    expect(existsSync(join(safetyNetHome, 'policy.json'))).toBe(false);
  });

  test('valid user policy reads and rewrites as canonical JSON', () => {
    mkdirSync(safetyNetHome, { recursive: true });
    writeFileSync(
      join(safetyNetHome, 'policy.json'),
      JSON.stringify({
        version: 1,
        modes: { paranoid_rm: true },
        destructive_command_protection: { enabled: false, overrides: { 'git.reset-hard': 'off' } },
        secret_protection: {
          enabled: true,
          overrides: { 'secret.ext.pem': 'off' },
          deny_paths: ['private/token.txt'],
        },
      }),
      'utf-8',
    );

    const readResult = readUserPolicyForGui({ userConfigDir: join(safetyNetHome, 'rules') });
    expect(readResult.errors).toEqual([]);
    expect(readResult.policy.modes.paranoid_rm).toBe(true);
    expect(readResult.policy.destructive_command_protection.enabled).toBe(false);
    expect(readResult.policy.destructive_command_protection.overrides).toEqual({
      'git.reset-hard': 'off',
    });
    expect(readResult.policy.secret_protection.overrides).toEqual({ 'secret.ext.pem': 'off' });

    const writeResult = writeUserPolicyFromGui(readResult.policy, {
      userConfigDir: join(safetyNetHome, 'rules'),
    });

    expect(writeResult.errors).toEqual([]);
    expect(readFileSync(join(safetyNetHome, 'policy.json'), 'utf-8')).toBe(
      `${JSON.stringify(readResult.policy, null, 2)}\n`,
    );
  });

  test('rejects invalid secret overrides', () => {
    const invalidOverrides = writeUserPolicyFromGui(
      {
        ...DEFAULT_GUI_POLICY,
        secret_protection: {
          ...DEFAULT_GUI_POLICY.secret_protection,
          overrides: { 'secret.unknown': 'off', 'secret.ext.pem': 'allow' },
        },
      },
      { userConfigDir: join(safetyNetHome, 'rules') },
    );
    expect(invalidOverrides.errors).toContain('unknown secret protection rule id "secret.unknown"');
    expect(invalidOverrides.errors).toContain(
      'secret_protection.overrides.secret.ext.pem must be "off"',
    );
  });

  test('rejects invalid destructive command policy values', () => {
    const invalid = writeUserPolicyFromGui(
      {
        ...DEFAULT_GUI_POLICY,
        destructive_command_protection: {
          enabled: 'yes',
          overrides: { 'git.reset-hard': 'allow' },
        },
      },
      { userConfigDir: join(safetyNetHome, 'rules') },
    );

    expect(invalid.errors).toContain('destructive_command_protection.enabled must be a boolean');
    expect(invalid.errors).toContain(
      'destructive_command_protection.overrides.git.reset-hard must be "off"',
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
        destructive_command_protection: { enabled: true, overrides: { 'git.reset-hard': 'allow' } },
      },
      { userConfigDir: join(safetyNetHome, 'rules') },
    );

    expect(writeResult.errors).toContain(
      'destructive_command_protection.overrides.git.reset-hard must be "off"',
    );
    expect(readFileSync(join(safetyNetHome, 'policy.json'), 'utf-8')).toBe('{bad json');
  });

  test('repair preserves valid fields from parseable invalid policy', () => {
    mkdirSync(safetyNetHome, { recursive: true });
    writeFileSync(
      join(safetyNetHome, 'policy.json'),
      JSON.stringify({
        version: 2,
        modes: {
          strict: true,
          paranoid_rm: 'yes',
          worktree_mode: false,
          unknown: true,
        },
        destructive_command_protection: {
          enabled: 'yes',
          overrides: {
            'git.reset-hard': 'off',
            'git.unknown': 'off',
            'git.clean-force': 'allow',
          },
        },
        secret_protection: {
          enabled: false,
          overrides: {
            'secret.ext.pem': 'off',
            'secret.unknown': 'off',
          },
          deny_paths: ['private/token.txt', '', 42],
        },
        extra: true,
      }),
      'utf-8',
    );

    const result = repairUserPolicyForGui({ userConfigDir: join(safetyNetHome, 'rules') });

    expect(result.errors).toEqual([]);
    expect(result.policy).toEqual({
      version: 1,
      modes: {
        strict: true,
        paranoid: false,
        paranoid_rm: false,
        paranoid_interpreters: false,
        worktree_mode: false,
      },
      destructive_command_protection: {
        enabled: true,
        overrides: { 'git.reset-hard': 'off' },
      },
      secret_protection: {
        enabled: false,
        overrides: { 'secret.ext.pem': 'off' },
        deny_paths: ['private/token.txt'],
      },
    });
    expect(readFileSync(join(safetyNetHome, 'policy.json'), 'utf-8')).toBe(
      `${JSON.stringify(result.policy, null, 2)}\n`,
    );
  });

  test('repair restores defaults when policy JSON cannot be parsed', () => {
    mkdirSync(safetyNetHome, { recursive: true });
    writeFileSync(join(safetyNetHome, 'policy.json'), '{bad json', 'utf-8');

    const result = repairUserPolicyForGui({ userConfigDir: join(safetyNetHome, 'rules') });

    expect(result.errors).toEqual([]);
    expect(result.policy).toEqual(DEFAULT_GUI_POLICY);
    expect(readFileSync(join(safetyNetHome, 'policy.json'), 'utf-8')).toBe(
      `${JSON.stringify(DEFAULT_GUI_POLICY, null, 2)}\n`,
    );
  });

  test('save writes only user policy with secret overrides', () => {
    const projectPolicyPath = join(tempDir, '.cc-safety-net', 'policy.json');
    mkdirSync(join(tempDir, '.cc-safety-net'), { recursive: true });
    writeFileSync(projectPolicyPath, JSON.stringify({ version: 1 }), 'utf-8');

    const result = writeUserPolicyFromGui(
      {
        ...DEFAULT_GUI_POLICY,
        secret_protection: {
          ...DEFAULT_GUI_POLICY.secret_protection,
          overrides: { 'secret.ext.pem': 'off' },
        },
      },
      { cwd: tempDir, userConfigDir: join(safetyNetHome, 'rules') },
    );

    expect(result.errors).toEqual([]);
    expect(readFileSync(projectPolicyPath, 'utf-8')).toBe(JSON.stringify({ version: 1 }));
  });

  test('destructive command metadata covers every stable destructive command id', () => {
    expect(DESTRUCTIVE_COMMAND_RULE_METADATA.map((entry) => entry.id).sort()).toEqual(
      [...DESTRUCTIVE_COMMAND_RULE_IDS].sort(),
    );
    for (const entry of DESTRUCTIVE_COMMAND_RULE_METADATA) {
      expect(entry.category).not.toBe('');
      expect(entry.label).not.toBe('');
      expect(entry.description).not.toBe('');
    }
  });

  test('exports secret protection metadata for GUI responses', () => {
    expect(SECRET_PROTECTION_RULE_METADATA[0]).toMatchObject({
      id: 'secret.basename.env',
      category: 'Basename',
    });
  });
});
