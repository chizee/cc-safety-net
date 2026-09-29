import { afterEach, describe, expect, test } from 'bun:test';
import type { HookDetection } from '@/hosts/detect/context';
import { detect as detectOpenCode } from '@/hosts/opencode/detect';
import type { TreeSpec } from '../../helpers/fixture-tree';
import { detectionRunner } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

const DIR = '.config/opencode';
const JSON_FILE = `${DIR}/opencode.json`;
const JSONC_FILE = `${DIR}/opencode.jsonc`;
const plugins = (...entries: readonly string[]) => JSON.stringify({ plugin: entries });

const detection = detectionRunner((environment) =>
  detectOpenCode({ environment, cwd: environment.home }),
);

const configured = (path: string, errors?: string[]) => ({
  kind: 'returned' as const,
  value: {
    platform: 'opencode',
    status: 'configured',
    method: 'plugin array',
    configPath: `<home>/${path}`,
    errors,
  } satisfies HookDetection,
});

afterEach(removeTempRoots);

test.each([
  ['a plain opencode.json', { [JSON_FILE]: plugins('cc-safety-net') }, JSON_FILE],
  ['a versioned entry', { [JSON_FILE]: plugins('other', 'cc-safety-net@1.2.3') }, JSON_FILE],
  ['a v2 string', { [JSON_FILE]: '{"plugins":["cc-safety-net@latest"]}' }, JSON_FILE],
  [
    'a v2 object',
    { [JSON_FILE]: '{"plugins":[{"package":"cc-safety-net@latest","options":{}}]}' },
    JSON_FILE,
  ],
  [
    'a commented opencode.jsonc',
    { [JSONC_FILE]: '{\n  // ours\n  "plugin": ["cc-safety-net"]\n}\n' },
    JSONC_FILE,
  ],
])('finds the plugin listed in %s', async (_case, seed, path) => {
  expect(await detection(seed)).toEqual(configured(path));
});

test('reads the first config file before the second', async () => {
  expect(
    await detection({
      [JSON_FILE]: plugins('cc-safety-net'),
      [JSONC_FILE]: plugins('cc-safety-net'),
    }),
  ).toEqual(configured(JSON_FILE));
});

test('carries the parse failure of the first file into the answer the second gives', async () => {
  expect(
    await detection({ [JSON_FILE]: '{ "plugin": [', [JSONC_FILE]: plugins('cc-safety-net') }),
  ).toEqual(
    configured(JSONC_FILE, ['Failed to parse opencode.json: JSON Parse error: Unexpected EOF']),
  );
});

test.each([
  ['nothing is configured', {} as TreeSpec],
  ['the plugin array holds someone else', { [JSON_FILE]: plugins('other') } as TreeSpec],
  ['there is no plugin array at all', { [JSON_FILE]: '{}' } as TreeSpec],
  [
    'a similarly named package is configured',
    { [JSON_FILE]: plugins('other-cc-safety-net') } as TreeSpec,
  ],
])('reports OpenCode absent when %s', async (_case, seed) => {
  expect(await detection(seed)).toEqual({
    kind: 'returned' as const,
    value: { platform: 'opencode', status: 'n/a', errors: undefined } satisfies HookDetection,
  });
});

test('reports the parse failure when no config names the plugin', async () => {
  expect(await detection({ [JSONC_FILE]: '{ "plugin": [' })).toEqual({
    kind: 'returned' as const,
    value: {
      platform: 'opencode',
      status: 'n/a',
      errors: ['Failed to parse opencode.jsonc: JSON Parse error: Unexpected EOF'],
    } satisfies HookDetection,
  });
});

test('follows XDG_CONFIG_HOME to the config OpenCode would read', async () => {
  expect(
    await detection(
      { 'xdg/opencode/opencode.json': plugins('cc-safety-net') },
      {
        XDG_CONFIG_HOME: '<home>/xdg',
      },
    ),
  ).toEqual(configured('xdg/opencode/opencode.json'));
});

