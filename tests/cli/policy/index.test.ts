import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { runPolicyCommand } from '@/cli/policy';
import { captureConsoleOutput, withEnv, withTempDir } from '../../helpers';

type PromptStreams = {
  input: NodeJS.ReadStream;
  output: NodeJS.WriteStream;
  written: string[];
};

/** A TTY-shaped stream pair; `answer` is the line the confirmation reads back. */
function createPromptStreams(answer?: string): PromptStreams {
  const input = new PassThrough() as unknown as NodeJS.ReadStream & { isTTY: boolean };
  const output = new PassThrough() as unknown as NodeJS.WriteStream & { isTTY: boolean };
  input.isTTY = true;
  output.isTTY = true;
  const written: string[] = [];
  output.on('data', (chunk: Buffer) => written.push(String(chunk)));
  if (answer !== undefined) input.write(`${answer}\n`);
  return { input, output, written };
}

function createNonTtyStreams(): PromptStreams {
  const streams = createPromptStreams();
  (streams.input as unknown as { isTTY: boolean }).isTTY = false;
  (streams.output as unknown as { isTTY: boolean }).isTTY = false;
  return streams;
}

async function runPolicy(
  args: string[],
  options?: { cwd?: string; input?: NodeJS.ReadStream; output?: NodeJS.WriteStream },
) {
  const {
    result: exitCode,
    stdout,
    stderr,
  } = await captureConsoleOutput(() => runPolicyCommand(args, options));
  return { exitCode, stdout: stdout.join('\n'), stderr: stderr.join('\n') };
}

function writeProposal(dir: string, policy: unknown): string {
  const path = join(dir, 'proposal.json');
  writeFileSync(path, JSON.stringify(policy, null, 2));
  return path;
}

/** Isolates the user scope; project-scope diffs read the user policy for the effective merge. */
function runPolicyIsolated(
  tempDir: string,
  args: string[],
  options?: { input?: NodeJS.ReadStream; output?: NodeJS.WriteStream },
) {
  return withEnv({ CC_SAFETY_NET_HOME: join(tempDir, 'home') }, () =>
    runPolicy(args, { cwd: tempDir, ...options }),
  );
}

function writeUserPolicy(tempDir: string, policy: unknown): void {
  const home = join(tempDir, 'home');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'policy.json'), JSON.stringify(policy));
}

const STRICT_PROPOSAL = {
  version: 1,
  safety: { level: 'strict', overrides: {} },
  workflow: { worktree_mode: false },
  destructive_command_protection: { enabled: true, overrides: {}, allow_paths: [] },
  secret_protection: { enabled: true, overrides: {}, deny_paths: [], allow_paths: [] },
};

