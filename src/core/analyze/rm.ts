import {
  classifyRecursiveDeleteTarget,
  createRecursiveDeleteTargetContext,
  type RecursiveDeleteTargetClassification,
  type RecursiveDeleteTargetContext,
} from '@/core/analyze/recursive-delete-targets';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import { destructiveCommandMatch } from '@/core/destructive-command-rules';
import { ENV_FLAGS } from '@/core/env';
import type { DestructiveCommandRuleMatch } from '@/types';

const REASON_RM_RF =
  'rm -rf outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.';
const REASON_RM_RF_DYNAMIC_TARGET =
  'rm -rf target contains shell variables that cannot be verified safely. Use literal paths within cwd, /tmp, /var/tmp, or $TMPDIR.';
const REASON_RM_RF_ROOT_HOME =
  'rm -rf targeting root or home directory is extremely dangerous and always blocked.';
const REASON_RM_HOME_CWD =
  'rm -rf in home directory is dangerous. Change to a project directory first.';

export interface AnalyzeRmOptions {
  cwd?: string;
  originalCwd?: string;
  paranoid?: boolean;
  allowTmpdirVar?: boolean;
}

export function analyzeRm(tokens: string[], options: AnalyzeRmOptions = {}): string | null {
  return analyzeRmMatch(tokens, options)?.reason ?? null;
}

export function analyzeRmMatch(
  tokens: string[],
  options: AnalyzeRmOptions = {},
): DestructiveCommandRuleMatch | null {
  const ctx = createRecursiveDeleteTargetContext(options);

  if (!hasRecursiveForceFlags(tokens)) {
    return null;
  }

  const targets = extractTargets(tokens);

  for (const target of targets) {
    const classification = classifyRecursiveDeleteTarget(target, ctx);
    const reason = reasonForClassification(classification, ctx);
    if (reason) {
      return reason;
    }
  }

  return null;
}

function extractTargets(tokens: readonly string[]): string[] {
  const targets: string[] = [];
  let pastDoubleDash = false;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token === '--') {
      pastDoubleDash = true;
      continue;
    }

    if (pastDoubleDash) {
      targets.push(token);
      continue;
    }

    if (!token.startsWith('-')) {
      targets.push(token);
    }
  }

  return targets;
}

function reasonForClassification(
  classification: RecursiveDeleteTargetClassification,
  ctx: RecursiveDeleteTargetContext,
): DestructiveCommandRuleMatch | null {
  switch (classification.kind) {
    case 'root_or_home_target':
      return destructiveCommandMatch('rm.recursive-force-root-or-home', REASON_RM_RF_ROOT_HOME);
    case 'temp_target':
      return null;
    case 'dynamic_target':
      return destructiveCommandMatch(
        'rm.recursive-force-dynamic-target',
        REASON_RM_RF_DYNAMIC_TARGET,
      );
    case 'home_cwd_target':
      return destructiveCommandMatch('rm.recursive-force-home-cwd', REASON_RM_HOME_CWD);
    case 'cwd_self_target':
      return destructiveCommandMatch('rm.recursive-force-cwd-self', REASON_RM_RF);
    case 'within_anchored_cwd':
      if (ctx.paranoid) {
        return destructiveCommandMatch(
          'rm.recursive-force-paranoid',
          `${REASON_RM_RF} (${ENV_FLAGS.paranoidRm.name} enabled)`,
        );
      }
      return null;
    case 'outside_anchored_cwd':
      return destructiveCommandMatch('rm.recursive-force-outside-cwd', REASON_RM_RF);
  }
}
