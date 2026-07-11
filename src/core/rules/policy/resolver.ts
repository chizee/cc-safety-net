import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertValidRulebook, type Rulebook } from '@/core/rules/rulebook';
import { getRulebookCachePath, RULE_SYNC_COMMAND, RULEBOOK_FILE, RULES_DIR } from './paths';
import {
  assertBareRulebookName,
  GITHUB_RULEBOOK_PATH_RE,
  getRulebookLockEntrySourceIdentityError,
  isGitHubRulebookSource,
  parseGitHubSource,
} from './sources';
import type {
  GitHubRulebookLockEntry,
  RulebookLockEntry,
  RulesLockfile,
  RulesPolicyOptions,
  SyncRulesConfigOptions,
} from './types';

export interface ResolvedRulebook {
  entry: RulebookLockEntry;
  rulebook: Rulebook;
  content: string;
}

export interface DiscoveredRulebookSource {
  spec: string;
  display_ref?: string;
}

type GitHubResourceKind = 'metadata' | 'commit' | 'tree' | 'raw';

/** @internal Generous byte and time limits for untrusted GitHub rulebook responses. */
export const GITHUB_FETCH_LIMITS = Object.freeze({
  timeoutMs: 15_000,
  metadataBytes: 512 * 1024,
  commitBytes: 256 * 1024,
  treeBytes: 16 * 1024 * 1024,
  rawBytes: 4 * 1024 * 1024,
});

export async function resolveRulebookSource(
  spec: string,
  configDir: string,
  options: RulesPolicyOptions,
): Promise<ResolvedRulebook> {
  if (isGitHubRulebookSource(spec)) {
    return resolveGitHubRulebook(spec);
  }
  return resolveLocalRulebook(spec, configDir, options);
}

export async function resolveRulebookSourceForSync(
  spec: string,
  configDir: string,
  options: SyncRulesConfigOptions,
  previousLock: RulesLockfile | null,
): Promise<ResolvedRulebook> {
  if (!isGitHubRulebookSource(spec) || options.refresh) {
    return resolveRulebookSource(spec, configDir, options);
  }
  const locked = previousLock?.rulebooks.find((entry) => entry.spec === spec);
  if (!locked || locked.kind !== 'github') {
    return resolveRulebookSource(spec, configDir, options);
  }
  return readLockedGitHubRulebook(locked, configDir, options);
}

export async function discoverGitHubRepositoryRulebooks(
  source: string,
): Promise<DiscoveredRulebookSource[]> {
  const [owner, repo] = source.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository source: ${source}`);
  }
  const metadataResource = await fetchGitHubResource(
    `https://api.github.com/repos/${owner}/${repo}`,
    'metadata',
  );
  const metadataResponse = metadataResource.response;
  if (!metadataResponse.ok) {
    throw new Error(`Failed to inspect ${source}: GitHub returned ${metadataResponse.status}`);
  }
  const metadata = JSON.parse(metadataResource.content) as {
    default_branch?: string;
  };
  if (!metadata.default_branch) {
    throw new Error(`Failed to inspect ${source}: missing default branch`);
  }
  const commit = await resolveGitHubCommit(owner, repo, metadata.default_branch, source);
  const treeResource = await fetchGitHubResource(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${commit}?recursive=1`,
    'tree',
  );
  const treeResponse = treeResource.response;
  if (!treeResponse.ok) {
    throw new Error(`Failed to inspect ${source}: GitHub tree returned ${treeResponse.status}`);
  }
  const treeJson = JSON.parse(treeResource.content) as {
    tree?: Array<{ path?: string; type?: string }>;
  };
  const names = (treeJson.tree ?? [])
    .flatMap((entry) => {
      if (entry.type !== 'blob' || typeof entry.path !== 'string') return [];
      const match = entry.path.match(GITHUB_RULEBOOK_PATH_RE);
      return match?.[1] ? [match[1]] : [];
    })
    .sort();
  if (names.length === 0) {
    throw new Error(`No rulebooks found in ${source} under ${RULES_DIR}/`);
  }
  return names.map((name) => ({
    spec: `${owner}/${repo}#${commit}/${name}`,
    display_ref: metadata.default_branch,
  }));
}

function resolveLocalRulebook(
  spec: string,
  configDir: string,
  _options: RulesPolicyOptions,
): ResolvedRulebook {
  assertBareRulebookName(spec);
  const path = getLocalRulebookPath(configDir, spec);
  if (!existsSync(path)) {
    throw new Error(`Rulebook source not found: ${spec}`);
  }
  const content = readFileSync(path, 'utf-8');
  const rulebook = assertValidRulebook(JSON.parse(content));
  if (rulebook.name !== spec) {
    throw new Error(`rulebook name "${rulebook.name}" must match local source "${spec}"`);
  }
  return {
    rulebook,
    content,
    entry: {
      spec,
      kind: 'local-directory',
      path: spec,
      name: rulebook.name,
      version: rulebook.version,
      digest: sha256Digest(content),
    },
  };
}

