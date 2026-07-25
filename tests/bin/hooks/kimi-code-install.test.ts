import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installKimiCode, uninstallKimiCode } from '@/bin/hook/install/kimi-code';
import { makeTempHome } from './hook-helpers';

const KIMI_INLINE_HOOK =
  '{ event = "PreToolUse", command = "npx -y cc-safety-net hook --kimi-code" }';
const KIMI_HOOK_BLOCK = `[[hooks]]
event = "PreToolUse"
command = "npx -y cc-safety-net hook --kimi-code"`;

function writeKimiConfig(homeDir: string, content: string) {
  const configPath = join(homeDir, '.kimi-code', 'config.toml');
  mkdirSync(join(homeDir, '.kimi-code'), { recursive: true });
  writeFileSync(configPath, content);
  return configPath;
}

describe('installKimiCode', () => {
  test('leaves a hooks array nested under a table untouched and appends a table block', () => {
    const homeDir = makeTempHome('safety-net-kimi-install');
    const nestedTable = `[agent.hooks_config]
hooks = [
  { event = "Stop", command = ".kimi/hooks/check.sh" }
]`;
    const configPath = writeKimiConfig(homeDir, `model = "kimi-k2"\n\n${nestedTable}\n`);

    try {
      const result = installKimiCode(homeDir);
      const content = readFileSync(configPath, 'utf-8');

      expect(result).toEqual({ path: configPath, alreadyInstalled: false });
      expect(content).toContain(nestedTable);
      expect(content.trimEnd().endsWith(KIMI_HOOK_BLOCK)).toBe(true);
      expect(content).not.toContain(KIMI_INLINE_HOOK);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('does not emit a double comma when the inline hooks array has a trailing comma', () => {
    const homeDir = makeTempHome('safety-net-kimi-install');
    const configPath = writeKimiConfig(
      homeDir,
      `hooks = [
  { event = "Stop", command = ".kimi/hooks/check.sh" },
]
`,
    );

    try {
      installKimiCode(homeDir);
      const content = readFileSync(configPath, 'utf-8');

      expect(content).toContain(KIMI_INLINE_HOOK);
      expect(content).not.toContain(',,');
      expect(content).not.toContain(KIMI_HOOK_BLOCK);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('ignores brackets and escaped quotes inside quoted strings when scanning the array', () => {
    const homeDir = makeTempHome('safety-net-kimi-install');
    const existingItem = '{ event = "Stop", command = "echo ] } \\" ]" }';
    const configPath = writeKimiConfig(
      homeDir,
      `hooks = [
  ${existingItem}
]
model = "kimi-k2"
`,
    );

    try {
      installKimiCode(homeDir);
      const content = readFileSync(configPath, 'utf-8');

      expect(content).toContain(existingItem);
      expect(content.indexOf(existingItem)).toBeLessThan(content.indexOf(KIMI_INLINE_HOOK));
      expect(content.indexOf(KIMI_INLINE_HOOK)).toBeLessThan(content.indexOf('model = "kimi-k2"'));
      expect(content.trimEnd().endsWith('model = "kimi-k2"')).toBe(true);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });

  test('aborts on a malformed hooks array without touching the config file', () => {
    const homeDir = makeTempHome('safety-net-kimi-install');
    const original = `hooks = [
  { event = "Stop", command = ".kimi/hooks/check.sh" }
`;
    const configPath = writeKimiConfig(homeDir, original);

    try {
      expect(() => installKimiCode(homeDir)).toThrow('Unmatched hooks array in Kimi Code config');
      expect(readFileSync(configPath, 'utf-8')).toBe(original);
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});

describe('uninstallKimiCode', () => {
  test('removes only the managed block and keeps tables that follow it', () => {
    const homeDir = makeTempHome('safety-net-kimi-uninstall');
    const configPath = writeKimiConfig(
      homeDir,
      `model = "kimi-k2"

${KIMI_HOOK_BLOCK}

[settings]
verbose = true

[[hooks]]
event = "PreToolUse"
command = "./scripts/other.sh"
`,
    );

    try {
      const result = uninstallKimiCode(homeDir);
      const content = readFileSync(configPath, 'utf-8');

      expect(result).toEqual({ path: configPath, alreadyInstalled: true });
      expect(content).not.toContain('cc-safety-net');
      expect(content).toContain('model = "kimi-k2"');
      expect(content).toContain('[settings]\nverbose = true');
      expect(content).toContain('command = "./scripts/other.sh"');
    } finally {
      rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
