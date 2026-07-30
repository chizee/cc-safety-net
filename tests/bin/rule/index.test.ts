import { describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { runRuleCommand } from '@/bin/rule';
import { runCCSafetyNetCli, withTempDir } from '../../helpers';
import { writeProjectRuleConfig } from '../../helpers/rulebook';

describe('rule list exit code', () => {
  test('exits 0 when the merged policy has warnings but no errors', async () => {
    await withTempDir('safety-net-rule-list-warnings-', async (tempDir) => {
      const env = { HOME: join(tempDir, 'home') };
      const rulesDir = join(tempDir, '.cc-safety-net', 'rules');
      writeProjectRuleConfig(rulesDir);
      expect((await runCCSafetyNetCli(['rule', 'sync'], env, tempDir)).exitCode).toBe(0);
      rmSync(join(rulesDir, 'project-rules', 'rulebook.json'));

      const result = await runCCSafetyNetCli(['rule', 'list'], env, tempDir);

      expect(result.output).toContain('missing local source for project-rules');
      expect(result.output).toContain('Warnings (1):');
      expect(result.output).toContain('Issues: (none)');
      expect(result.exitCode).toBe(0);
    });
  });
});

describe('rule leaf help', () => {
  test('renders migrate help, not generic rule help', async () => {
    const result = await captureRuleCommand(['migrate', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('cc-safety-net rule migrate');
    expect(result.output).toContain('cc-safety-net rule migrate [--cleanup]');
    expect(result.output).toContain('Migrate legacy inline rules');
    expect(result.output).not.toContain('SUBCOMMANDS:');
    expect(result.output).not.toContain('Print the rulebook authoring guide');
  });

  test('renders wrapper list help, not the first wrapper leaf', async () => {
    const result = await captureRuleCommand(['wrapper', 'list', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('cc-safety-net rule wrapper list');
    expect(result.output).toContain('List transparent command wrappers');
    expect(result.output).not.toContain('Trust a transparent command wrapper');
  });

  test('renders every wrapper action instead of the missing-action error', async () => {
    // The wrapper parser rejects a bare `rule wrapper`; asking for help is not that mistake.
    const result = await captureRuleCommand(['wrapper', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('cc-safety-net rule wrapper <subcommand>');
    expect(result.output).toContain('wrapper add <command>');
    expect(result.output).toContain('wrapper remove <command>');
    expect(result.output).toContain('wrapper list');
  });

  test('reports an unresolvable help target as the typo it is', async () => {
    const bogusLeaf = await captureRuleCommand(['wrapper', 'bogus', '--help']);
    expect(bogusLeaf.exitCode).toBe(1);

    const bogusSubcommand = await captureRuleCommand(['bogus', '--help']);
    expect(bogusSubcommand.exitCode).toBe(1);
  });

  test('renders generic rule help when no subcommand is given', async () => {
    const result = await captureRuleCommand(['--help']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('SUBCOMMANDS:');
    expect(result.output).toContain('Print the rulebook authoring guide');
  });

  // Depends on the dispatcher fix in src/bin/cc-safety-net.ts, which stops
  // handleCommandHelp from intercepting `rule <leaf> --help`.
  test('routes rule migrate --help to the leaf handler', async () => {
    const result = await runCCSafetyNetCli(['rule', 'migrate', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('cc-safety-net rule migrate');
    expect(result.output).not.toContain('Print the rulebook authoring guide');
  });
});

async function captureRuleCommand(args: string[]) {
  const originalLog = console.log;
  const output: string[] = [];
  console.log = (...parts: unknown[]) => output.push(parts.map(String).join(' '));
  const exitCode = await runRuleCommand(args).finally(() => {
    console.log = originalLog;
  });
  return { exitCode, output: output.join('\n') };
}
