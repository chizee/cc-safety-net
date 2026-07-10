import { describe, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_INTENTS, type Decision } from '@/domain/decision';
import { withTempDir } from '../helpers';

const allow = { kind: 'allow' } satisfies Decision;
const deny = {
  kind: 'deny',
  reason: 'The command discards local changes.',
  intent: 'use_alternative',
  ruleId: 'git.reset-hard',
  evidence: [{ kind: 'command', command: 'git reset --hard', segment: 'git reset --hard' }],
} satisfies Decision;
const indeterminate = {
  kind: 'indeterminate',
  reason: 'The path could not be resolved safely.',
  evidence: [{ kind: 'path', target: '../unknown' }],
} satisfies Decision;

function decisionKind(decision: Decision): Decision['kind'] {
  switch (decision.kind) {
    case 'allow':
      return 'allow';
    case 'deny':
      return 'deny';
    case 'indeterminate':
      return 'indeterminate';
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

function expectGeneratedTypesResolve(settings: {
  importPath: string;
  module: 'NodeNext' | 'Preserve';
  moduleResolution: 'NodeNext' | 'bundler';
}) {
  return withTempDir('cc-safety-net-decision-consumer-', (dir) => {
    mkdirSync(join(dir, 'package/domain'), { recursive: true });
    copyFileSync(join(process.cwd(), 'dist/types.d.ts'), join(dir, 'package/types.d.ts'));
    copyFileSync(
      join(process.cwd(), 'dist/domain/decision.d.ts'),
      join(dir, 'package/domain/decision.d.ts'),
    );
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    writeFileSync(
      join(dir, 'consumer.ts'),
      `import { BLOCK_INTENTS, type BlockIntent } from '${settings.importPath}';
const intent: BlockIntent = BLOCK_INTENTS[0];
void intent;
`,
    );
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: settings.module,
          moduleResolution: settings.moduleResolution,
          noEmit: true,
          strict: true,
          target: 'ESNext',
        },
        files: ['consumer.ts'],
      }),
    );

    const result = Bun.spawnSync(
      [process.execPath, 'x', 'tsc', '--project', join(dir, 'tsconfig.json')],
      { stderr: 'pipe', stdout: 'pipe' },
    );
    expect({
      exitCode: result.exitCode,
      output: `${result.stdout.toString()}${result.stderr.toString()}`,
    }).toEqual({ exitCode: 0, output: '' });
  });
}

describe('decision domain', () => {
  test('preserves the existing block intents', () => {
    expect(BLOCK_INTENTS).toEqual([
      'hard_stop',
      'use_alternative',
      'scope_down',
      'manual_only',
      'stop_and_explain',
    ]);
  });

  test('supports every decision discriminant exhaustively', () => {
    expect([allow, deny, indeterminate].map(decisionKind)).toEqual([
      'allow',
      'deny',
      'indeterminate',
    ]);
  });

  test('generated type compatibility exports resolve for bundler consumers', async () => {
    await expectGeneratedTypesResolve({
      importPath: './package/types',
      module: 'Preserve',
      moduleResolution: 'bundler',
    });
  });

  test('generated type compatibility exports resolve for NodeNext ESM consumers', async () => {
    await expectGeneratedTypesResolve({
      importPath: './package/types.js',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
    });
  });
});
