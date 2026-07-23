import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import { getActivitySummary } from '@/bin/doctor/activity';
import { detectAllHooks } from '@/bin/doctor/hooks';
import { getSystemInfo, type VersionFetcher } from '@/bin/doctor/system-info';
import type { SystemInfo } from '@/bin/doctor/types';
import { type RunInstallCommandOptions, runInstallCommand } from '@/bin/hook/install';
import {
  INSTALL_TARGETS,
  type InstallAction,
  type InstallTarget,
} from '@/bin/hook/install/targets';
import {
  createPolicyPreview,
  DEFAULT_GUI_POLICY,
  DESTRUCTIVE_COMMAND_RULE_METADATA,
  previewUserPolicyForGui,
  readUserPolicyForGui,
  repairUserPolicyForGui,
  SECRET_PROTECTION_RULE_METADATA,
  writeUserPolicyFromGui,
} from '@/core/policy';
import type { RulesPolicyOptions } from '@/core/rules/policy/types';
import { getIntegrationDisplayName, installIntegrationMetadata } from '@/integrations/catalog';
import { getActivityFeed } from './activity';
import { renderPolicyGuiHtml } from './page';

const REPO = 'kenryu42/cc-safety-net';
const REPO_URL = `https://github.com/${REPO}`;
const STAR_TIMEOUT_MS = 10_000;
type StarCountFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** @internal */
export interface StarContext {
  starred: boolean | null;
  starCount: number | null;
  blockedTotal: number;
}

interface IntegrationsStatus {
  targets: {
    target: InstallTarget;
    label: string;
    version: string | null;
    configured: boolean;
  }[];
  system: { version: string; nodeVersion: string | null; platform: string };
}

/** @internal */
export interface PolicyGuiServer {
  origin: string;
  token: string;
  url: string;
  close: () => Promise<void>;
}

interface PolicyGuiServerOptions extends RulesPolicyOptions {
  starRepo?: () => Promise<{ ok: boolean }>;
  fetchStarContext?: () => Promise<StarContext>;
  fetchIntegrations?: () => Promise<IntegrationsStatus>;
  runIntegration?: (
    action: InstallAction,
    target: InstallTarget,
  ) => Promise<{ ok: boolean; output: string }>;
  activityLogsDir?: string;
  token?: string;
}

