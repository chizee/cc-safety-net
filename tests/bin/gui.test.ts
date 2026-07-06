import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPolicyGuiServer,
  fetchStarContext,
  runGuiCommand,
  starRepo,
  userHasStarredRepo,
} from '@/bin/gui';

interface PolicyApiResponse {
  exists: boolean;
  raw: string;
  errors: string[];
  policy: {
    version: number;
  };
  destructiveCommandRules: unknown[];
  secretPatterns: unknown[];
  environmentOverrides: string[];
}

interface WriteApiResponse {
  errors: string[];
}

interface StarContextApiResponse {
  starred: boolean | null;
  starCount: number | null;
  blockedTotal: number;
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
      expect(html).toContain('id="app-status"');
      expect(html.indexOf('id="reset"')).toBeLessThan(html.indexOf('id="app-status"'));
      expect(html).toContain('.app-status {\n  flex: 1 0 100%;');
      expect(html).toContain('Unsaved changes. Click Save to apply.');
      expect(html).toContain('No changes to save');
      expect(html).toContain('let dirty = false;');
      expect(html).toContain('const updateDirtyStatus = () => {');
      expect(html).toContain(
        'dirty = JSON.stringify(collectFormPolicy()) !== JSON.stringify(state.policy);',
      );
      expect(html).toContain(
        "setAppStatus(dirty ? 'Unsaved changes. Click Save to apply.' : 'Loaded', dirty ? 'dirty' : 'ok');",
      );
      expect(html).toContain("setAppStatus('Repair required', 'error');");
      expect(html).toContain("setAppStatus('Loaded', 'ok');");
      expect(html).toContain('setDetailStatus(');
      expect(html).toContain('Destructive Command Protection');
      expect(html).toContain('Destructive command protection');
      expect(html).toContain('Custom rules remain active when disabled.');
      expect(html).not.toContain('secret protection unchanged');
      expect(html).toContain('data-destructive-command-enabled');
      expect(html).toContain('id="policy-search"');
      expect(html).toContain('Search all protections');
      expect(html.indexOf('id="policy-search"')).toBeLessThan(html.indexOf('id="reset"'));
      expect(html).toContain('flex: 1 1 240px;');
      expect(html).toContain('max-width: none;');
      expect(html).toContain('.titlewrap {\n    flex: none;');
      expect(html).toContain('.appbar-search {\n    flex: none;');
      expect(html).not.toContain('id="destructive-command-search"');
      expect(html).not.toContain('id="secret-search"');
      expect(html).not.toContain('Search protections');
      expect(html).toContain('#destructive-command > label.row');
      expect(html).toContain('margin-bottom: 16px');
      expect(html).not.toContain(
        'label.row:has(input:checked) {\n  border-color: color-mix(in srgb, var(--accent)',
      );
      expect(html).toContain('class="panel foldable"');
      expect(html).toContain('aria-controls="destructive-command-panel-content"');
      expect(html).toContain(
        'aria-expanded="false" aria-controls="destructive-command-panel-content"',
      );
      expect(html).toContain('aria-controls="safety-overrides-content"');
      expect(html).toContain('id="safety-overrides-content" hidden');
      expect(html).toContain('<label class="row safety-override-row">');
      expect(html).toContain('label.row.safety-override-row {\n  display: grid;');
      expect(html).toContain('label.row.safety-override-row select {');
      expect(html).toContain('width: 100%;');
      expect(html).toContain('id="destructive-command-panel-content" hidden');
      expect(html).toContain('.panel-toggle {\n  display: inline-flex;');
      expect(html).toContain('font-size: inherit;\n  font-weight: inherit;');
      expect(html).toContain('Active');
      expect(html).toContain('Disabled');
      expect(html).not.toContain('Paused');
      expect(html).not.toContain('state-paused');
      expect(html).toContain('<dialog class="confirm-dialog" id="confirm-dialog"');
      expect(html).toContain('id="confirm-dialog-title"');
      expect(html).toContain('id="confirm-dialog-confirm"');
      expect(html).toContain('const confirmDialog =');
      expect(html).toContain('showModal()');
      expect(html).toContain("qs('confirm-dialog-detail').parentElement.hidden = !options.detail;");
      expect(html).toContain('const confirmProtectionDisable =');
      expect(html).toContain('Disable destructive command protection?');
      expect(html).toContain('Custom rules remain active.');
      expect(html).toContain('Protection disabled. Saved rule settings are preserved.');
      expect(html).toContain('Disable secret protection?');
      expect(html).toContain(
        'Default sensitive path patterns and deny paths will stop blocking access until you turn this back on.',
      );
      expect(html).not.toContain('Configured deny paths are part of Secret protection.');
      expect(html).toContain('input.checked = true;');
      expect(html).toContain("confirmLabel: 'Reset policy'");
      expect(html).not.toContain('Confirm reset');
      expect(html).not.toContain('Search secret patterns');
      expect(html).toContain('Default secret patterns');
      expect(html).toContain('Block default sensitive path patterns and configured deny paths.');
      expect(html).toContain('Exact normalized paths are blocked while Secret protection is on.');
      expect(html).not.toContain('Deny paths remain active');
      expect(html).not.toContain('Deny paths are always blocked');
      expect(html).not.toContain('trusted user policy');
      expect(html).toContain('disabled: !draftPolicy.secret_protection.enabled');
      expect(html).not.toContain("qs('deny-paths')");
      expect(html).not.toContain('One path per line');
      expect(html).toContain('id="deny-paths-input"');
      expect(html).toContain('id="deny-paths-add-button"');
      expect(html).toContain('id="deny-paths-list"');
      expect(html).toContain('id="deny-paths-hint"');
      expect(html).toContain('const renderDenyPaths = ');
      expect(html).toContain('const addDenyPaths = ');
      expect(html).toContain('data-deny-path-remove');
      expect(html).toContain('No deny paths configured.');
      expect(html).toContain('Deny paths (${');
      expect(html).toContain('Already listed:');
      expect(html).toContain('Remove deny path');
      expect(html).toContain('const denyPathIcons =');
      expect(html).toContain('aria-label="Add deny path"');
      expect(html).not.toContain('>Add</button>');
      expect(html).not.toContain('>Remove</button>');
      expect(html).toContain('event.clipboardData');
      expect(html).toContain('deny_paths: draftPolicy.secret_protection.deny_paths');
      expect(html).not.toContain('updateDraftSecretPaths');
      expect(html).not.toContain('textarea:disabled:hover');
      expect(html).toContain('cursor: not-allowed');
      expect(html).toContain("if (input.id === 'policy-search') {");
      expect(html).toContain('renderDestructiveCommands();');
      expect(html).toContain('renderSecretPatterns();');
      expect(html).toContain(
        '<strong>${escapeHtml(rule.label)}</strong>\n                  <code class="rule-id">${escapeHtml(rule.id)}</code>',
      );
      expect(html).not.toContain(
        '<strong>${escapeHtml(rule.label)}</strong> <code class="rule-id">${escapeHtml(rule.id)}</code>',
      );
      expect(html).toContain('label.row .rule-id {');
      expect(html).toContain('display: block;');
      expect(html).toContain(
        'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
      );
      expect(html).toContain('word-break: break-all;');
      expect(html).toContain('syncRawFromForm();');
      expect(html).toContain('aria-controls="secret-panel-content"');
      expect(html).toContain('aria-expanded="false" aria-controls="secret-panel-content"');
      expect(html).toContain('id="secret-panel-content" hidden');
      expect(html).not.toContain('Allow paths');
      expect(html).not.toContain('id="allow-paths"');
      expect(html).toContain('Raw JSON');
      expect(html).toContain(
        '<div class="panel-head raw-json-head">\n        <div class="panel-title">\n          <h2>Raw JSON</h2>',
      );
      expect(html).toContain('.raw-json-head {\n  flex-wrap: nowrap;');
      expect(html).toContain('.raw-json-head .panel-title {');
      expect(html).toContain('.raw-json-head #raw-copy {');
      expect(html).toContain('.raw-json-head {\n    flex-direction: row;');
      expect(html).toContain('id="raw-copy"');
      expect(html).toContain('aria-label="Copy raw JSON to clipboard"');
      expect(html).toContain('id="repair"');
      expect(html).toContain('>Repair</button>');
      expect(html).toContain('readonly></textarea>');
      expect(html).toContain('Read-only mirror of the controls.');
      expect(html).toContain('<div class="star-row" id="star-row" hidden>');
      expect(html).toContain('<span id="star-pitch-text"></span>');
      expect(html).toContain('<span class="star-mechanism" id="star-mechanism" hidden>');
      expect(html).toContain('One click via your GitHub CLI. No redirect.');
      expect(html).toContain('<span id="star-slot"></span>');
      expect(html.indexOf('id="star-row"')).toBeGreaterThan(html.indexOf('id="reset"'));
      expect(html.indexOf('id="star-row"')).toBeLessThan(html.indexOf('id="app-status"'));
      expect(html).toContain('<footer class="page-footer">');
      expect(html.indexOf('<footer class="page-footer">')).toBeGreaterThan(html.indexOf('</main>'));
      expect(html).toContain(
        '<a href="https://github.com/kenryu42/cc-safety-net" target="_blank" rel="noopener">GitHub</a>',
      );
      expect(html).toContain(
        '<a href="https://ccsafetynet.com/docs" target="_blank" rel="noopener">Documentation</a>',
      );
      expect(html).toContain('If CC Safety Net is useful to you, star it on GitHub.');
      expect(html).toContain('const starIcons =');
      expect(html).not.toContain('id="star-repo"');
      expect(html).not.toContain('starCtaDismissedKey');
      expect(html).toContain('const formatStarCount = (count) => {');
      expect(html).toContain(
        "if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\\.0$/, '')}k`;",
      );
      expect(html).toContain('const renderStarCta = (context) => {');
      expect(html).toContain('if (context.starred === true) {');
      expect(html).not.toContain('localStorage.getItem(starCtaDismissedKey)');
      expect(html).toContain(
        'aria-label="Star CC Safety Net on GitHub. One click via your GitHub CLI."',
      );
      expect(html).toContain(
        "CC Safety Net has blocked <strong>${escapeHtml(context.blockedTotal.toLocaleString('en-US'))}</strong> risky command${context.blockedTotal === 1 ? ",
      );
      expect(html).toContain("qs('star-mechanism').hidden = context.starred !== false;");
      expect(html).toContain('if (context.starred === null) {');
      expect(html).toContain('renderStarLink(context);');
      expect(html).toContain('const renderStarPitch = (context, starred = false) => {');
      expect(html).toContain('${evidence} If it saved your work, star it on GitHub.');
      expect(html).toContain('renderStarPitch(activeStarContext, true);');
      expect(html).toContain('target="_blank" rel="noopener"');
      expect(html).toContain('aria-label="Star CC Safety Net on GitHub (opens github.com)"');
      expect(html).not.toContain('aria-label="Hide star button"');
      expect(html).not.toContain('star-dismiss');
      expect(html).toContain(
        "const fallbackRepoUrl = 'https://github.com/kenryu42/cc-safety-net';",
      );
      expect(html).toContain("const result = await requestJson('/api/star', { method: 'POST' });");
      expect(html).toContain(
        "button.querySelector('.star-label').textContent = 'Starred. Thank you.';",
      );
      expect(html).toContain(
        'renderStarLink(activeStarContext, result.data?.fallbackUrl ?? fallbackRepoUrl);',
      );
      expect(html).not.toContain('window.location.href');
      expect(html).not.toContain('Could not star via GitHub CLI (gh missing or not authenticated)');
      expect(html).not.toContain('window.open(');
      expect(html).not.toContain("window.open('', '_blank')");
      expect(html).toContain("setAppStatus('Starred on GitHub', 'ok');");
      expect(html).toContain('.page-footer {');
      expect(html).toContain('.page-footer a {');
      expect(html).toContain('.star-row {');
      expect(html).toContain('.star-pitch {');
      expect(html).toContain('.star-mechanism {');
      expect(html).toContain('.star-cta {');
      expect(html).toContain('.star-icon {');
      expect(html).not.toContain('.star-copy {');
      expect(html).toContain('.star-count {');
      expect(html).not.toContain('.star-dismiss {');
      expect(html).toContain('border-color: var(--border-strong);');
      expect(html).not.toContain('background: var(--star-bg);');
      expect(html).not.toContain('border-color: var(--star-border);');
      expect(html).not.toContain('.star-cta {\n    align-self: center;');
      expect(html).toContain('.star-cta.starred:disabled {');
      expect(html).toContain('cursor: default;');
      expect(html).toContain('.star-row .star-cta,\n  .star-row #star-slot {');
      expect(html).toContain('#star-slot {');
      expect(html).toContain('white-space: nowrap;');
      expect(html).toContain('href="${escapeHtml(href)}"');
      expect(html).not.toContain('rawIsManual');
      expect(html).not.toContain("if (input.id === 'raw')");
      expect(html).not.toContain("JSON.parse(qs('raw')");
      expect(html).toContain('const rawCopyIcons =');
      expect(html).toContain("navigator.clipboard.writeText(qs('raw').value)");
      expect(html).toContain("qs('raw-copy').classList.toggle('copied', copied);");
      expect(html).toContain(
        'rawCopyResetTimer = setTimeout(() => setRawCopyCopied(false), 2000);',
      );
      expect(html).not.toContain(
        'button.icon-button.copied {\n  color: var(--ok-fg);\n  border-color',
      );
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
      expect(missing.destructiveCommandRules.length).toBeGreaterThan(0);
      expect(missing.secretPatterns.length).toBeGreaterThan(0);
      expect(missing.environmentOverrides).toEqual([]);

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
          safety: { level: 'standard', overrides: { paranoid_rm: true } },
          workflow: { worktree_mode: false },
          destructive_command_protection: {
            enabled: false,
            overrides: { 'git.reset-hard': 'off' },
          },
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
        destructive_command_protection: { enabled: boolean; overrides: Record<string, string> };
        secret_protection: { enabled: boolean; overrides: Record<string, string> };
      };
      expect(resetPolicy).toMatchObject({
        version: 1,
        destructive_command_protection: { enabled: true, overrides: {} },
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

  test('POST api repair preserves valid settings from parseable invalid policy', async () => {
    mkdirSync(safetyNetHome, { recursive: true });
    writeFileSync(
      join(safetyNetHome, 'policy.json'),
      JSON.stringify({
        version: 2,
        modes: { strict: true, paranoid: 'yes' },
        safety: { level: 'strict', overrides: { fail_closed: true } },
        workflow: { worktree_mode: true },
        destructive_command_protection: {
          enabled: false,
          overrides: { 'git.reset-hard': 'off', 'git.unknown': 'off' },
        },
        secret_protection: {
          enabled: 'no',
          overrides: { 'secret.ext.pem': 'off' },
          deny_paths: ['private/token.txt', 42],
        },
      }),
      'utf-8',
    );
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      const repairedPolicy = await repairPolicyViaApi(safetyNetHome, server);

      expect(repairedPolicy).toMatchObject({
        version: 1,
        safety: { level: 'strict', overrides: { fail_closed: true } },
        workflow: { worktree_mode: true },
        destructive_command_protection: {
          enabled: false,
          overrides: { 'git.reset-hard': 'off' },
        },
        secret_protection: {
          enabled: true,
          overrides: { 'secret.ext.pem': 'off' },
          deny_paths: ['private/token.txt'],
        },
      });
    } finally {
      await server.close();
    }
  });

  test('POST api repair restores defaults for malformed policy JSON', async () => {
    mkdirSync(safetyNetHome, { recursive: true });
    writeFileSync(join(safetyNetHome, 'policy.json'), '{bad json', 'utf-8');
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      const repairedPolicy = await repairPolicyViaApi(safetyNetHome, server);

      expect(repairedPolicy).toMatchObject({
        version: 1,
        destructive_command_protection: { enabled: true, overrides: {} },
        secret_protection: { enabled: true, overrides: {}, deny_paths: [] },
      });
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

  test('POST api star requires the header token as well as the URL token', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      expect((await fetch(`${server.origin}/api/star`)).status).toBe(403);
      expect((await fetch(`${server.origin}/api/star?token=wrong`)).status).toBe(403);
      expect(
        (
          await fetch(`${server.origin}/api/star?token=${server.token}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
        ).status,
      ).toBe(403);
    } finally {
      await server.close();
    }
  });

  test('POST api star returns success from injected star action', async () => {
    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      starRepo: async () => ({ ok: true }),
    });
    try {
      expect(
        await postJson<{ ok: boolean }>(
          `${server.origin}/api/star?token=${server.token}`,
          server.token,
          {},
        ),
      ).toEqual({ ok: true });
    } finally {
      await server.close();
    }
  });

  test('POST api star returns fallback URL when injected star action fails', async () => {
    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      starRepo: async () => ({ ok: false }),
    });
    try {
      expect(
        await postJson<{ fallbackUrl: string; ok: boolean }>(
          `${server.origin}/api/star?token=${server.token}`,
          server.token,
          {},
        ),
      ).toEqual({
        ok: false,
        fallbackUrl: 'https://github.com/kenryu42/cc-safety-net',
      });
    } finally {
      await server.close();
    }
  });

  test('GET api star context requires URL token and returns injected context', async () => {
    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      fetchStarContext: async () => ({ starred: false, starCount: 1234, blockedTotal: 14 }),
    });
    try {
      expect((await fetch(`${server.origin}/api/star/context`)).status).toBe(403);
      expect((await fetch(`${server.origin}/api/star/context?token=wrong`)).status).toBe(403);
      expect(
        await getJson<StarContextApiResponse>(
          `${server.origin}/api/star/context?token=${server.token}`,
        ),
      ).toEqual({ starred: false, starCount: 1234, blockedTotal: 14 });
    } finally {
      await server.close();
    }
  });

  test('star context reads all-time blocked activity and degrades failed fields independently', async () => {
    const logsDir = join(safetyNetHome, 'logs');
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(
      join(logsDir, 'session.jsonl'),
      [
        JSON.stringify({
          ts: new Date().toISOString(),
          decision: 'block',
          command: 'rm -rf .',
          reason: 'destructive',
        }),
        JSON.stringify({
          ts: new Date().toISOString(),
          decision: 'allow',
          command: 'git status',
          reason: 'safe',
        }),
        JSON.stringify({
          ts: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
          decision: 'block',
          command: 'git reset --hard',
          reason: 'destructive',
        }),
      ].join('\n'),
      'utf-8',
    );

    expect(
      await fetchStarContext({
        command: join(tempDir, 'missing-gh'),
        logsDir,
        fetchRepo: async () => {
          throw new Error('offline');
        },
      }),
    ).toEqual({ starred: null, starCount: null, blockedTotal: 2 });
  });

  test('userHasStarredRepo checks gh auth before starred state and maps exits', async () => {
    const localTempDir = mkdtempSync(join(process.cwd(), '.tmp-star-check-'));
    const binDir = join(localTempDir, 'bin');
    const ghPath = join(binDir, 'gh');
    const starLog = join(localTempDir, 'star-check-argv.txt');
    mkdirSync(binDir);
    writeFileSync(
      ghPath,
      [
        '#!/bin/sh',
        'printf "%s\\n" "$@" >> "$STAR_LOG"',
        'if [ "$1" = "auth" ] && [ "$2" = "status" ]; then exit "$AUTH_EXIT"; fi',
        'exit "$STAR_EXIT"',
        '',
      ].join('\n'),
      'utf-8',
    );
    chmodSync(ghPath, 0o755);

    const originalStarLog = process.env.STAR_LOG;
    const originalAuthExit = process.env.AUTH_EXIT;
    const originalStarExit = process.env.STAR_EXIT;
    process.env.STAR_LOG = starLog;
    try {
      process.env.AUTH_EXIT = '0';
      process.env.STAR_EXIT = '0';
      expect(await userHasStarredRepo(ghPath)).toBe(true);
      expect(readFileSync(starLog, 'utf-8')).toBe(
        'auth\nstatus\napi\n/user/starred/kenryu42/cc-safety-net\n',
      );

      writeFileSync(starLog, '', 'utf-8');
      process.env.STAR_EXIT = '1';
      expect(await userHasStarredRepo(ghPath)).toBe(false);
      expect(readFileSync(starLog, 'utf-8')).toBe(
        'auth\nstatus\napi\n/user/starred/kenryu42/cc-safety-net\n',
      );

      writeFileSync(starLog, '', 'utf-8');
      process.env.AUTH_EXIT = '1';
      process.env.STAR_EXIT = '0';
      expect(await userHasStarredRepo(ghPath)).toBeNull();
      expect(readFileSync(starLog, 'utf-8')).toBe('auth\nstatus\n');

      expect(await userHasStarredRepo(join(localTempDir, 'missing-gh'))).toBeNull();
    } finally {
      restoreEnv('STAR_LOG', originalStarLog);
      restoreEnv('AUTH_EXIT', originalAuthExit);
      restoreEnv('STAR_EXIT', originalStarExit);
      rmSync(localTempDir, { recursive: true, force: true });
    }
  });

  test('star helpers return fallback states on timeout', async () => {
    const localTempDir = mkdtempSync(join(process.cwd(), '.tmp-star-timeout-'));
    const ghPath = join(localTempDir, 'gh');
    writeFileSync(ghPath, '#!/bin/sh\n/bin/sleep 1\n', 'utf-8');
    chmodSync(ghPath, 0o755);

    try {
      expect(await starRepo(ghPath, 10)).toEqual({ ok: false });
      expect(await userHasStarredRepo(ghPath, 10)).toBeNull();
    } finally {
      rmSync(localTempDir, { recursive: true, force: true });
    }
  });

  test('starRepo uses gh CLI with fixed argv', async () => {
    const localTempDir = mkdtempSync(join(process.cwd(), '.tmp-star-'));
    const binDir = join(localTempDir, 'bin');
    const ghPath = join(binDir, 'gh');
    const starLog = join(localTempDir, 'star-argv.txt');
    mkdirSync(binDir);
    writeFileSync(
      ghPath,
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$STAR_LOG"\n/bin/sleep 0.1\nexit 0\n',
      'utf-8',
    );
    chmodSync(ghPath, 0o755);

    const originalStarLog = process.env.STAR_LOG;
    process.env.STAR_LOG = starLog;
    try {
      expect(await starRepo(ghPath)).toEqual({ ok: true });
      expect(readFileSync(starLog, 'utf-8')).toBe(
        'api\n-X\nPUT\n/user/starred/kenryu42/cc-safety-net\n',
      );
    } finally {
      restoreEnv('STAR_LOG', originalStarLog);
      rmSync(localTempDir, { recursive: true, force: true });
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

async function repairPolicyViaApi(
  safetyNetHome: string,
  server: Awaited<ReturnType<typeof createPolicyGuiServer>>,
): Promise<unknown> {
  const repair = await postJson<WriteApiResponse>(
    `${server.origin}/api/repair?token=${server.token}`,
    server.token,
    {},
  );
  expect(repair.errors).toEqual([]);
  return JSON.parse(readFileSync(join(safetyNetHome, 'policy.json'), 'utf-8')) as unknown;
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
