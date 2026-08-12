/**
 * Runtime side of the Amp Orb policy snapshot: `install --amp` stamps the publisher's
 * normalized policy onto the published artifact, and a machine with no policy file of its
 * own (an Orb) reads it from `globalThis`. A real file always wins, so these tests drive
 * `loadPolicyConfig` at a temp config dir and never touch the developer's home.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPolicyConfig } from '@/policy/store';
import { withEnv } from '../helpers';

const EMBEDDED_POLICY_GLOBAL = '__CC_SAFETY_NET_EMBEDDED_POLICY__';

function setEmbeddedPolicy(value: unknown): void {
  (globalThis as Record<string, unknown>)[EMBEDDED_POLICY_GLOBAL] = value;
}

describe('embedded policy snapshot', () => {
  let tempDir: string;
  let safetyNetHome: string;
  let original: unknown;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safety-net-embedded-policy-'));
    safetyNetHome = join(tempDir, 'home', '.cc-safety-net');
    original = (globalThis as Record<string, unknown>)[EMBEDDED_POLICY_GLOBAL];
  });

  afterEach(() => {
    if (original === undefined)
      delete (globalThis as Record<string, unknown>)[EMBEDDED_POLICY_GLOBAL];
    if (original !== undefined) setEmbeddedPolicy(original);
    rmSync(tempDir, { recursive: true, force: true });
  });

  function load() {
    return loadPolicyConfig({ userConfigDir: join(safetyNetHome, 'rules') });
  }

  function writePolicyFile(contents: string): void {
    mkdirSync(safetyNetHome, { recursive: true });
    writeFileSync(join(safetyNetHome, 'policy.json'), contents, 'utf-8');
  }

  test('applies the embedded snapshot when no policy file exists', () => {
    setEmbeddedPolicy({
      version: 1,
      safety: { level: 'paranoid', overrides: { fail_closed: true } },
      workflow: { worktree_mode: true },
      destructive_command_protection: {
        enabled: true,
        overrides: { 'git.reset-hard': 'off' },
        allow_paths: [],
      },
      secret_protection: { enabled: true, overrides: {}, deny_paths: ['private/token.txt'] },
      audit: { retention_days: 30 },
    });

    const config = load();

    expect(config.safety.level).toBe('paranoid');
    expect(config.safety.overrides?.failClosed).toBe(true);
    expect(config.worktreeMode).toBe(true);
    expect(config.destructiveCommandRuleOverrides).toEqual({ 'git.reset-hard': 'off' });
    expect(config.secretProtection.denyPaths).toEqual(['private/token.txt']);
    expect(config.errors).toEqual([]);
    expect(config.fallback).toBeUndefined();
  });

  test('a real policy file wins over a different embedded snapshot', () => {
    writePolicyFile(JSON.stringify({ version: 1, safety: { level: 'strict', overrides: {} } }));
    setEmbeddedPolicy({ version: 1, safety: { level: 'paranoid', overrides: {} } });

    expect(load().safety.level).toBe('strict');
  });

  test('an invalid policy file keeps its own fallback instead of the embedded snapshot', () => {
    writePolicyFile('{ not json');
    setEmbeddedPolicy({ version: 1, safety: { level: 'paranoid', overrides: {} } });

    const config = load();

    expect(config.fallback).toBe('defaults');
    expect(config.safety.level).toBeUndefined();
    expect(config.errors[0]).toContain('Invalid JSON');
  });

  test.each([
    ['a string', 'paranoid'],
    ['an array', [{ safety: { level: 'paranoid' } }]],
    ['null', null],
  ])('ignores a non-object embedded snapshot: %s', (_label, value) => {
    setEmbeddedPolicy(value);

    const config = load();

    expect(config.safety.level).toBeUndefined();
    expect(config.destructiveCommandProtectionEnabled).toBe(true);
    expect(config.errors).toEqual([]);
  });

  test('normalizes a garbage embedded snapshot to protective defaults', () => {
    setEmbeddedPolicy({
      safety: { level: 'yolo', overrides: { fail_closed: 'yes' } },
      destructive_command_protection: {
        enabled: 'nope',
        overrides: { 'bogus.rule': 'off', 'git.reset-hard': 'maybe' },
      },
      secret_protection: { enabled: 0, overrides: 'none', deny_paths: 'nope' },
    });

    const config = load();

    expect(config.safety.level).toBe('standard');
    expect(config.safety.overrides?.failClosed).toBeUndefined();
    expect(config.destructiveCommandProtectionEnabled).toBe(true);
    expect(config.destructiveCommandRuleOverrides).toEqual({});
    expect(config.secretProtection.enabled).toBe(true);
    expect(config.secretProtection.denyPaths).toEqual([]);
  });

  test('drops embedded allow paths that do not validate against this machine home', () => {
    const home = join(tempDir, 'orb-home');
    mkdirSync(home, { recursive: true });
    setEmbeddedPolicy({
      version: 1,
      destructive_command_protection: {
        enabled: true,
        overrides: {},
        allow_paths: ['~/work', 'relative/path', home],
      },
    });

    expect(withEnv({ HOME: home }, () => load().destructiveCommandAllowPaths)).toEqual(['~/work']);
  });
});
