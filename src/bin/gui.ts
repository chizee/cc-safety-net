import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  BUILTIN_RULE_METADATA,
  DEFAULT_GUI_POLICY,
  readUserPolicyForGui,
  writeUserPolicyFromGui,
} from '@/core/policy';
import type { RulesPolicyOptions } from '@/core/rules/policy/types';

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
      builtins: BUILTIN_RULE_METADATA,
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

  sendJson(response, 404, { error: 'Not found' });
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

function renderPolicyGuiHtml(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CC Safety Net Policy</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { max-width: 1040px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 28px 0 12px; }
    .muted { color: color-mix(in srgb, CanvasText 66%, Canvas); font-size: 13px; }
    .top { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
    button { border: 1px solid color-mix(in srgb, CanvasText 18%, Canvas); border-radius: 6px; padding: 8px 12px; background: ButtonFace; color: ButtonText; cursor: pointer; }
    button.primary { background: #14532d; color: #fff; border-color: #14532d; }
    button.danger { background: #7f1d1d; color: #fff; border-color: #7f1d1d; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .panel { border-top: 1px solid color-mix(in srgb, CanvasText 14%, Canvas); padding-top: 12px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
    label.row { display: flex; gap: 10px; align-items: flex-start; padding: 10px; border: 1px solid color-mix(in srgb, CanvasText 12%, Canvas); border-radius: 6px; }
    label.row span { display: block; }
    label.row small { display: block; color: color-mix(in srgb, CanvasText 62%, Canvas); margin-top: 3px; line-height: 1.35; }
    textarea { width: 100%; min-height: 92px; box-sizing: border-box; font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; border-radius: 6px; padding: 10px; }
    .status { margin-top: 14px; white-space: pre-wrap; font-size: 13px; }
    .error { color: #b91c1c; }
    .ok { color: #166534; }
  </style>
</head>
<body>
  <main>
    <div class="top">
      <div>
        <h1>CC Safety Net Policy</h1>
        <div class="muted" id="policy-path"></div>
      </div>
      <div class="actions">
        <button class="primary" id="save">Save</button>
        <button class="danger" id="reset">Reset</button>
      </div>
    </div>
    <div class="status" id="status"></div>
    <section class="panel"><h2>Modes</h2><div class="grid" id="modes"></div></section>
    <section class="panel"><h2>Built-in Rules</h2><div class="grid" id="builtins"></div></section>
    <section class="panel"><h2>Secret Protection</h2><div id="secret"></div></section>
    <section class="panel"><h2>Raw JSON Repair</h2><textarea id="raw"></textarea></section>
  </main>
  <script>
    const token = ${JSON.stringify(token)};
    const modeLabels = {
      strict: ['Strict', 'Fail closed on unparseable commands.'],
      paranoid: ['Paranoid', 'Enable all paranoid checks.'],
      paranoid_rm: ['Paranoid rm', 'Block non-temp rm -rf within cwd.'],
      paranoid_interpreters: ['Paranoid interpreters', 'Block interpreter one-liners.'],
      worktree_mode: ['Worktree mode', 'Allow local git discards in linked worktrees.']
    };
    let state;
    const api = (path, init = {}) => fetch(path + '?token=' + encodeURIComponent(token), {
      ...init,
      headers: { 'content-type': 'application/json', 'x-cc-safety-net-token': token, ...(init.headers || {}) }
    });
    const qs = (id) => document.getElementById(id);
    const setStatus = (text, kind = '') => { qs('status').textContent = text; qs('status').className = 'status ' + kind; };
    const checkbox = (checked) => checked ? 'checked' : '';
    function render() {
      qs('policy-path').textContent = state.path + (state.exists ? '' : ' (not created yet)');
      qs('raw').value = state.errors.length ? state.raw : '';
      qs('modes').innerHTML = Object.entries(modeLabels).map(([key, meta]) =>
        '<label class="row"><input type="checkbox" data-mode="' + key + '" ' + checkbox(state.policy.modes[key]) + '><span><strong>' + meta[0] + '</strong><small>' + meta[1] + '</small></span></label>'
      ).join('');
      qs('builtins').innerHTML = state.builtins.map((rule) =>
        '<label class="row"><input type="checkbox" data-builtin="' + rule.id + '" ' + checkbox(state.policy.builtins.overrides[rule.id] === 'off') + '><span><strong>' + rule.label + '</strong><small>' + rule.id + ' · ' + rule.description + '</small></span></label>'
      ).join('');
      qs('secret').innerHTML =
        '<label class="row"><input type="checkbox" id="secret-enabled" ' + checkbox(state.policy.secret_protection.enabled) + '><span><strong>Enable secret protection</strong><small>Use policy settings without requiring the environment flag.</small></span></label>' +
        '<h2>Allow paths</h2><textarea id="allow-paths">' + state.policy.secret_protection.allow_paths.join('\\n') + '</textarea>' +
        '<h2>Deny paths</h2><textarea id="deny-paths">' + state.policy.secret_protection.deny_paths.join('\\n') + '</textarea>';
      setStatus(state.errors.length ? state.errors.join('\\n') : 'Loaded.', state.errors.length ? 'error' : 'ok');
    }
    function collectPolicy() {
      const raw = qs('raw').value.trim();
      if (raw) {
        try { return JSON.parse(raw); } catch {}
      }
      const overrides = {};
      document.querySelectorAll('[data-builtin]').forEach((input) => { if (input.checked) overrides[input.dataset.builtin] = 'off'; });
      const modes = {};
      document.querySelectorAll('[data-mode]').forEach((input) => { modes[input.dataset.mode] = input.checked; });
      return {
        version: 1,
        modes,
        builtins: { overrides },
        secret_protection: {
          enabled: qs('secret-enabled').checked,
          allow_paths: qs('allow-paths').value.split('\\n').map((v) => v.trim()).filter(Boolean),
          deny_paths: qs('deny-paths').value.split('\\n').map((v) => v.trim()).filter(Boolean)
        }
      };
    }
    async function load() {
      state = await (await api('/api/policy')).json();
      render();
    }
    qs('save').onclick = async () => {
      const response = await api('/api/policy', { method: 'POST', body: JSON.stringify(collectPolicy()) });
      const result = await response.json();
      if (!response.ok) { setStatus(result.errors.join('\\n'), 'error'); return; }
      await load();
      setStatus('Saved.', 'ok');
    };
    qs('reset').onclick = async () => {
      await api('/api/reset', { method: 'POST', body: '{}' });
      await load();
      setStatus('Reset.', 'ok');
    };
    load().catch((error) => setStatus(String(error), 'error'));
  </script>
</body>
</html>`;
}