async function resolveGitHubRulebook(spec: string): Promise<ResolvedRulebook> {
  const parsed = parseGitHubSource(spec);
  const commit = await resolveGitHubCommit(parsed.owner, parsed.repo, parsed.ref, spec);
  const rawResource = await fetchGitHubResource(
    `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${commit}/${parsed.path}`,
    'raw',
  );
  const rawResponse = rawResource.response;
  if (!rawResponse.ok) {
    throw new Error(`Failed to fetch ${spec}: GitHub raw returned ${rawResponse.status}`);
  }
  const content = rawResource.content;
  const rulebook = assertValidRulebook(JSON.parse(content));
  if (rulebook.name !== parsed.name) {
    throw new Error(`rulebook name "${rulebook.name}" must match GitHub source "${parsed.name}"`);
  }
  return {
    rulebook,
    content,
    entry: {
      spec,
      kind: 'github',
      owner: parsed.owner,
      repo: parsed.repo,
      ref: parsed.ref,
      commit,
      path: parsed.path,
      name: rulebook.name,
      version: rulebook.version,
      digest: sha256Digest(content),
    },
  };
}

async function readLockedGitHubRulebook(
  entry: GitHubRulebookLockEntry,
  configDir: string,
  options: RulesPolicyOptions,
): Promise<ResolvedRulebook> {
  const identityError = getRulebookLockEntrySourceIdentityError(entry);
  if (identityError) {
    throw new Error(`${identityError}; run ${RULE_SYNC_COMMAND}`);
  }
  const cachePath = getRulebookCachePath(entry, { ...options, cacheConfigDir: configDir });
  if (existsSync(cachePath)) {
    const content = readFileSync(cachePath, 'utf-8');
    if (sha256Digest(content) === entry.digest) {
      return { entry, rulebook: assertRulebookMatchesLockEntry(content, entry), content };
    }
  }
  return fetchLockedGitHubRulebook(entry);
}

async function fetchLockedGitHubRulebook(
  entry: GitHubRulebookLockEntry,
): Promise<ResolvedRulebook> {
  const rawResource = await fetchGitHubResource(
    `https://raw.githubusercontent.com/${entry.owner}/${entry.repo}/${entry.commit}/${entry.path}`,
    'raw',
  );
  const rawResponse = rawResource.response;
  if (!rawResponse.ok) {
    throw new Error(`Failed to restore ${entry.spec}: GitHub raw returned ${rawResponse.status}`);
  }
  const content = rawResource.content;
  if (sha256Digest(content) !== entry.digest) {
    throw new Error(`locked GitHub digest mismatch for ${entry.spec}; run ${RULE_SYNC_COMMAND}`);
  }
  return { entry, rulebook: assertRulebookMatchesLockEntry(content, entry), content };
}

function assertRulebookMatchesLockEntry(content: string, entry: GitHubRulebookLockEntry): Rulebook {
  const rulebook = assertValidRulebook(JSON.parse(content));
  if (rulebook.name !== entry.name) {
    throw new Error(`rulebook name "${rulebook.name}" must match lock entry "${entry.name}"`);
  }
  return rulebook;
}

async function resolveGitHubCommit(
  owner: string,
  repo: string,
  ref: string,
  source: string,
): Promise<string> {
  const commitResource = await fetchGitHubResource(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
    'commit',
  );
  const commitResponse = commitResource.response;
  if (!commitResponse.ok) {
    throw new Error(`Failed to resolve ${source}: GitHub returned ${commitResponse.status}`);
  }
  const commitJson = JSON.parse(commitResource.content) as {
    sha?: string;
  };
  if (!commitJson.sha) {
    throw new Error(`Failed to resolve commit for ${source}`);
  }
  return commitJson.sha;
}

/** @internal Fetches and consumes a bounded body under one mandatory timeout. */
export async function fetchGitHubResource(
  url: string,
  kind: GitHubResourceKind,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ response: Response; content: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? GITHUB_FETCH_LIMITS.timeoutMs,
  );
  try {
    const response = await (options.fetch ?? fetch)(url, { signal: controller.signal });
    if (!response.ok) {
      cancelGitHubResponseBody(response);
      return { response, content: '' };
    }
    return {
      response,
      content: await readGitHubResponseText(response, kind),
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('GitHub request timed out', { cause: error });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** @internal Reads a response body without trusting Content-Length or buffering past its cap. */
export async function readGitHubResponseText(
  response: Response,
  kind: GitHubResourceKind,
): Promise<string> {
  const limit = GITHUB_FETCH_LIMITS[`${kind}Bytes`];
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    cancelGitHubResponseBody(response);
    throw new Error(`GitHub ${kind} response exceeds ${limit} bytes`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > limit) {
      cancelGitHubResponseReader(reader);
      throw new Error(`GitHub ${kind} response exceeds ${limit} bytes`);
    }
    chunks.push(Buffer.from(chunk.value));
  }
  return Buffer.concat(chunks, bytes).toString('utf-8');
}

function cancelGitHubResponseBody(response: Response): void {
  if (!response.body) return;
  safelyCancelGitHubResponse(() => response.body?.cancel());
}

function cancelGitHubResponseReader(reader: { cancel(): Promise<void> }): void {
  safelyCancelGitHubResponse(() => reader.cancel());
}

function safelyCancelGitHubResponse(cancel: () => unknown): void {
  try {
    Promise.resolve(cancel()).catch(() => {});
  } catch {}
}

function getLocalRulebookPath(configDir: string, name: string): string {
  return join(configDir, name, RULEBOOK_FILE);
}

export function sha256Digest(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
