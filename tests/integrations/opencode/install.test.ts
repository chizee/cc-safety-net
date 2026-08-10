import { describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripJsonComments } from '@/integrations/jsonc';
import { uninstallOpenCode } from '@/integrations/opencode/install';
import { makeTempHome } from '../hook-helpers';

function uninstallWithConfigs(name: string, files: Record<string, string>) {
  const homeDir = makeTempHome(name);
  const configDir = join(homeDir, '.config', 'opencode');
  mkdirSync(configDir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(configDir, filename), content);
  }

  try {
    const result = uninstallOpenCode(homeDir);
    return {
      result,
      contents: Object.fromEntries(
        Object.keys(files).map((filename) => [
          filename,
          readFileSync(join(configDir, filename), 'utf-8'),
        ]),
      ),
      configDir,
    };
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
}

function uninstallWithConfig(name: string, config: string, filename = 'opencode.json') {
  const { result, contents, configDir } = uninstallWithConfigs(name, { [filename]: config });
  return { result, content: contents[filename] ?? '', configPath: join(configDir, filename) };
}

describe('OpenCode uninstall config editing', () => {
  test('ignores a nested "plugin" key and edits the root plugin array', () => {
    const { result, content, configPath } = uninstallWithConfig(
      'safety-net-opencode-nested',
      `{
  "experimental": {
    "hook": {
      "plugin": ["nested-only"]
    }
  },
  "plugin": [
    "cc-safety-net@latest",
    "other-plugin"
  ]
}
`,
    );

    expect(result).toEqual({ path: configPath, alreadyInstalled: true });
    expect(content).toContain('"plugin": ["nested-only"]');
    expect(content).not.toContain('cc-safety-net');
    expect(JSON.parse(content)).toEqual({
      experimental: { hook: { plugin: ['nested-only'] } },
      plugin: ['other-plugin'],
    });
  });

  test('does not touch managed text inside comments when removing plugin entries', () => {
    const { result, content, configPath } = uninstallWithConfig(
      'safety-net-opencode-comments',
      `{
  /* plugin list ] here */
  "plugin": [
    // "cc-safety-net@dev",
    "cc-safety-net@latest",
    "other-plugin"
  ]
}
`,
      'opencode.jsonc',
    );

    expect(result).toEqual({ path: configPath, alreadyInstalled: true });
    expect(content).toContain('/* plugin list ] here */');
    expect(content).toContain('// "cc-safety-net@dev",');
    expect(content).not.toContain('"cc-safety-net@latest"');
    expect(JSON.parse(stripJsonComments(content))).toEqual({ plugin: ['other-plugin'] });
  });

  test('removes multiple managed plugin entries without corrupting the array', () => {
    const { result, content, configPath } = uninstallWithConfig(
      'safety-net-opencode-multi',
      `{
  "plugin": [
    "cc-safety-net",
    "other-plugin",
    "cc-safety-net@latest"
  ]
}
`,
    );

    expect(result).toEqual({ path: configPath, alreadyInstalled: true });
    expect(JSON.parse(content)).toEqual({ plugin: ['other-plugin'] });
  });

  test('removing the only plugin entry leaves a valid empty array', () => {
    const { result, content, configPath } = uninstallWithConfig(
      'safety-net-opencode-only',
      `{
  "plugin": [
    "cc-safety-net@latest"
  ],
  "theme": "system"
}
`,
    );

    expect(result).toEqual({ path: configPath, alreadyInstalled: true });
    expect(JSON.parse(content)).toEqual({ plugin: [], theme: 'system' });
  });

  test('escaped quotes and comment-like text inside a string value do not confuse the scanner', () => {
    const instructions = 'say \\"plugin\\": [ nope ] // not a comment';
    const { result, content, configPath } = uninstallWithConfig(
      'safety-net-opencode-escapes',
      `{
  "instructions": "${instructions}",
  "plugin": [
    "cc-safety-net@latest",
    "other-plugin"
  ]
}
`,
    );

    expect(result).toEqual({ path: configPath, alreadyInstalled: true });
    expect(content).toContain(`"instructions": "${instructions}",`);
    expect(JSON.parse(content)).toEqual({
      instructions: 'say "plugin": [ nope ] // not a comment',
      plugin: ['other-plugin'],
    });
  });

  test('comments between the "plugin" key and its array do not defeat the array locator', () => {
    const { result, content, configPath } = uninstallWithConfig(
      'safety-net-opencode-key-comments',
      `{
  "plugin" /* which plugins */ : // list
  [
    "cc-safety-net@latest",
    "other-plugin"
  ]
}
`,
      'opencode.jsonc',
    );

    expect(result).toEqual({ path: configPath, alreadyInstalled: true });
    expect(content).toContain('/* which plugins */');
    expect(content).toContain('// list');
    expect(content).not.toContain('cc-safety-net');
    expect(JSON.parse(stripJsonComments(content))).toEqual({ plugin: ['other-plugin'] });
  });
});

describe('OpenCode uninstall config discovery', () => {
  test('scans every config file, not just the first one that exists', () => {
    const json = `{
  "plugin": ["unrelated-plugin"]
}
`;
    const { result, contents, configDir } = uninstallWithConfigs('safety-net-opencode-both', {
      'opencode.json': json,
      'opencode.jsonc': `{
  "plugin": ["cc-safety-net@latest", "other-plugin"]
}
`,
    });

    expect(result).toEqual({
      path: join(configDir, 'opencode.jsonc'),
      alreadyInstalled: true,
    });
    expect(contents['opencode.json']).toBe(json);
    expect(JSON.parse(contents['opencode.jsonc'] ?? '')).toEqual({ plugin: ['other-plugin'] });
  });

  test('a broken opencode.json does not block uninstalling from opencode.jsonc', () => {
    const { result, contents, configDir } = uninstallWithConfigs('safety-net-opencode-broken', {
      'opencode.json': '{ "plugin": [ ',
      'opencode.jsonc': `{
  "plugin": ["cc-safety-net@latest", "other-plugin"]
}
`,
    });

    expect(result).toEqual({
      path: join(configDir, 'opencode.jsonc'),
      alreadyInstalled: true,
    });
    expect(contents['opencode.json']).toBe('{ "plugin": [ ');
    expect(JSON.parse(contents['opencode.jsonc'] ?? '')).toEqual({ plugin: ['other-plugin'] });
  });

  test('reports the existing jsonc config when no managed plugin is present', () => {
    const { result, configDir } = uninstallWithConfigs('safety-net-opencode-jsonc-only', {
      'opencode.jsonc': `{
  // no managed plugin here
  "plugin": ["other-plugin"]
}
`,
    });

    expect(result).toEqual({
      path: join(configDir, 'opencode.jsonc'),
      alreadyInstalled: false,
    });
  });

  test('falls back to the default opencode.json path when no config file exists', () => {
    const { result, configDir } = uninstallWithConfigs('safety-net-opencode-none', {});

    expect(result).toEqual({
      path: join(configDir, 'opencode.json'),
      alreadyInstalled: false,
    });
  });
});
