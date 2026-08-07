import { formatSchemaIssues, getRulesLockfileSchema } from '@/policy/schema';
import {
  bindDelegatedPolicyFilesystemTarget,
  PolicyFilesystemError,
  type PolicyFilesystemTarget,
  readPolicyFile,
} from './filesystem';
import { getRulebookLockEntrySourceIdentityError } from './sources';
import type { RulebookLockEntry, RulesLockfile } from './types';

export function readLockfile(path: string | PolicyFilesystemTarget): {
  lock: RulesLockfile | null;
  errors: string[];
} {
  const displayPath = typeof path === 'string' ? path : path.path;
  try {
    const content = readPolicyFile(
      typeof path === 'string' ? bindDelegatedPolicyFilesystemTarget(path) : path,
    );
    if (content === null) return { lock: null, errors: [] };
    const document = JSON.parse(content) as unknown;
    if (!document || typeof document !== 'object') {
      return { lock: null, errors: [`malformed lockfile ${displayPath}: must be an object`] };
    }
    const lock = document as Record<string, unknown>;
    if (lock.version !== 1 || !Array.isArray(lock.rulebooks)) {
      return { lock: null, errors: [`malformed lockfile ${displayPath}`] };
    }
    const parsed = getRulesLockfileSchema().safeParse(lock);
    // Each entry reports independently: its own schema errors, or — when it has none —
    // its source identity error, so one bad entry never hides another's diagnostics.
    const entryErrors = lock.rulebooks.flatMap((entry, index) => {
      const issues = parsed.success
        ? []
        : parsed.error.issues.filter((issue) => issue.path[1] === index);
      if (issues.length > 0) {
        return formatSchemaIssues(issues).map((error) => `${displayPath}: ${error}`);
      }
      // An entry the schema left unflagged is a lock entry, even when a sibling failed.
      const identityError = getRulebookLockEntrySourceIdentityError(entry as RulebookLockEntry);
      return identityError ? [`${displayPath}: rulebooks[${index}]: ${identityError}`] : [];
    });
    if (!parsed.success || entryErrors.length > 0) {
      return { lock: null, errors: [`malformed lockfile ${displayPath}`, ...entryErrors] };
    }
    // Keys are written in the order the resolver builds them, so re-reading and
    // rewriting an untouched entry leaves the lockfile byte-identical.
    const rulebooks = parsed.data.rulebooks.map((entry) => {
      if (entry.kind === 'local-directory') {
        return {
          spec: entry.spec,
          kind: entry.kind,
          path: entry.path,
          name: entry.name,
          version: entry.version,
          digest: entry.digest,
        };
      }
      const github = {
        spec: entry.spec,
        kind: entry.kind,
        owner: entry.owner,
        repo: entry.repo,
        ref: entry.ref,
        commit: entry.commit,
        path: entry.path,
        name: entry.name,
        version: entry.version,
        digest: entry.digest,
      };
      return typeof entry.display_ref === 'string' && entry.display_ref !== ''
        ? { ...github, display_ref: entry.display_ref }
        : github;
    });
    return { lock: { version: 1, rulebooks }, errors: [] };
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      return { lock: null, errors: [error.message] };
    }
    return {
      lock: null,
      errors: ['malformed lockfile'],
    };
  }
}
