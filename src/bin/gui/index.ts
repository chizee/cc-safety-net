import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ENV_FLAGS, envTruthy } from '@/core/env';
import {
  DEFAULT_GUI_POLICY,
  DESTRUCTIVE_COMMAND_RULE_METADATA,
  readUserPolicyForGui,
  repairUserPolicyForGui,
  SECRET_PROTECTION_RULE_METADATA,
  writeUserPolicyFromGui,
} from '@/core/policy';
import type { RulesPolicyOptions } from '@/core/rules/policy/types';
import { renderPolicyGuiHtml } from './page';

/** @internal */
export interface PolicyGuiServer {
  origin: string;
  token: string;
  url: string;
  close: () => Promise<void>;
}

interface PolicyGuiServerOptions extends RulesPolicyOptions {
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
  options: RulesPolicyOptions,
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
    sendJson(response, 200, {
      ...readUserPolicyForGui(options),
      destructiveCommandRules: DESTRUCTIVE_COMMAND_RULE_METADATA,
      secretPatterns: SECRET_PROTECTION_RULE_METADATA,
      environmentOverrides: getActiveEnvironmentOverrides(),
    });
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

  sendJson(response, 404, { error: 'Not found' });
}

function getActiveEnvironmentOverrides(): string[] {
  return [
    ENV_FLAGS.strict,
    ENV_FLAGS.paranoid,
    ENV_FLAGS.paranoidRm,
    ENV_FLAGS.paranoidInterpreters,
  ].flatMap((flag) => (envTruthy(flag) ? [flag.name] : []));
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
