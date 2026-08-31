import { describe, expect, spyOn, test } from 'bun:test';
import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRuleCommand } from '@/cli/rule';
import * as systemInfo from '@/integrations/system-info';
import * as sync from '@/rules/policy/sync';
import { captureConsoleOutput, runCCSafetyNetCli, withEnv, withTempDir } from '../../helpers';
import { writeLocalRulebook, writeProjectRuleConfig } from '../../helpers/rulebook';

describe('rule list exit code', () => {
  test('exits 0 when the merged policy has warnings but no errors', async () => {
    await withTempDir('safety-net-rule-list-warnings-', async (tempDir) => {
      const env = { HOME: join(tempDir, 'home') };
      const rulesDir = join(tempDir, '.cc-safety-net', 'rules');
      writeProjectRuleConfig(rulesDir);
      writeFileSync(
        join(rulesDir, 'rule.json'),
        JSON.stringify({
          version: 1,
          rules: ['project-rules'],
          overrides: { 'project-rules/nope': 'off' },
        }),
      );

      const result = await runCCSafetyNetCli(['rule', 'list'], env, tempDir);

      expect(result.output).toContain('unknown override key "project-rules/nope"');
      expect(result.output).toContain('Warnings (1):');
      expect(result.output).toContain('Issues: (none)');
      expect(result.exitCode).toBe(0);
    });
  });
});

describe('rule update notice', () => {
  test('prints the directive to stderr for doc only', async () => {
    await withTempDir('safety-net-rule-update-notice-', async (tempDir) => {
      await withEnv(
        {
          CC_SAFETY_NET_AUDIT_HOME: join(tempDir, 'home'),
          CC_SAFETY_NET_NO_UPDATE_CHECK: undefined,
        },
        async () => {
          const version = spyOn(systemInfo, 'getPackageVersion').mockReturnValue('1.0.0');
          const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ version: '2.0.0' })),
          );

          const list = await captureRuleCommand(['list']);
          expect(list.stderr).not.toContain('UPDATE_AVAILABLE:');
          expect(fetch).not.toHaveBeenCalled();

          const doc = await captureRuleCommand(['doc']);
          expect(doc.exitCode).toBe(0);
          expect(doc.stdout).toContain('# Custom Rules Reference');
          expect(doc.stderr).toBe(
            'UPDATE_AVAILABLE: cc-safety-net v2.0.0 is available (running v1.0.0). Ask the user once whether to run `npx -y cc-safety-net@latest update`; continue the current task either way and do not raise this again.',
          );

          fetch.mockRestore();
          version.mockRestore();
        },
      );
    });
  });
});

