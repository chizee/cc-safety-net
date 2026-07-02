import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPolicyGuiServer, runGuiCommand } from '@/bin/gui';

interface PolicyApiResponse {
  exists: boolean;
  raw: string;
  errors: string[];
  policy: {
    version: number;
  };
  builtins: unknown[];
  secretPatterns: unknown[];
}

interface WriteApiResponse {
  errors: string[];
}

describe('policy GUI server', () => {
  let tempDir: string;
  let safetyNetHome: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safety-net-gui-'));
    safetyNetHome = join(tempDir, '.cc-safety-net');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('binds localhost and rejects missing or wrong tokens', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      expect(server.url.startsWith('http://127.0.0.1:')).toBe(true);
      expect(server.url).toContain(`token=${server.token}`);

      expect((await fetch(`${server.origin}/api/policy`)).status).toBe(403);
      expect((await fetch(`${server.origin}/api/policy?token=wrong`)).status).toBe(403);
      expect((await fetch(`${server.origin}/favicon.ico`)).status).toBe(204);
      expect((await fetch(server.url)).headers.get('cache-control')).toBe('no-store');
    } finally {
      await server.close();
    }
  });

  test('GET root serves the GUI document with bundled custom CSS and token bootstrap', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      const response = await fetch(server.url);
      const html = await response.text();

      expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(html).toContain('<title>CC Safety Net Policy</title>');
      expect(html).toContain(`const token = ${JSON.stringify(server.token)};`);
      expect(html).toContain('cc-safety-net-gui-custom-css');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Built-in Protections');
      expect(html).toContain('id="builtin-search"');
      expect(html).toContain('class="panel foldable"');
      expect(html).toContain('aria-controls="builtins-panel-content"');
      expect(html).toContain('id="builtins-panel-content"');
      expect(html).toContain('Active');
      expect(html).toContain('Disabled');
      expect(html).toContain('<dialog class="confirm-dialog" id="confirm-dialog"');
      expect(html).toContain('id="confirm-dialog-title"');
      expect(html).toContain('id="confirm-dialog-confirm"');
      expect(html).toContain('const confirmDialog =');
      expect(html).toContain('showModal()');
      expect(html).toContain("confirmLabel: 'Reset policy'");
      expect(html).not.toContain('Confirm reset');
      expect(html).toContain('Search secret patterns');
      expect(html).toContain('Default secret patterns');
      expect(html).toContain('aria-controls="secret-panel-content"');
      expect(html).toContain('id="secret-panel-content"');
      expect(html).toContain('One path per line');
      expect(html).not.toContain('Allow paths');
      expect(html).not.toContain('id="allow-paths"');
      expect(html).toContain('Raw JSON');
      expect(html).not.toContain(' · ${escapeHtml(rule.id)} · ');
    } finally {
      await server.close();
    }
  });

  test('GET api policy returns defaults for missing file and errors for invalid file', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      const missing = await getJson<PolicyApiResponse>(
        `${server.origin}/api/policy?token=${server.token}`,
      );
      expect(missing.exists).toBe(false);
      expect(missing.errors).toEqual([]);
      expect(missing.policy.version).toBe(1);
      expect(missing.builtins.length).toBeGreaterThan(0);
      expect(missing.secretPatterns.length).toBeGreaterThan(0);

      mkdirSync(safetyNetHome, { recursive: true });
      writeFileSync(join(safetyNetHome, 'policy.json'), '{bad json', 'utf-8');

      const invalid = await getJson<PolicyApiResponse>(
        `${server.origin}/api/policy?token=${server.token}`,
      );
      expect(invalid.exists).toBe(true);
      expect(invalid.raw).toBe('{bad json');
      expect(invalid.errors[0]).toContain('Invalid JSON');
    } finally {
      await server.close();
    }
  });

  test('POST api policy writes canonical JSON and reset writes defaults', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      const save = await postJson<WriteApiResponse>(
        `${server.origin}/api/policy?token=${server.token}`,
        server.token,
        {
          version: 1,
          modes: { paranoid_rm: true },
          builtins: { overrides: { 'git.reset-hard': 'off' } },
          secret_protection: {
            enabled: true,
            overrides: { 'secret.ext.pem': 'off' },
            deny_paths: [],
          },
        },
      );

      expect(save.errors).toEqual([]);
      expect(readFileSync(join(safetyNetHome, 'policy.json'), 'utf-8')).toContain(
        '"git.reset-hard": "off"',
      );

      const reset = await postJson<WriteApiResponse>(
        `${server.origin}/api/reset?token=${server.token}`,
        server.token,
        {},
      );
      expect(reset.errors).toEqual([]);
      const resetPolicy = JSON.parse(readFileSync(join(safetyNetHome, 'policy.json'), 'utf-8')) as {
        version: number;
        builtins: { overrides: Record<string, string> };
        secret_protection: { enabled: boolean; overrides: Record<string, string> };
      };
      expect(resetPolicy).toMatchObject({
        version: 1,
        builtins: { overrides: {} },
        secret_protection: { enabled: true, overrides: {} },
      });
    } finally {
      await server.close();
    }
  });

  test('invalid POST is rejected and leaves existing file unchanged', async () => {
    mkdirSync(safetyNetHome, { recursive: true });
    writeFileSync(join(safetyNetHome, 'policy.json'), '{"version":1}\n', 'utf-8');
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      const response = await fetch(`${server.origin}/api/policy?token=${server.token}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cc-safety-net-token': server.token,
        },
        body: JSON.stringify({ version: 1, extra: true }),
      });

      expect(response.status).toBe(400);
      const body = (await response.json()) as { errors: string[] };
      expect(body.errors).toContain('unknown field "extra"');
      expect(readFileSync(join(safetyNetHome, 'policy.json'), 'utf-8')).toBe('{"version":1}\n');
    } finally {
      await server.close();
    }
  });

  test('malformed POST JSON and unknown routes return errors', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      const malformed = await fetch(`${server.origin}/api/policy?token=${server.token}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cc-safety-net-token': server.token,
        },
        body: '{bad json',
      });
      expect(malformed.status).toBe(400);
      const malformedBody = (await malformed.json()) as { errors: string[] };
      expect(malformedBody.errors[0]).toContain('Invalid JSON');

      const missing = await fetch(`${server.origin}/missing?token=${server.token}`);
      expect(missing.status).toBe(404);
      expect((await missing.json()) as { error: string }).toEqual({ error: 'Not found' });
    } finally {
      await server.close();
    }
  });

  test('POST requires the header token as well as the URL token', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      const response = await fetch(`${server.origin}/api/reset?token=${server.token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

      expect(response.status).toBe(403);
      expect(existsSync(join(safetyNetHome, 'policy.json'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  test('runGuiCommand honors no-open and prints URL', async () => {
    let openedUrl: string | null = null;
    const output: string[] = [];
    const result = await runGuiCommand(['--no-open'], {
      userConfigDir: join(safetyNetHome, 'rules'),
      openBrowser: async (url) => {
        openedUrl = url;
      },
      keepAlive: false,
      log: (message) => output.push(message),
    });

    expect(result).toBe(0);
    expect(openedUrl).toBeNull();
    expect(output.join('\n')).toContain('http://127.0.0.1:');
  });

  test('runGuiCommand reports browser opener failures and keeps the URL visible', async () => {
    const gui = await runGuiForTest(safetyNetHome, {
      openBrowser: async () => {
        throw new Error('no browser');
      },
    });

    expect(gui.result).toBe(0);
    expect(gui.output).toContain('http://127.0.0.1:');
    expect(gui.errors).toContain('Failed to open browser: no browser');
    expect(gui.errors).toContain('Open this URL manually: http://127.0.0.1:');
  });

  test('runGuiCommand reports missing platform opener errors', async () => {
    const gui = await withPath(tempDir, () => runGuiForTest(safetyNetHome));

    expect(gui.result).toBe(0);
    expect(gui.output).toContain('http://127.0.0.1:');
    expect(gui.errors).toContain('Failed to open browser:');
    expect(gui.errors).toContain('Open this URL manually: http://127.0.0.1:');
  });

  test('runGuiCommand rejects unknown args and can stop on process signal', async () => {
    const errors: string[] = [];
    expect(
      await runGuiCommand(['--bad'], {
        error: (message) => errors.push(message),
      }),
    ).toBe(1);
    expect(errors.join('\n')).toContain('Usage: cc-safety-net gui [--no-open]');

    const output: string[] = [];
    const run = runGuiCommand(['--no-open'], {
      userConfigDir: join(safetyNetHome, 'rules'),
      log: (message) => output.push(message),
    });
    while (output.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    process.emit('SIGTERM', 'SIGTERM');

    expect(await run).toBe(0);
    expect(output.join('\n')).toContain('http://127.0.0.1:');
  });
});

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

async function postJson<T>(url: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cc-safety-net-token': token },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

async function runGuiForTest(
  safetyNetHome: string,
  options: Parameters<typeof runGuiCommand>[1] = {},
) {
  const output: string[] = [];
  const errors: string[] = [];
  return {
    result: await runGuiCommand([], {
      userConfigDir: join(safetyNetHome, 'rules'),
      ...options,
      keepAlive: false,
      log: (message) => output.push(message),
      error: (message) => errors.push(message),
    }),
    output: output.join('\n'),
    errors: errors.join('\n'),
  };
}

async function withPath<T>(pathValue: string, fn: () => Promise<T>): Promise<T> {
  const originalPath = process.env.PATH;
  const originalPathAlt = process.env.Path;
  process.env.PATH = pathValue;
  if (process.platform === 'win32') process.env.Path = pathValue;
  try {
    return await fn();
  } finally {
    restoreEnv('PATH', originalPath);
    restoreEnv('Path', originalPathAlt);
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
