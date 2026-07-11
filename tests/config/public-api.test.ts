import { describe, test } from 'bun:test';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTempDir } from '../helpers';
import { expectTypeScriptProjectCompiles } from '../helpers/typescript';

describe('configuration public API break', () => {
  test('generated declarations require PolicySnapshot and reject legacy config APIs', async () => {
    await withTempDir('cc-safety-net-policy-api-', (dir) => {
      for (const subdir of ['package/domain', 'package/core/analyze']) {
        mkdirSync(join(dir, subdir), { recursive: true });
      }
      for (const file of [
        'types.d.ts',
        'domain/decision.d.ts',
        'domain/policy.d.ts',
        'core/analyze/index.d.ts',
      ]) {
        copyFileSync(join(process.cwd(), 'dist', file), join(dir, 'package', file));
      }
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
      writeFileSync(
        join(dir, 'consumer.ts'),
        `import type { AnalyzeOptions, CustomRule, SecretProtectionConfig } from './package/types.js';
import type { PolicySnapshot } from './package/domain/policy.js';
import { analyzeCommand } from './package/core/analyze/index.js';
// @ts-expect-error Config was intentionally removed in the Phase 4 API break.
import type { Config } from './package/types.js';
// @ts-expect-error loadConfig was intentionally removed in the Phase 4 API break.
import { loadConfig } from './package/core/analyze/index.js';
declare const policySnapshot: PolicySnapshot;
const options: AnalyzeOptions = { policySnapshot };
analyzeCommand('git status', options);
const blockArgs: string[] = ['--force'];
const customRule: CustomRule = {
  name: 'block-force',
  command: 'tool',
  block_args: blockArgs,
  reason: 'Use a scoped command.',
};
const disabledRules: ReadonlySet<string> = new Set(['secret.ext.pem']);
const denyPaths: string[] = ['private/token.txt'];
const secretProtection: SecretProtectionConfig = { disabledRules, denyPaths };
secretProtection.disabledRules?.has('secret.ext.pem');
secretProtection.denyPaths.push('private/second-token.txt');
void customRule;
// @ts-expect-error AnalyzeOptions.config was intentionally removed.
const legacyOptions: AnalyzeOptions = { config: { version: 1, rules: [] } };
void legacyOptions;
void (null as unknown as Config);
void loadConfig;
`,
      );
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            noEmit: true,
            strict: true,
            target: 'ESNext',
            baseUrl: '.',
            paths: { '@/*': ['package/*'] },
          },
          files: ['consumer.ts'],
        }),
      );

      expectTypeScriptProjectCompiles(join(dir, 'tsconfig.json'));
    });
  });
});