describe('rule update refresh', () => {
  // `sync` is covered end to end in tests/cli/rule.test.ts, which runs it inside a temp
  // project: it now deletes leftovers, so it must never run against the developer's own cwd.
  test('update re-resolves remote refs for the whole scope and for one source', async () => {
    const syncRulesConfig = spyOn(sync, 'syncRulesConfig').mockResolvedValue({
      ok: true,
      errors: [],
      entries: [],
    });
    try {
      await captureRuleCommand(['update']);
      expect(syncRulesConfig).toHaveBeenLastCalledWith(
        expect.objectContaining({ refresh: true, only: undefined }),
      );

      await captureRuleCommand(['update', 'alpha']);
      expect(syncRulesConfig).toHaveBeenLastCalledWith(
        expect.objectContaining({ refresh: true, only: 'alpha' }),
      );
    } finally {
      syncRulesConfig.mockRestore();
    }
  });

  // On update, --check skipped remote resolution entirely and reported success
  // for content nothing validated; the flag has no honest CLI carrier left.
  test('rejects --check on every rule subcommand', async () => {
    for (const args of [
      ['update', '--check'],
      ['add', 'owner/repo', '--check'],
      ['remove', 'alpha', '--check'],
    ]) {
      const result = await captureRuleCommand(args);

      expect(result.exitCode, args.join(' ')).toBe(1);
      expect(result.stderr, args.join(' ')).toContain(
        `Unknown option for rule ${args[0]}: --check`,
      );
    }
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

  test('renders repository selection options for rule add help', async () => {
    const result = await captureRuleCommand(['add', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('cc-safety-net rule add [source]');
    expect(result.output).toContain('--ref <ref>');
    expect(result.output).toContain('--only <rulebook...>');
    expect(result.output).toContain('rule add acme/safety-rules --only aws gcloud');
    expect(result.output).toContain('rule add --only terraform aws');
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

  // Depends on the dispatcher fix in src/cli/cc-safety-net.ts, which stops
  // handleCommandHelp from intercepting `rule <leaf> --help`.
  test('routes rule migrate --help to the leaf handler', async () => {
    const result = await runCCSafetyNetCli(['rule', 'migrate', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('cc-safety-net rule migrate');
    expect(result.output).not.toContain('Print the rulebook authoring guide');
  });
});

describe('rule add repository flags', () => {
  // `--only` swallows every following non-flag argument, so the trailing repository lands in
  // the selection instead of the source slot: the omitted source defaults to the official
  // repository and the stray value is judged as the rulebook name it was parsed as.
  test('validates variadic selection names when the source is omitted', async () => {
    const result = await captureRuleCommand(['add', '--only', 'aws', 'owner/repo']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid rulebook names: owner/repo');
  });

  test('rejects repository flags for local and canonical sources', async () => {
    const local = await captureRuleCommand(['add', 'project-rules', '--only', 'aws']);
    const canonical = await captureRuleCommand(['add', 'owner/repo#main/aws', '--ref', 'v2']);

    expect(local.stderr).toContain('--only can only select rulebooks from an owner/repo source');
    expect(canonical.stderr).toContain(
      '--ref can only select a ref for an owner/repo source: owner/repo#main/aws',
    );
  });

  test('rejects missing and invalid repository flag values', async () => {
    const missingOnly = await captureRuleCommand(['add', 'owner/repo', '--only', '--global']);
    const invalidRef = await captureRuleCommand(['add', 'owner/repo', '--ref', 'feature//v2']);
    const invalidName = await captureRuleCommand(['add', 'owner/repo', '--only', 'bad/name']);

    expect(missingOnly.stderr).toContain('--only requires at least one value');
    expect(invalidRef.stderr).toContain('--ref must use valid path segments: feature//v2');
    expect(invalidName.stderr).toContain('Invalid rulebook names: bad/name');
  });

  test('rejects add-only options on other rule commands', async () => {
    const result = await captureRuleCommand(['update', 'aws', '--only', 'gcloud']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown option for rule update: --only');
  });
});

describe('rule add omitted source', () => {
  test('still refuses a bare add, and names the shorthand that selects from the official repository', async () => {
    const result = await captureRuleCommand(['add']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'rule add requires a source (pass --only <rulebook...> to select from cc-safety-net/rulebooks)',
    );
  });

  test('resolves a selection without a source to the official rulebooks repository', async () => {
    const addRulebookSource = spyOn(sync, 'addRulebookSource').mockResolvedValue({
      ok: true,
      errors: [],
      entries: [],
      add: {
        source: 'cc-safety-net/rulebooks',
        ref: 'main',
        selected: ['terraform', 'aws'],
        added: ['terraform', 'aws'],
        alreadyConfigured: [],
        commits: [],
      },
    });
    try {
      const result = await captureRuleCommand(['add', '--only', 'terraform', 'aws']);

      expect(result.exitCode).toBe(0);
      expect(addRulebookSource).toHaveBeenLastCalledWith(
        'cc-safety-net/rulebooks',
        expect.objectContaining({ rulebooks: ['terraform', 'aws'] }),
      );
      expect(result.stdout).toContain('cc-safety-net/rulebooks');
      expect(result.stdout).toContain('Scope: project (');
    } finally {
      addRulebookSource.mockRestore();
    }
  });

  test('applies repository flag validation to the defaulted source', async () => {
    const invalidName = await captureRuleCommand(['add', '--only', 'bad/name']);
    const invalidRef = await captureRuleCommand(['add', '--ref', 'feature//v2', '--only', 'aws']);

    expect(invalidName.exitCode).toBe(1);
    expect(invalidName.stderr).toContain('Invalid rulebook names: bad/name');
    expect(invalidRef.exitCode).toBe(1);
    expect(invalidRef.stderr).toContain('--ref must use valid path segments: feature//v2');
  });
});

describe('rule add scope line', () => {
  test('names the project scope destination it wrote to', async () => {
    await withTempDir('safety-net-rule-add-scope-project-', async (tempDir) => {
      writeLocalRulebook(
        join(tempDir, '.cc-safety-net', 'rules', 'project-rules', 'rulebook.json'),
        'project-rules',
      );

      const result = await runCCSafetyNetCli(
        ['rule', 'add', 'project-rules'],
        { HOME: join(tempDir, 'home') },
        tempDir,
      );

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(
        `Scope: project (${join(realpathSync(tempDir), '.cc-safety-net', 'rules')})`,
      );
      expect(result.output).toContain('Added rulebook source: project-rules');
    });
  });

  test('names the user scope destination under --global', async () => {
    await withTempDir('safety-net-rule-add-scope-user-', async (tempDir) => {
      const home = join(tempDir, 'home');
      writeLocalRulebook(join(home, 'rules', 'project-rules', 'rulebook.json'), 'project-rules');

      const result = await runCCSafetyNetCli(
        ['rule', 'add', 'project-rules', '--global'],
        { CC_SAFETY_NET_HOME: home, HOME: home },
        tempDir,
      );

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain(`Scope: user (${join(home, 'rules')})`);
    });
  });
});

async function captureRuleCommand(args: string[]) {
  const {
    result: exitCode,
    stdout,
    stderr,
  } = await captureConsoleOutput(() => runRuleCommand(args));
  return {
    exitCode,
    output: [...stdout, ...stderr].join('\n'),
    stdout: stdout.join('\n'),
    stderr: stderr.join('\n'),
  };
}
