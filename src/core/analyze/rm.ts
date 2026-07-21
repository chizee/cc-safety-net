import {
  classifyRecursiveDeleteTarget,
  createRecursiveDeleteTargetContext,
  type RecursiveDeleteTargetClassification,
  type RecursiveDeleteTargetClassificationOptions,
  type RecursiveDeleteTargetContext,
  type RecursiveDeleteTargetOptions,
} from '@/core/analyze/recursive-delete-targets';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import {
  destructiveCommandMatch,
  destructiveCommandRuleIsEnabled,
  filterDestructiveCommandMatch,
} from '@/core/destructive-command-rules';
import type { EffectivePolicy } from '@/domain/policy';
import type { DestructiveCommandRuleMatch } from '@/types';

const REASON_RM_RF =
  'rm -rf outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.';
const REASON_RM_RF_POLICY =
  'rm -rf for non-temporary paths is blocked by the active safety policy. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.';
const REASON_RM_RF_DYNAMIC_TARGET =
  'rm -rf target contains shell variables that cannot be verified safely. Use literal paths within cwd, /tmp, /var/tmp, or $TMPDIR.';
const REASON_RM_RF_ROOT_HOME =
  'rm -rf targeting root or home directory is extremely dangerous and always blocked.';
const REASON_RM_HOME_CWD =
  'rm -rf in home directory is dangerous. Change to a project directory first.';

export interface AnalyzeRmOptions extends RecursiveDeleteTargetOptions {
  literalTargetTokenIndexes?: ReadonlySet<number>;
  tmpdirWordSplittingProtectedTargetTokenIndexes?: ReadonlySet<number>;
  expandedTargetTokens?: ReadonlyMap<number, readonly string[]>;
  unsafeBraceExpansionTargetTokenIndexes?: ReadonlySet<number>;
  policy?: Pick<
    EffectivePolicy,
    'destructiveCommandProtectionEnabled' | 'destructiveCommandRuleOverrides'
  > &
    Partial<Pick<EffectivePolicy, 'destructiveCommandAllowPaths'>>;
}

/** @internal */
export function analyzeRm(tokens: string[], options: AnalyzeRmOptions = {}): string | null {
  return analyzeRmMatch(tokens, options)?.reason ?? null;
}

export function analyzeRmMatch(
  tokens: string[],
  options: AnalyzeRmOptions = {},
): DestructiveCommandRuleMatch | null {
  const ctx = createRecursiveDeleteTargetContext({
    ...options,
    allowPaths: options.policy?.destructiveCommandAllowPaths,
    posixShell: true,
  });

  if (!hasRecursiveForceFlags(tokens)) {
    return null;
  }

  const targets = extractTargets(tokens);

  for (const target of targets) {
    if (options.unsafeBraceExpansionTargetTokenIndexes?.has(target.index)) {
      const match = filterDestructiveCommandMatch(
        reasonForClassification({ kind: 'outside_anchored_cwd' }, ctx, options.policy),
        options.policy,
      );
      if (match) return match;
      continue;
    }

    const expandedTargets = options.expandedTargetTokens?.get(target.index);
    for (const expandedTarget of expandedTargets ?? [target.text]) {
      const classificationOptions = {
        targetIsLiteral:
          expandedTargets !== undefined || options.literalTargetTokenIndexes?.has(target.index),
        tmpdirWordSplittingProtected: options.tmpdirWordSplittingProtectedTargetTokenIndexes?.has(
          target.index,
        ),
      };
      for (const classification of orderedTargetClassifications(
        expandedTarget,
        ctx,
        classificationOptions,
      )) {
        const candidate = reasonForClassification(classification, ctx, options.policy);
        const match = filterDestructiveCommandMatch(candidate, options.policy);
        if (match) return match;
      }
    }
  }

  return null;
}

function orderedTargetClassifications(
  target: string,
  ctx: RecursiveDeleteTargetContext,
  options: RecursiveDeleteTargetClassificationOptions,
): RecursiveDeleteTargetClassification[] {
  const primary = classifyRecursiveDeleteTarget(target, ctx, options);
  if (primary.kind === 'cwd_self_target') {
    return [primary, classifyRecursiveDeleteTarget(target, ctx, { ...options, skipCwdSelf: true })];
  }
  if (primary.kind !== 'home_cwd_target') return [primary];

  const targetSpecific = classifyRecursiveDeleteTarget(target, ctx, {
    ...options,
    skipHomeCwd: true,
  });
  if (targetSpecific.kind !== 'cwd_self_target') return [primary, targetSpecific];
  return [
    primary,
    targetSpecific,
    classifyRecursiveDeleteTarget(target, ctx, {
      ...options,
      skipHomeCwd: true,
      skipCwdSelf: true,
    }),
  ];
}

function extractTargets(tokens: readonly string[]): { text: string; index: number }[] {
  const targets: { text: string; index: number }[] = [];
  let pastDoubleDash = false;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token === '--') {
      pastDoubleDash = true;
      continue;
    }

    if (pastDoubleDash) {
      targets.push({ text: token, index: i });
      continue;
    }

    if (!token.startsWith('-')) {
      targets.push({ text: token, index: i });
    }
  }

  return targets;
}

function reasonForClassification(
  classification: RecursiveDeleteTargetClassification,
  ctx: RecursiveDeleteTargetContext,
  policy: AnalyzeRmOptions['policy'],
): DestructiveCommandRuleMatch | null {
  switch (classification.kind) {
    case 'root_or_home_target':
      return destructiveCommandMatch('rm.recursive-force-root-or-home', REASON_RM_RF_ROOT_HOME);
    case 'temp_target':
      return null;
    case 'dynamic_target':
      if (!destructiveCommandRuleIsEnabled(policy, 'rm.recursive-force-dynamic-target', ctx.strict))
        return null;
      return destructiveCommandMatch(
        'rm.recursive-force-dynamic-target',
        REASON_RM_RF_DYNAMIC_TARGET,
      );
    case 'home_cwd_target':
      return destructiveCommandMatch('rm.recursive-force-home-cwd', REASON_RM_HOME_CWD);
    case 'cwd_self_target':
      return destructiveCommandMatch('rm.recursive-force-cwd-self', REASON_RM_RF);
    case 'within_anchored_cwd':
      if (destructiveCommandRuleIsEnabled(policy, 'rm.recursive-force-paranoid', ctx.paranoid)) {
        return destructiveCommandMatch('rm.recursive-force-paranoid', REASON_RM_RF_POLICY);
      }
      return null;
    case 'outside_anchored_cwd':
      return destructiveCommandMatch('rm.recursive-force-outside-cwd', REASON_RM_RF);
  }
}
