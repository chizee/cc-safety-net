import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findPolicyApplyInvocationInCommand,
  REASON_POLICY_APPLY_PROTECTION,
} from '@/guards/policy-apply-protection';

// Every string below is analyzer INPUT ONLY: it is handed to the matcher and is
// never executed. The cwd is a name under the system temp dir that nothing writes to.
const cwd = join(tmpdir(), 'safety-net-policy-apply-project');

describe('policy apply invocation protection', () => {
  test('blocks every runner form an agent could reach policy apply through', () => {
    for (const command of [
      'cc-safety-net policy apply proposal.json',
      'ccsn policy apply',
      '/usr/local/bin/cc-safety-net policy apply proposal.json',
      'npx cc-safety-net policy apply proposal.json',
      'npx -y cc-safety-net policy apply proposal.json',
      'npx --yes ccsn policy apply proposal.json',
      'bunx cc-safety-net policy apply proposal.json',
      'pnpx cc-safety-net policy apply proposal.json',
      'pnpm dlx cc-safety-net policy apply proposal.json',
      'yarn dlx ccsn policy apply proposal.json',
      'bun dist/bin/cc-safety-net.js policy apply proposal.json',
      'node dist/bin/cc-safety-net.js policy apply proposal.json',
      'bun run src/cli/cc-safety-net.ts policy apply proposal.json',
      'git status && cc-safety-net policy apply proposal.json',
      // Scope flags parse from any position, so they must not unhook the match.
      'cc-safety-net --global policy apply proposal.json',
      'ccsn policy --global apply proposal.json',
      'cc-safety-net policy apply -g proposal.json',
      // Runners resolve versioned specs to the same package.
      'npx -y cc-safety-net@latest policy apply proposal.json',
      'bunx cc-safety-net@2.3.0 policy apply proposal.json',
      'pnpm dlx cc-safety-net@next policy apply proposal.json',
      // Runner options before the target must not unhook the block.
      'npx --package cc-safety-net ccsn policy apply proposal.json',
      'npx --loglevel=silent cc-safety-net policy apply proposal.json',
      'npx --loglevel silent cc-safety-net policy apply proposal.json',
      // npm/pnpm/yarn reach the same package through `exec`.
      'npm exec -- cc-safety-net policy apply proposal.json',
      'npm exec cc-safety-net policy apply proposal.json',
      'pnpm exec cc-safety-net policy apply proposal.json',
      'yarn exec cc-safety-net policy apply proposal.json',
      // Runner-global options before the subcommand or entrypoint.
      'npm --silent exec -- ccsn policy apply proposal.json',
      'pnpm --silent dlx cc-safety-net policy apply proposal.json',
      'node -- dist/bin/cc-safety-net.js policy apply proposal.json',
      'node --no-warnings dist/bin/cc-safety-net.js policy apply proposal.json',
    ]) {
      expect(findPolicyApplyInvocationInCommand(command, cwd), command).not.toBeNull();
    }
  });

  test('blocks the invocation hidden behind an environment prelude', () => {
    for (const command of [
      'CI=1 cc-safety-net policy apply proposal.json',
      'env CI=1 cc-safety-net policy apply proposal.json',
      'sudo cc-safety-net policy apply proposal.json',
      'command ccsn policy apply proposal.json',
      'env FORCE_COLOR=0 npx -y cc-safety-net policy apply proposal.json',
    ]) {
      expect(findPolicyApplyInvocationInCommand(command, cwd), command).not.toBeNull();
    }
  });

  test('leaves read-only policy work and other programs alone', () => {
    for (const command of [
      'cc-safety-net policy check proposal.json',
      'npx -y cc-safety-net policy check proposal.json',
      'pnpm dlx cc-safety-net policy check proposal.json',
      'cc-safety-net policy',
      'cc-safety-net status',
      'cc-safety-net rule list',
      'cc-safety-net explain "rm -rf ."',
      // A runner resolves its target by the token as written, so these are
      // different programs whose arguments are none of this guard's business.
      'npx -y @scope/cc-safety-net policy apply proposal.json',
      'bunx ./vendor/cc-safety-net policy apply proposal.json',
      // Node has no `run` subcommand: this executes a local script named `run`.
      'node run src/cli/cc-safety-net.ts policy apply proposal.json',
      'bun run src/cli/other.ts policy apply proposal.json',
      'other-tool policy apply proposal.json',
      "echo 'cc-safety-net policy apply proposal.json'",
    ]) {
      expect(findPolicyApplyInvocationInCommand(command, cwd), command).toBeNull();
    }
  });

  test('reports the recognized invocation and names the human flow', () => {
    expect(
      findPolicyApplyInvocationInCommand('pnpm dlx cc-safety-net policy apply proposal.json', cwd)
        ?.target,
    ).toBe('pnpm dlx cc-safety-net policy apply proposal.json');
    expect(REASON_POLICY_APPLY_PROTECTION).toContain('cc-safety-net policy apply');
    expect(REASON_POLICY_APPLY_PROTECTION).toContain('terminal');
    expect(REASON_POLICY_APPLY_PROTECTION).toContain('cc-safety-net policy check');
  });
});
