import { createPathCanonicalizationContext } from '@/analyzer/path-canonicalization';
import { stripWrappers } from '@/analyzer/wrapper-prelude';
import {
  findProtectedPathMutationInCommand,
  normalizeProtectedPathCandidate,
} from '@/guards/protected-path-scanner';
import { safetyNetSubcommandIndex } from '@/guards/safety-net-invocation';
import { createSemanticFacts, getCommandSyntaxFact } from '@/guards/semantic-facts';
import type { EnvironmentContext } from '@/ir/analysis';
import { createProcessEnvironment } from '@/ir/environment';
import { createToolInvocation } from '@/ir/invocation';
import type { SemanticFacts } from '@/ir/semantic-facts';
import { getBasename } from '@/parser/shell';

export const REASON_POLICY_APPLY_PROTECTION =
  'Only the user may apply a policy proposal, because it rewrites the configuration CC Safety Net enforces. Ask them to run `cc-safety-net policy apply <file>` themselves in a terminal; you can run `cc-safety-net policy check <file>` to show them what it would change.';

type PolicyApplyTarget = Readonly<{ target: string }>;

export function findPolicyApplyInvocationInSemanticFacts(
  facts: SemanticFacts,
): PolicyApplyTarget | null {
  // Only command and unknown routes carry an input candidate, so a file path that
  // happens to read like this invocation never reaches the recognizer.
  const command = getCommandSyntaxFact(facts, 'input-candidate');
  if (!command) return null;

  const context = createPathCanonicalizationContext(createProcessEnvironment());
  const target = findProtectedPathMutationInCommand(
    command.shell,
    facts.invocation.context.executionCwd,
    context,
    {
      findSegmentTarget: (segment) => findPolicyApplySegment(segment, context.environment),
      isRedirectionTarget: () => false,
      findMalformedTarget: () => null,
      normalizeCwd: normalizeProtectedPathCandidate,
    },
  );
  return target ? { target } : null;
}

/** @internal */
export function findPolicyApplyInvocationInCommand(
  command: string,
  cwd = process.cwd(),
): PolicyApplyTarget | null {
  return findPolicyApplyInvocationInSemanticFacts(
    createSemanticFacts(
      createToolInvocation(
        '',
        { command },
        { kind: 'command', shell: 'posix' },
        { executionCwd: cwd, configCwd: cwd },
        command,
      ),
    ),
  );
}

/**
 * The segment as written when it invokes `policy apply`, else null. `-g`/`--global`
 * are the only flags the policy command accepts and it parses them from any
 * position, so they are skipped before matching the two subcommand tokens;
 * `policy check` and every other subcommand stay allowed by construction.
 */
function findPolicyApplySegment(
  segment: readonly string[],
  environment: EnvironmentContext,
): string | null {
  const stripped = stripWrappers([...segment], environment);
  const tokens = stripped.slice(1);
  const index = safetyNetSubcommandIndex(getBasename(stripped[0] ?? '').toLowerCase(), tokens, {
    broad: true,
  });
  if (index === null) return null;
  const rest = tokens.slice(index).filter((token) => token !== '-g' && token !== '--global');
  return rest[0] === 'policy' && rest[1] === 'apply' ? stripped.join(' ') : null;
}