describe('with OPENCODE_CONFIG_DIR naming another directory', () => {
  const NATIVE_CONFIG = 'native-config/opencode.json';
  const nativeConfigDir = { OPENCODE_CONFIG_DIR: '<home>/native-config' };
  const v2Entry = '{"plugins":["cc-safety-net@latest"]}';

  test('finds a v1 plugin in the XDG config', async () => {
    expect(await detection({ [JSON_FILE]: plugins('cc-safety-net') }, nativeConfigDir)).toEqual(
      configured(JSON_FILE),
    );
  });

  test('finds a v2 plugin in the override directory', async () => {
    expect(await detection({ [NATIVE_CONFIG]: v2Entry }, nativeConfigDir)).toEqual(
      configured(NATIVE_CONFIG),
    );
  });

  test('ignores the XDG config on v2, which reads only the override directory', async () => {
    const detectionOnV2 = detectionRunner((environment) =>
      detectOpenCode({ environment, cwd: environment.home, openCodeVersion: '2.0.19' }),
    );
    expect(await detectionOnV2({ [JSON_FILE]: v2Entry }, nativeConfigDir)).toEqual({
      kind: 'returned' as const,
      value: { platform: 'opencode', status: 'n/a', errors: undefined } satisfies HookDetection,
    });
  });

  test('reads the override directory before the XDG config', async () => {
    expect(
      await detection(
        { [NATIVE_CONFIG]: v2Entry, [JSON_FILE]: plugins('cc-safety-net') },
        nativeConfigDir,
      ),
    ).toEqual(configured(NATIVE_CONFIG));
  });
});

describe('on OpenCode v2 with the plugin inventory', () => {
  const v2Entry = { [JSON_FILE]: '{"plugins":["cc-safety-net@latest"]}' };
  const inventory = (...rows: readonly unknown[]) =>
    JSON.stringify({ location: { directory: '/x' }, data: rows });
  const detectionWith = (openCodePluginListOutput: string | null) =>
    detectionRunner((environment) =>
      detectOpenCode({
        environment,
        cwd: environment.home,
        openCodeVersion: '2.0.19',
        openCodePluginListOutput,
      }),
    );
  const failedRow = (row: Record<string, unknown>) => ({
    source: { type: 'package', target: 'cc-safety-net@latest' },
    features: { server: true },
    ...row,
  });

  test.each([
    [
      'a setup failure',
      failedRow({
        id: 'cc-safety-net',
        source: { type: 'package', target: 'cc-safety-net@latest', version: '1.0.0' },
        state: {
          status: 'failed',
          error: 'Error: invalid shell option\n    at setup (plugin.js:1:1)',
        },
      }),
      'Error: invalid shell option',
    ],
    [
      'a module load failure, which carries no id',
      failedRow({ state: { status: 'failed', error: 'Cannot find module', ref: 'err_1234abcd' } }),
      'Cannot find module',
    ],
  ])('reports %s as disabled', async (_case, row, error) => {
    expect(await detectionWith(inventory(row))(v2Entry)).toEqual({
      kind: 'returned' as const,
      value: {
        platform: 'opencode',
        status: 'disabled',
        method: 'opencode api plugin.list',
        configPath: `<home>/${JSON_FILE}`,
        errors: [`OpenCode reports cc-safety-net failed: ${error}`],
      } satisfies HookDetection,
    });
  });

  test.each([
    [
      'an active row',
      inventory(
        failedRow({ id: 'cc-safety-net', state: { status: 'active' } }),
        failedRow({
          id: 'other',
          source: { type: 'package', target: 'other@latest' },
          state: { status: 'failed', error: 'boom' },
        }),
      ),
    ],
    [
      'an active row beside a failed reload of it',
      inventory(
        failedRow({ id: 'cc-safety-net', state: { status: 'active' } }),
        failedRow({ state: { status: 'failed', error: 'Plugin failed to load', ref: 'err_1' } }),
      ),
    ],
    ['no inventory', null],
    ['an unreadable inventory', 'not json'],
    ['an inventory without the plugin', inventory()],
  ])('keeps the config answer given %s', async (_case, output) => {
    expect(await detectionWith(output)(v2Entry)).toEqual(configured(JSON_FILE));
  });
});