interface RunGuiCommandOptions extends RulesPolicyOptions {
  openBrowser?: (url: string) => Promise<void> | void;
  keepAlive?: boolean;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export async function runGuiCommand(
  args: readonly string[],
  options: RunGuiCommandOptions = {},
): Promise<number> {
  const flags = parseGuiArgs(args);
  const log = options.log ?? console.log;
  const error = options.error ?? console.error;
  if (!flags) {
    error('Usage: cc-safety-net gui [--no-open]');
    return 1;
  }

  const server = await createPolicyGuiServer(options);
  log(`CC Safety Net policy GUI: ${server.url}`);

  if (!flags.noOpen) {
    try {
      await (options.openBrowser ?? openBrowser)(server.url);
    } catch (openError) {
      error(
        `Failed to open browser: ${openError instanceof Error ? openError.message : String(openError)}`,
      );
      error(`Open this URL manually: ${server.url}`);
    }
  }

  if (options.keepAlive === false) {
    await server.close();
    return 0;
  }

  await waitForShutdown(server);
  return 0;
}

/** @internal */
export async function createPolicyGuiServer(
  options: PolicyGuiServerOptions = {},
): Promise<PolicyGuiServer> {
  const token = options.token ?? randomBytes(24).toString('base64url');
  const server = createServer((request, response) => {
    void handleRequest(request, response, token, options);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    token,
    url: `${origin}/?token=${encodeURIComponent(token)}`,
    close: () => closeServer(server),
  };
}

function parseGuiArgs(args: readonly string[]): { noOpen: boolean } | null {
  if (args.some((arg) => arg !== '--no-open')) return null;
  return { noOpen: args.includes('--no-open') };
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  options: PolicyGuiServerOptions,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/favicon.ico') {
    response.writeHead(204, { 'cache-control': 'no-store' });
    response.end();
    return;
  }

  if (!requestHasValidToken(request, url, token)) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/') {
    sendHtml(response, renderPolicyGuiHtml(token));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/policy') {
    const result = readUserPolicyForGui(options);
    sendJson(response, 200, {
      ...result,
      destructiveCommandRules: DESTRUCTIVE_COMMAND_RULE_METADATA,
      secretPatterns: SECRET_PROTECTION_RULE_METADATA,
      preview: result.errors.length > 0 ? null : createPolicyPreview(result.policy),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/policy/preview') {
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendJson(response, 400, { errors: [body.error] });
      return;
    }
    const result = previewUserPolicyForGui(body.value);
    sendJson(response, result.errors.length > 0 ? 400 : 200, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/policy') {
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendJson(response, 400, { errors: [body.error] });
      return;
    }
    const result = writeUserPolicyFromGui(body.value, options);
    sendJson(response, result.errors.length > 0 ? 400 : 200, result);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/reset') {
    sendJson(response, 200, writeUserPolicyFromGui(DEFAULT_GUI_POLICY, options));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/repair') {
    sendJson(response, 200, repairUserPolicyForGui(options));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/activity') {
    const days = parseActivityDays(url.searchParams.get('days'));
    if (days === null) {
      sendJson(response, 400, { error: 'days must be an integer between 1 and 3650' });
      return;
    }
    sendJson(response, 200, getActivityFeed(days, options.activityLogsDir));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/star/context') {
    sendJson(
      response,
      200,
      await (
        options.fetchStarContext ?? (() => fetchStarContext({ logsDir: options.activityLogsDir }))
      )(),
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/star') {
    const result = await (options.starRepo ?? starRepo)();
    sendJson(response, 200, result.ok ? { ok: true } : { ok: false, fallbackUrl: REPO_URL });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations') {
    sendJson(response, 200, await (options.fetchIntegrations ?? fetchIntegrations)());
    return;
  }

  if (
    request.method === 'POST' &&
    (url.pathname === '/api/install' || url.pathname === '/api/uninstall')
  ) {
    const body = await readJsonBody(request);
    if (!body.ok) {
      sendJson(response, 400, { errors: [body.error] });
      return;
    }
    const target = (body.value as { target?: unknown } | null)?.target;
    if (typeof target !== 'string' || !INSTALL_TARGETS.some((entry) => entry.target === target)) {
      sendJson(response, 400, { error: 'unknown target' });
      return;
    }
    const action = url.pathname === '/api/install' ? 'install' : 'uninstall';
    sendJson(
      response,
      200,
      await (options.runIntegration ?? runIntegration)(action, target as InstallTarget),
    );
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

function parseActivityDays(raw: string | null): number | null {
  if (raw === null) return 7;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
  return days;
}

function requestHasValidToken(request: IncomingMessage, url: URL, token: string): boolean {
  if (url.searchParams.get('token') !== token) return false;
  if (request.method !== 'POST') return true;
  return request.headers['x-cc-safety-net-token'] === token;
}

async function readJsonBody(
  request: IncomingMessage,
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') };
  } catch (error) {
    return {
      ok: false,
      error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(html);
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function waitForShutdown(server: PolicyGuiServer): Promise<void> {
  return new Promise((resolve) => {
    const cleanup = () => {
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
    };
    const shutdown = () => {
      cleanup();
      void server.close().then(resolve);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

function openBrowser(url: string): Promise<void> {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    const handleError = (error: Error) => {
      child.off('spawn', handleSpawn);
      reject(error);
    };
    const handleSpawn = () => {
      child.off('error', handleError);
      child.unref();
      resolve();
    };
    child.once('error', handleError);
    child.once('spawn', handleSpawn);
  });
}

/** @internal */
export async function starRepo(
  command = 'gh',
  timeoutMs = STAR_TIMEOUT_MS,
): Promise<{ ok: boolean }> {
  return {
    ok:
      (await runGhCommand(command, ['api', '-X', 'PUT', `/user/starred/${REPO}`], timeoutMs)) === 0,
  };
}

const VERSION_FIELDS = {
  'antigravity-cli': 'antigravityCliVersion',
  'claude-code': 'claudeCodeVersion',
  codex: 'codexCliVersion',
  'copilot-cli': 'copilotCliVersion',
  'gemini-cli': 'geminiCliVersion',
  'kimi-code': 'kimiCodeVersion',
  opencode: 'openCodeVersion',
  pi: 'piCliVersion',
} as const satisfies Record<InstallTarget, keyof SystemInfo>;

/** @internal */
export async function fetchIntegrations(
  probe: { fetcher?: VersionFetcher; homeDir?: string } = {},
): Promise<IntegrationsStatus> {
  const systemInfo = await getSystemInfo(probe.fetcher);
  const hookStatuses = detectAllHooks(process.cwd(), {
    homeDir: probe.homeDir,
    claudePluginListOutput: systemInfo.claudePluginListOutput,
    codexPluginListOutput: systemInfo.codexPluginListOutput,
    geminiExtensionsListOutput: systemInfo.geminiExtensionsListOutput,
    copilotCliVersion: systemInfo.copilotCliVersion,
    copilotPluginInstalled: systemInfo.copilotPluginInstalled,
    piSafetyNetProbe: systemInfo.piSafetyNetProbe,
  });
  return {
    targets: installIntegrationMetadata.map((meta) => ({
      target: meta.id,
      label: getIntegrationDisplayName(meta.id),
      version: systemInfo[VERSION_FIELDS[meta.id]],
      configured: hookStatuses.find((status) => status.platform === meta.id)?.configured ?? false,
    })),
    system: {
      version: systemInfo.version,
      nodeVersion: systemInfo.nodeVersion,
      platform: systemInfo.platform,
    },
  };
}

let integrationActionQueue: Promise<unknown> = Promise.resolve();

/** @internal */
export function runIntegration(
  action: InstallAction,
  target: InstallTarget,
  overrides: RunInstallCommandOptions = {},
): Promise<{ ok: boolean; output: string }> {
  const run = async () => {
    const lines: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...args: unknown[]) => lines.push(args.map(String).join(' '));
    console.error = console.log;
    try {
      const exitCode = await runInstallCommand(action, [], {
        selectTargets: async () => [target],
        output: new Writable({
          write(_chunk, _encoding, callback) {
            callback();
          },
        }) as unknown as NodeJS.WriteStream,
        ...overrides,
      });
      return { ok: exitCode === 0, output: lines.join('\n') };
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  };
  const result = integrationActionQueue.then(run);
  integrationActionQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** @internal */
export async function fetchStarContext(
  options: { command?: string; logsDir?: string; fetchRepo?: StarCountFetch } = {},
): Promise<StarContext> {
  const [starred, starCount, blockedTotal] = await Promise.all([
    userHasStarredRepo(options.command),
    fetchStarCount(options.fetchRepo),
    Promise.resolve(getActivitySummary(36_500, options.logsDir).totalBlocked),
  ]);
  return { starred, starCount, blockedTotal };
}

/** @internal */
export async function userHasStarredRepo(
  command = 'gh',
  timeoutMs = STAR_TIMEOUT_MS,
): Promise<boolean | null> {
  if ((await runGhCommand(command, ['auth', 'status'], timeoutMs)) !== 0) return null;
  const starredExitCode = await runGhCommand(command, ['api', `/user/starred/${REPO}`], timeoutMs);
  if (starredExitCode === 0) return true;
  if (starredExitCode === null) return null;
  return false;
}

function runGhCommand(
  command: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      windowsHide: true,
    });
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(code);
    };
    child.once('error', () => finish(null));
    child.once('close', finish);
    timeout = setTimeout(() => {
      child.kill();
      finish(null);
    }, timeoutMs);
  });
}

async function fetchStarCount(fetchRepo: StarCountFetch = fetch): Promise<number | null> {
  try {
    const response = await fetchRepo(`https://api.github.com/repos/${REPO}`, {
      headers: { accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(STAR_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { stargazers_count?: unknown };
    return typeof body.stargazers_count === 'number' ? body.stargazers_count : null;
  } catch {
    return null;
  }
}