describe('policy check', () => {
  test('reports the project scope target and the field-level diff', async () => {
    await withTempDir('safety-net-policy-check-', async (tempDir) => {
      const proposal = writeProposal(tempDir, {
        ...STRICT_PROPOSAL,
        workflow: { worktree_mode: true },
      });

      const result = await runPolicyIsolated(tempDir, ['check', proposal]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(
        `Scope: project (${join(tempDir, '.cc-safety-net', 'policy.json')})`,
      );
      expect(result.stdout).toContain(`Proposal: ${proposal}`);
      expect(result.stdout).toContain('safety.level: standard -> strict');
      expect(result.stdout).toContain('workflow.worktree_mode: false -> true');
      expect(existsSync(join(tempDir, '.cc-safety-net', 'policy.json'))).toBe(false);
    });
  });

  test('diffs against the policy already in the target scope', async () => {
    await withTempDir('safety-net-policy-check-current-', async (tempDir) => {
      mkdirSync(join(tempDir, '.cc-safety-net'));
      writeFileSync(
        join(tempDir, '.cc-safety-net', 'policy.json'),
        JSON.stringify({ ...STRICT_PROPOSAL, secret_protection: { enabled: false } }),
      );
      const proposal = writeProposal(tempDir, STRICT_PROPOSAL);

      const result = await runPolicyIsolated(tempDir, ['check', proposal]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('secret_protection.enabled: false -> true');
      expect(result.stdout).not.toContain('safety.level:');
    });
  });

  test('reports no changes when the proposal matches the current policy', async () => {
    await withTempDir('safety-net-policy-check-same-', async (tempDir) => {
      const proposal = writeProposal(tempDir, {
        ...STRICT_PROPOSAL,
        safety: { level: 'standard', overrides: {} },
      });

      const result = await runPolicyIsolated(tempDir, ['check', proposal]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No changes.');
    });
  });

  test('shows the effective change when a proposal overrides inherited strictness', async () => {
    await withTempDir('safety-net-policy-check-effective-', async (tempDir) => {
      writeUserPolicy(tempDir, { version: 1, safety: { level: 'strict' } });
      const proposal = writeProposal(tempDir, { version: 1, safety: { level: 'standard' } });
      const result = await runPolicyIsolated(tempDir, ['check', proposal]);
      // A field-level diff of the file alone would show nothing here; only the
      // user-plus-project merge reveals that applying drops the inherited level.
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('safety.level: strict -> standard');
    });
  });

  test('the effective diff uses the embedded baseline when no user file exists', async () => {
    await withTempDir('safety-net-policy-check-embedded-', async (tempDir) => {
      const globals = globalThis as Record<string, unknown>;
      globals.__CC_SAFETY_NET_EMBEDDED_POLICY__ = { version: 1, safety: { level: 'strict' } };
      try {
        const proposal = writeProposal(tempDir, {
          version: 1,
          safety: { level: 'standard' },
          workflow: { worktree_mode: true },
        });
        const result = await runPolicyIsolated(tempDir, ['check', proposal]);
        // An Amp install runs against the embedded snapshot, so diffing against
        // plain defaults would hide that this proposal lowers the enforced level.
        expect(result.stdout).toContain('safety.level: strict -> standard');
        expect(result.stdout).toContain('workflow.worktree_mode: false -> true');
      } finally {
        delete globals.__CC_SAFETY_NET_EMBEDDED_POLICY__;
      }
    });
  });

  test('a malformed user file falls back to defaults, not the embedded baseline', async () => {
    await withTempDir('safety-net-policy-check-malformed-user-', async (tempDir) => {
      const globals = globalThis as Record<string, unknown>;
      globals.__CC_SAFETY_NET_EMBEDDED_POLICY__ = { version: 1, safety: { level: 'strict' } };
      try {
        const home = join(tempDir, 'home');
        mkdirSync(home, { recursive: true });
        writeFileSync(join(home, 'policy.json'), '{ not json');
        const proposal = writeProposal(tempDir, { version: 1, safety: { level: 'strict' } });

        const result = await runPolicyIsolated(tempDir, ['check', proposal]);

        // Runtime treats an unreadable existing file as protective defaults; the
        // embedded snapshot only stands in when no user file exists at all.
        expect(result.stdout).toContain('safety.level: standard -> strict');
      } finally {
        delete globals.__CC_SAFETY_NET_EMBEDDED_POLICY__;
      }
    });
  });

  test('shows inheritance returning when a proposal unsets a project field', async () => {
    await withTempDir('safety-net-policy-check-inherit-', async (tempDir) => {
      writeUserPolicy(tempDir, { version: 1, safety: { level: 'strict' } });
      mkdirSync(join(tempDir, '.cc-safety-net'));
      writeFileSync(
        join(tempDir, '.cc-safety-net', 'policy.json'),
        JSON.stringify({ version: 1, safety: { level: 'paranoid' } }),
      );
      const proposal = writeProposal(tempDir, { version: 1, workflow: { worktree_mode: true } });

      const result = await runPolicyIsolated(tempDir, ['check', proposal]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('safety.level: paranoid -> strict');
    });
  });

  test('prints the schema diagnostics and exits 1 for an invalid proposal', async () => {
    await withTempDir('safety-net-policy-check-invalid-', async (tempDir) => {
      const proposal = writeProposal(tempDir, {
        version: 1,
        safety: { level: 'nope', overrides: {} },
      });

      const result = await runPolicy(['check', proposal], { cwd: tempDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(proposal);
      expect(result.stderr).toContain('safety.level');
      expect(result.stdout).not.toContain('Changes');
    });
  });

  test('reports malformed JSON without claiming a schema problem', async () => {
    await withTempDir('safety-net-policy-check-json-', async (tempDir) => {
      const proposal = join(tempDir, 'proposal.json');
      writeFileSync(proposal, '{ not json');

      const result = await runPolicy(['check', proposal], { cwd: tempDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid JSON');
    });
  });

  test('reports a missing proposal file', async () => {
    await withTempDir('safety-net-policy-check-missing-', async (tempDir) => {
      const result = await runPolicy(['check', join(tempDir, 'absent.json')], { cwd: tempDir });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('absent.json');
    });
  });
});

describe('policy apply', () => {
  test('refuses to apply without a terminal and names the human flow', async () => {
    await withTempDir('safety-net-policy-apply-notty-', async (tempDir) => {
      const proposal = writeProposal(tempDir, STRICT_PROPOSAL);
      const streams = createNonTtyStreams();

      const result = await runPolicyIsolated(tempDir, ['apply', proposal], streams);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('run this yourself in a terminal');
      expect(existsSync(join(tempDir, '.cc-safety-net', 'policy.json'))).toBe(false);
    });
  });

  test('closing the input stream declines instead of hanging', async () => {
    await withTempDir('safety-net-policy-apply-eof-', async (tempDir) => {
      const proposal = writeProposal(tempDir, STRICT_PROPOSAL);
      const streams = createPromptStreams();
      (streams.input as unknown as PassThrough).end();

      const result = await runPolicyIsolated(tempDir, ['apply', proposal], streams);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Cancelled');
      expect(existsSync(join(tempDir, '.cc-safety-net', 'policy.json'))).toBe(false);
    });
  });

  test('declining the confirmation cancels without writing and exits 0', async () => {
    await withTempDir('safety-net-policy-apply-decline-', async (tempDir) => {
      const proposal = writeProposal(tempDir, STRICT_PROPOSAL);
      const streams = createPromptStreams('n');

      const result = await runPolicyIsolated(tempDir, ['apply', proposal], streams);

      expect(result.exitCode).toBe(0);
      expect(streams.written.join('')).toContain('[y/N]');
      expect(result.stdout).toContain('Cancelled');
      expect(existsSync(join(tempDir, '.cc-safety-net', 'policy.json'))).toBe(false);
    });
  });

  test('confirming writes the proposal to the project scope', async () => {
    await withTempDir('safety-net-policy-apply-project-', async (tempDir) => {
      const proposal = writeProposal(tempDir, STRICT_PROPOSAL);
      const streams = createPromptStreams('y');

      const result = await runPolicyIsolated(tempDir, ['apply', proposal], streams);

      const written = join(tempDir, '.cc-safety-net', 'policy.json');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Policy applied: ${written}`);
      const applied = JSON.parse(readFileSync(written, 'utf-8')) as Record<string, unknown>;
      expect(applied.safety).toEqual({ level: 'strict', overrides: {} });
    });
  });

  test('a project proposal with an audit section fails validation instead of dropping it', async () => {
    await withTempDir('safety-net-policy-apply-audit-', async (tempDir) => {
      const proposal = writeProposal(tempDir, {
        ...STRICT_PROPOSAL,
        audit: { retention_days: 90 },
      });
      const streams = createPromptStreams('y');

      const result = await runPolicyIsolated(tempDir, ['apply', proposal], streams);

      // Writing while silently omitting a validated section would let apply claim
      // success for a policy that is not the one the proposal described.
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('audit settings are user scope only');
      expect(streams.written.join('')).not.toContain('[y/N]');
      expect(existsSync(join(tempDir, '.cc-safety-net', 'policy.json'))).toBe(false);
    });
  });

  test('keeps a sparse proposal sparse so unset fields inherit from user scope', async () => {
    await withTempDir('safety-net-policy-apply-sparse-', async (tempDir) => {
      writeUserPolicy(tempDir, { version: 1, safety: { level: 'strict' } });
      const proposal = writeProposal(tempDir, { version: 1, workflow: { worktree_mode: true } });
      const streams = createPromptStreams('y');

      const result = await runPolicyIsolated(tempDir, ['apply', proposal], streams);

      expect(result.exitCode).toBe(0);
      const applied = JSON.parse(
        readFileSync(join(tempDir, '.cc-safety-net', 'policy.json'), 'utf-8'),
      ) as Record<string, unknown>;
      // Writing defaults for absent fields would materialize safety.level "standard"
      // and silently defeat inheritance from the stricter user policy.
      expect(Object.keys(applied).sort()).toEqual(['version', 'workflow']);
    });
  });

  test('--global applies to the user scope instead', async () => {
    await withTempDir('safety-net-policy-apply-global-', async (tempDir) => {
      const home = join(tempDir, 'home');
      mkdirSync(home);
      const proposal = writeProposal(tempDir, STRICT_PROPOSAL);
      const streams = createPromptStreams('y');

      const result = await withEnv({ CC_SAFETY_NET_HOME: home }, () =>
        runPolicy(['apply', proposal, '--global'], { cwd: tempDir, ...streams }),
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`Scope: user (${join(home, 'policy.json')})`);
      const applied = JSON.parse(readFileSync(join(home, 'policy.json'), 'utf-8')) as Record<
        string,
        unknown
      >;
      expect(applied.safety).toEqual({ level: 'strict', overrides: {} });
      expect(applied.audit).toEqual({ retention_days: 30 });
      expect(existsSync(join(tempDir, '.cc-safety-net', 'policy.json'))).toBe(false);
    });
  });

  test('an invalid proposal never reaches the confirmation', async () => {
    await withTempDir('safety-net-policy-apply-invalid-', async (tempDir) => {
      const proposal = writeProposal(tempDir, { version: 2 });
      const streams = createPromptStreams('y');

      const result = await runPolicy(['apply', proposal], { cwd: tempDir, ...streams });

      expect(result.exitCode).toBe(1);
      expect(streams.written.join('')).not.toContain('[y/N]');
      expect(existsSync(join(tempDir, '.cc-safety-net', 'policy.json'))).toBe(false);
    });
  });
});

describe('policy argument handling', () => {
  test('rejects --yes as an unknown option so an applied policy always needs a human', async () => {
    await withTempDir('safety-net-policy-yes-', async (tempDir) => {
      const proposal = writeProposal(tempDir, STRICT_PROPOSAL);

      const result = await runPolicy(['apply', proposal, '--yes'], {
        cwd: tempDir,
        ...createPromptStreams('y'),
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown option for policy: --yes');
      expect(existsSync(join(tempDir, '.cc-safety-net', 'policy.json'))).toBe(false);
    });
  });

  test('rejects unknown options and unknown subcommands', async () => {
    const unknownOption = await runPolicy(['check', 'p.json', '--force']);
    const unknownSubcommand = await runPolicy(['edit', 'p.json']);

    expect(unknownOption.exitCode).toBe(1);
    expect(unknownOption.stderr).toContain('Unknown option for policy: --force');
    expect(unknownSubcommand.exitCode).toBe(1);
    expect(unknownSubcommand.stderr).toContain('Unknown policy subcommand: edit');
  });

  test('requires a subcommand and a proposal file', async () => {
    const bare = await runPolicy([]);
    const noFile = await runPolicy(['apply']);
    const extra = await runPolicy(['check', 'a.json', 'b.json']);

    expect(bare.exitCode).toBe(1);
    expect(bare.stderr).toContain('cc-safety-net policy');
    expect(noFile.exitCode).toBe(1);
    expect(noFile.stderr).toContain('policy apply requires a file');
    expect(extra.exitCode).toBe(1);
    expect(extra.stderr).toContain('Unexpected policy argument: b.json');
  });
});
