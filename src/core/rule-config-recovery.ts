import { createPathCanonicalizationBudget } from '@/core/path-canonicalization';
import { normalizeProtectedPathCandidate } from '@/core/protected-path-scanner';
import type { SemanticFacts } from '@/domain/semantic-facts';

/**
 * Recovery plane for the blocked config state.
 *
 * A blocked snapshot names the config files whose in-band repair clears the
 * block. Only the file tools that target one of those exact paths are admitted:
 * every other non-command call stays denied, and the command route is untouched,
 * so shell edit forms of the same file (`sed -i`, `jq > tmp && mv`) keep being
 * denied alongside every other command but the exact `rule sync` repair forms.
 *
 * @internal
 */
export function isRuleConfigRepairInvocation(
  facts: SemanticFacts,
  repairTargets: readonly string[],
): boolean {
  const route = facts.invocation.route.kind;
  if (route !== 'path' && route !== 'patch') return false;
  if (repairTargets.length === 0 || facts.paths.length === 0) return false;
  const budget = createPathCanonicalizationBudget();
  const identify = (target: string) =>
    comparePath(
      normalizeProtectedPathCandidate(target, facts.invocation.context.executionCwd, budget),
    );
  const targets = new Set(repairTargets.map(identify));
  // Every target must sit in the plane, so a patch that touches the offending
  // config plus an unrelated file cannot write the unrelated file while blocked.
  return facts.paths.every((path) => targets.has(identify(path.raw)));
}

function comparePath(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}
