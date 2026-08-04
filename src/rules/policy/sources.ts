import { RULE_SYNC_COMMAND } from './paths';
import {
  getRulebookSourceSyntaxError,
  isGitHubRepositorySource,
  isGitHubRulebookSource,
  NAME_PATTERN,
  parseGitHubSource,
} from './source-syntax';

/** @internal Compatibility re-exports for existing direct module consumers. */
export {
  assertBareRulebookName,
  GITHUB_RULEBOOK_PATH_RE,
  getRulebookSourceSyntaxError,
  isGitHubRepositorySource,
  isGitHubRulebookSource,
  type ParsedGitHubSource,
  parseGitHubSource,
} from './source-syntax';

import type { RulebookLockEntry, RulesConfig, RulesLockfile, SyncRulesConfigResult } from './types';

type RulebookMatchResult =
  | { ok: true; specs: string[] }
  | { ok: false; result: SyncRulesConfigResult };
type ConfiguredGitHubSource = { owner: string; repo: string; ref: string };

const GITHUB_REPOSITORY_REF_SOURCE_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#([A-Za-z0-9._-]+)$/;

export function getRulebookLockEntrySourceIdentityError(entry: RulebookLockEntry): string | null {
  if (isGitHubRulebookSource(entry.spec)) {
    return getGitHubLockEntrySourceIdentityError(entry);
  }
  return getLocalLockEntrySourceIdentityError(entry);
}

function getLocalLockEntrySourceIdentityError(entry: RulebookLockEntry): string | null {
  if (!NAME_PATTERN.test(entry.spec)) {
    return `Local rulebook sources must be bare names matching ${NAME_PATTERN}: ${entry.spec}`;
  }
  if (entry.kind !== 'local-directory') {
    return `lock entry for ${entry.spec} must use local-directory kind`;
  }
  if (entry.path === entry.spec && entry.name === entry.spec) {
    return null;
  }
  return `lock entry for ${entry.spec} does not match local source identity`;
}

function getGitHubLockEntrySourceIdentityError(entry: RulebookLockEntry): string | null {
  const syntaxError = getRulebookSourceSyntaxError(entry.spec);
  if (syntaxError) return syntaxError;
  const parsed = parseGitHubSource(entry.spec);
  if (entry.kind !== 'github') {
    return `lock entry for ${entry.spec} must use github kind`;
  }
  if (
    entry.owner === parsed.owner &&
    entry.repo === parsed.repo &&
    entry.ref === parsed.ref &&
    entry.path === parsed.path &&
    entry.name === parsed.name
  ) {
    return null;
  }
  return `lock entry for ${entry.spec} does not match GitHub source identity`;
}

export function getSelectedUpdateSpecs(
  config: RulesConfig,
  lock: RulesLockfile | null,
  match: string,
): RulebookMatchResult {
  const exactMatches = getExactSpecMatches(config.rules, match);
  if (exactMatches.length > 0) {
    return { ok: true, specs: exactMatches };
  }
  if (!lock) {
    return {
      ok: false,
      result: {
        ok: false,
        errors: [
          `No lockfile available to match rulebook name ${match}; use the exact source or run ${RULE_SYNC_COMMAND}`,
        ],
        warnings: [],
        entries: [],
      },
    };
  }
  const configuredSpecs = new Set(config.rules);
  const nameMatches = lock.rulebooks
    .filter((entry) => entry.name === match && configuredSpecs.has(entry.spec))
    .map((entry) => entry.spec);
  if (nameMatches.length === 1) {
    return { ok: true, specs: nameMatches };
  }
  return noRulebookMatch(match, nameMatches);
}

export function getRemoveMatches(
  rules: string[],
  lock: RulesLockfile | null,
  match: string,
): RulebookMatchResult {
  const exactMatches = getExactSpecMatches(rules, match);
  if (exactMatches.length > 0) return { ok: true, specs: exactMatches };

  const githubRefMatches = getGitHubRepositoryRefMatches(rules, match);
  if (githubRefMatches.length > 0) return { ok: true, specs: githubRefMatches };

  const githubRepositoryMatches = getGitHubRepositoryMatches(rules, match);
  if (!githubRepositoryMatches.ok) return githubRepositoryMatches;
  if (githubRepositoryMatches.specs.length > 0) {
    return { ok: true, specs: githubRepositoryMatches.specs };
  }

  const nameMatches = lock
    ? rules.filter((spec) => lock.rulebooks.find((entry) => entry.spec === spec)?.name === match)
    : [];
  if (nameMatches.length === 1) return { ok: true, specs: nameMatches };

  return noRulebookMatch(match, nameMatches);
}

function noRulebookMatch(
  match: string,
  nameMatches: string[],
): Extract<RulebookMatchResult, { ok: false }> {
  return {
    ok: false,
    result: {
      ok: false,
      errors:
        nameMatches.length === 0
          ? [`No configured rulebook matches ${match}`]
          : [`Ambiguous rulebook match ${match}: ${nameMatches.join(', ')}`],
      warnings: [],
      entries: [],
    },
  };
}

function getExactSpecMatches(rules: string[], match: string): string[] {
  return rules.filter((spec) => spec === match);
}

function getGitHubRepositoryRefMatches(rules: string[], match: string): string[] {
  const parsed = match.match(GITHUB_REPOSITORY_REF_SOURCE_RE);
  const owner = parsed?.[1];
  const repo = parsed?.[2];
  const ref = parsed?.[3];
  if (!owner || !repo || !ref) return [];
  return getConfiguredGitHubSourceMatches(rules, (source) => {
    return source.owner === owner && source.repo === repo && source.ref === ref;
  });
}

function getGitHubRepositoryMatches(rules: string[], match: string): RulebookMatchResult {
  if (!isGitHubRepositorySource(match)) return { ok: true, specs: [] };

  const [owner, repo] = match.split('/');
  const specs = getConfiguredGitHubSourceMatches(rules, (source) => {
    return source.owner === owner && source.repo === repo;
  });
  const refs = new Set(
    specs.map((spec) => getConfiguredGitHubSource(spec)?.ref).filter((ref): ref is string => !!ref),
  );
  if (refs.size < 2) return { ok: true, specs };

  return {
    ok: false,
    result: {
      ok: false,
      errors: [
        `Multiple refs are configured for ${match}. Use an explicit ref:`,
        `  cc-safety-net rule remove ${match}#<ref>`,
      ],
      warnings: [],
      entries: [],
    },
  };
}

function getConfiguredGitHubSource(spec: string): ConfiguredGitHubSource | null {
  try {
    return parseGitHubSource(spec);
  } catch {
    return null;
  }
}

function getConfiguredGitHubSourceMatches(
  rules: string[],
  matches: (source: ConfiguredGitHubSource) => boolean,
): string[] {
  return rules.filter((spec) => {
    const source = getConfiguredGitHubSource(spec);
    return source ? matches(source) : false;
  });
}
