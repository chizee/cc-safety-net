const token = __CC_SAFETY_NET_TOKEN__;
const fallbackRepoUrl = 'https://github.com/kenryu42/cc-safety-net';
const safetyLevels = {
  standard: [
    'Standard',
    'Blocks recognizable destructive commands and sensitive content access while allowing metadata-only sensitive-path checks. Recommended for normal coding.',
  ],
  strict: [
    'Strict',
    'Standard, plus blocks dynamic or unparseable commands and metadata-only sensitive-path discovery. Occasional false positives on advanced shell.',
  ],
  paranoid: [
    'Paranoid',
    'Strict, plus blocks rm -rf inside your project and interpreter one-liners. Expect friction; for untrusted agents or high-stakes repos.',
  ],
};
const safetyOverrides = {
  fail_closed: ['Fail closed', 'Block commands the parser cannot fully understand.'],
  paranoid_rm: ['Paranoid rm -rf checks', 'Block non-temp rm -rf inside the project.'],
  paranoid_interpreters: ['Paranoid interpreters', 'Block interpreter one-liners.'],
};
const rawCopyIcons = {
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2"></path></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>',
};
const starIcons = {
  outline:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
  filled:
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"></path></svg>',
};
const pathListIcons = {
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  remove:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M10 11v6M14 11v6"></path></svg>',
};
let state;
let draftPolicy;
let preview;
let previewRequestId = 0;
let dirty = false;
let searchActive = false;
let activity = null;
const activityFilters = { days: 7, decision: 'all', agent: 'all', query: '' };
const tierExpanded = new Map([
  ['enforced', false],
  ['normal', false],
  ['strict', false],
  ['paranoid', false],
]);
const searchCollapsedTiers = new Set();
const secretGroupExpanded = new Map();
const searchCollapsedSecretGroups = new Set();
let rawCopyResetTimer = null;
let feedCopyResetTimer = null;
let renderedFeedEntries = [];
let activeStarContext = { starred: null, starCount: null, blockedTotal: 0 };
const api = (path, init = {}) =>
  fetch(`${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-cc-safety-net-token': token,
      ...(init.headers || {}),
    },
  });
const requestJson = async (path, init) => {
  try {
    const response = await api(path, init);
    const text = await response.text();
    return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : {} };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
};
const errorText = (result) =>
  result.error ??
  (Array.isArray(result.data?.errors) && result.data.errors.length
    ? result.data.errors.join('\n')
    : null) ??
  result.data?.error ??
  `Request failed (status ${result.status}).`;
const isWriteSuccess = (result) =>
  result.ok && !(Array.isArray(result.data?.errors) && result.data.errors.length > 0);
const isPolicyState = (value) =>
  !!value &&
  typeof value === 'object' &&
  !!value.policy &&
  typeof value.policy === 'object' &&
  !!value.policy.safety &&
  !!value.policy.workflow &&
  !!value.policy.secret_protection &&
  Array.isArray(value.destructiveCommandRules) &&
  Array.isArray(value.secretPatterns) &&
  (value.preview === null || (value.preview && typeof value.preview === 'object')) &&
  Array.isArray(value.errors);
const qs = (id) => document.getElementById(id);
const setDetailStatus = (text, kind = '') => {
  qs('status').textContent = text;
  qs('status').className = `status ${kind}`;
};
let appStatusTimer;
const setAppStatus = (text, kind = '') => {
  qs('app-status').textContent = text;
  qs('app-status').className = `app-status ${kind}`;
  clearTimeout(appStatusTimer);
  if (kind === 'ok') appStatusTimer = setTimeout(() => setAppStatus(''), 4000);
};
let busy = false;
const updateActions = () => {
  const hasErrors = (state?.errors.length ?? 0) > 0;
  qs('save').disabled = busy || !state || hasErrors;
  qs('reset').disabled = busy || !state;
  qs('repair').disabled = busy || !hasErrors;
};
const runExclusive = async (pendingText, fn) => {
  if (busy) return;
  busy = true;
  updateActions();
  setAppStatus(pendingText);
  setDetailStatus('');
  try {
    await fn();
  } finally {
    busy = false;
    updateActions();
  }
};
const checkbox = (checked) => (checked ? 'checked' : '');
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[char],
  );
const clonePolicy = (policy) => JSON.parse(JSON.stringify(policy));
const pathLines = (value) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
const formatPolicy = (policy) => `${JSON.stringify(policy, null, 2)}\n`;
const collectFormPolicy = () => ({
  version: 1,
  safety: {
    level: draftPolicy.safety.level,
    overrides: Object.fromEntries(
      Object.entries(draftPolicy.safety.overrides).filter(
        ([, value]) => typeof value === 'boolean',
      ),
    ),
  },
  workflow: draftPolicy.workflow,
  destructive_command_protection: draftPolicy.destructive_command_protection,
  secret_protection: {
    enabled: draftPolicy.secret_protection.enabled,
    overrides: draftPolicy.secret_protection.overrides,
    deny_paths: draftPolicy.secret_protection.deny_paths,
  },
});
const viewNames = ['overview', 'activity', 'policy', 'settings'];
const viewTitles = {
  overview: 'Overview',
  activity: 'Activity',
  policy: 'Policy',
  settings: 'Settings',
};
const currentView = () => {
  const hash = location.hash.replace('#', '');
  return viewNames.includes(hash) ? hash : 'overview';
};
const applyView = () => {
  const view = currentView();
  qs('topbar-title').textContent = viewTitles[view];
  document.title = `${viewTitles[view]} · CC Safety Net`;
  document.querySelectorAll('[data-view]').forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  qs('dirty-chip').hidden = !dirty || view === 'policy';
  if (view === 'activity') applyFeedClamps(qs('activity-feed'));
};
const relativeTime = (ts) => {
  const diff = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(diff)) return '';
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
};
const isActivityFeed = (value) =>
  !!value &&
  typeof value === 'object' &&
  Array.isArray(value.entries) &&
  !!value.counts &&
  typeof value.counts === 'object';
const agentLabels = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  copilot: 'Copilot',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  pi: 'Pi',
};
const feedItemHtml = (entry, index) => {
  const deny = entry.decision !== 'allow';
  const badgeClass = entry.failureStage ? 'error' : deny ? 'deny' : 'allow';
  const badgeLabel = entry.failureStage ? 'Error' : deny ? 'Blocked' : 'Allowed';
  return `<article class="feed-item">
    <div class="feed-meta">
      <span class="decision-badge ${badgeClass}">${badgeLabel}</span>
      ${entry.agent && entry.agent !== 'unknown' ? `<span class="agent-badge">${escapeHtml(agentLabels[entry.agent] ?? entry.agent)}</span>` : ''}
      ${entry.ruleId ? `<code class="rule-id">${escapeHtml(entry.ruleId)}</code>` : ''}
      <time datetime="${escapeHtml(entry.ts)}" title="${escapeHtml(entry.ts)}">${relativeTime(entry.ts)}</time>
      <button type="button" class="icon-button feed-copy" data-log-copy="${index}" aria-label="Copy log entry as JSON">${rawCopyIcons.copy}</button>
    </div>
    <code class="feed-command">${escapeHtml(entry.command || entry.segment || '(no command recorded)')}</code>
    ${entry.reason && entry.reason !== 'allowed' ? `<p class="feed-reason muted">${escapeHtml(entry.reason)}</p>` : ''}
  </article>`;
};
const applyFeedClamps = (root) => {
  root.querySelectorAll('.feed-command').forEach((command) => {
    if (command.classList.contains('clamped') || command.scrollHeight <= command.clientHeight + 1)
      return;
    command.classList.add('clamped');
    command.insertAdjacentHTML(
      'afterend',
      '<button type="button" class="feed-toggle" data-feed-toggle aria-expanded="false">Show more</button>',
    );
  });
};
const dayLabel = (ts) => {
  const date = new Date(ts);
  if (date.toDateString() === new Date().toDateString()) return 'Today';
  if (date.toDateString() === new Date(Date.now() - 86400000).toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const renderOverviewActivity = () => {
  const tile = (value, label, extra = '') =>
    `<div class="tile"><strong>${escapeHtml(value.toLocaleString('en-US'))}</strong><span>${escapeHtml(label)}</span>${extra}</div>`;
  const byDay = activity.counts.blockedByDay;
  const max = Math.max(...byDay, 1);
  const sparkline = `<div class="tile-spark" role="img" aria-label="Blocked commands per day, most recent ${byDay.length} days">${byDay.map((count) => `<div class="spark-bar" aria-hidden="true" style="height:${count === 0 ? 0 : Math.max(2, Math.round((count / max) * 28))}px"></div>`).join('')}</div>`;
  qs('overview-tiles').innerHTML = [
    tile(activity.counts.blocked, `Blocked · last ${activity.days} days`, sparkline),
    tile(activity.counts.sessions, `Sessions · last ${activity.days} days`),
    tile(activity.totalInWindow, `Commands reviewed · last ${activity.days} days`),
    tile(activity.totalBlockedAllTime, 'Blocked · all time'),
  ].join('');
};
const renderProtectionCard = () => {
  // Saved state only: state.policy/state.preview are server-confirmed; draftPolicy is not,
  // so unsaved toggles do not flip the posture card.
  if (!state || !state.preview) {
    qs('protection-card').hidden = true;
    return;
  }
  const policy = state.policy;
  const customized =
    state.preview.counts.effectiveCustomizations > 0 ||
    Object.entries(policy.safety.overrides).some(
      ([key, value]) => value !== levelCapabilities(policy.safety.level)[key],
    );
  const commandsOn = policy.destructive_command_protection.enabled;
  const secretsOn = policy.secret_protection.enabled;
  qs('protection-card').hidden = false;
  qs('protection-card').classList.toggle('protection-warning', !commandsOn || !secretsOn);
  qs('protection-card').innerHTML =
    `<div class="panel-head"><div class="panel-title"><h2>Protection status</h2></div><a class="panel-head-action view-all-link" href="#policy">Configure</a></div>` +
    `<p>${escapeHtml(safetyLevels[policy.safety.level][0])}${customized ? ' · Customized' : ''}</p>` +
    `<p${commandsOn ? '' : ' class="state-disabled"'}>${commandsOn ? `${state.preview.counts.enabled} rules active` : 'Destructive command protection is OFF'}</p>` +
    `<p${secretsOn ? '' : ' class="state-disabled"'}>${secretsOn ? 'Secret protection on' : 'Secret protection is OFF'}</p>`;
};
const renderTopRules = () => {
  const top = Object.entries(activity.counts.rules)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  qs('top-rules').innerHTML =
    top.length === 0
      ? '<p class="empty">No blocked commands in this window.</p>'
      : top
          .map(
            ([ruleId, count]) =>
              `<button type="button" class="top-rule" data-rule-id="${escapeHtml(ruleId)}"><code class="rule-id">${escapeHtml(ruleId)}</code><span class="chip-count">${count.toLocaleString('en-US')}</span></button>`,
          )
          .join('');
};
const renderGuardErrors = () => {
  qs('guard-errors').hidden = activity.counts.errors === 0;
  if (activity.counts.errors === 0) return;
  qs('guard-errors').textContent =
    `${activity.counts.errors.toLocaleString('en-US')} guard error${activity.counts.errors === 1 ? '' : 's'} in the last ${activity.days} days — commands blocked because evaluation failed, not by policy. View`;
};
const renderActivityControls = () => {
  const chipHtml = (kind, value, label, count) =>
    `<button type="button" class="chip" data-activity-chip="${kind}" data-chip-value="${escapeHtml(value)}" aria-pressed="${activityFilters[kind] === value}">${escapeHtml(label)}${count === undefined ? '' : ` <span class="chip-count">${count.toLocaleString('en-US')}</span>`}</button>`;
  qs('activity-decision').innerHTML = [
    chipHtml('decision', 'all', 'All', activity.totalInWindow),
    chipHtml('decision', 'deny', 'Blocked', activity.counts.blocked),
    chipHtml('decision', 'allow', 'Allowed', activity.counts.allowed),
    ...(activity.counts.errors > 0
      ? [chipHtml('decision', 'error', 'Errors', activity.counts.errors)]
      : []),
  ].join('');
  const agentNames = Object.keys(activity.counts.agents)
    .filter((name) => name !== 'unknown')
    .sort();
  qs('activity-agents').innerHTML =
    agentNames.length < 2
      ? ''
      : [
          chipHtml('agent', 'all', 'All agents'),
          ...agentNames.map((name) =>
            chipHtml('agent', name, agentLabels[name] ?? name, activity.counts.agents[name]),
          ),
        ].join('');
  qs('activity-days').value = String(activity.days);
};
const renderActivityFeed = () => {
  const matchesFilters = (entry) => {
    if (activityFilters.decision === 'deny' && entry.decision === 'allow') return false;
    if (activityFilters.decision === 'allow' && entry.decision !== 'allow') return false;
    if (activityFilters.decision === 'error' && !entry.failureStage) return false;
    if (activityFilters.agent !== 'all' && (entry.agent || 'unknown') !== activityFilters.agent)
      return false;
    if (!activityFilters.query) return true;
    return [
      entry.ruleId,
      entry.command,
      entry.segment,
      entry.reason,
      entry.toolName,
      entry.cwd,
      entry.agent || 'unknown',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(activityFilters.query);
  };
  const entries = activity.entries.filter(matchesFilters);
  renderedFeedEntries = entries;
  qs('activity-feed').innerHTML =
    entries.length === 0
      ? '<p class="empty">No audit log entries match.</p>'
      : `<div class="feed-list">${entries
          .map((entry, index) => {
            const label = dayLabel(entry.ts);
            const separator =
              index > 0 && label === dayLabel(entries[index - 1].ts)
                ? ''
                : `<div class="feed-day-sep">${escapeHtml(label)}</div>`;
            return separator + feedItemHtml(entry, index);
          })
          .join('')}</div>`;
  applyFeedClamps(qs('activity-feed'));
  qs('activity-count').textContent =
    `Showing ${entries.length.toLocaleString('en-US')} of ${activity.totalInWindow.toLocaleString('en-US')} entries from the last ${activity.days} days${activity.truncated ? ' (showing the newest 500)' : ''}.`;
};
const loadActivity = async () => {
  const result = await requestJson(`/api/activity?days=${activityFilters.days}`);
  if (!result.ok || !isActivityFeed(result.data)) {
    const message = `<p class="empty">Could not load activity: ${escapeHtml(errorText(result))}</p>`;
    qs('overview-tiles').innerHTML = '';
    qs('top-rules').innerHTML = message;
    qs('guard-errors').hidden = true;
    qs('activity-feed').innerHTML = message;
    qs('activity-count').textContent = '';
    return;
  }
  activity = result.data;
  if (activityFilters.agent !== 'all' && !(activityFilters.agent in activity.counts.agents)) {
    activityFilters.agent = 'all';
  }
  if (activityFilters.decision === 'error' && activity.counts.errors === 0) {
    activityFilters.decision = 'all';
  }
  qs('logs-path').textContent = activity.logsDir ?? 'Not available';
  renderOverviewActivity();
  renderTopRules();
  renderGuardErrors();
  renderActivityControls();
  renderActivityFeed();
};
const confirmDialog = (() => {
  const dialog = qs('confirm-dialog');
  const confirm = qs('confirm-dialog-confirm');
  const cancel = qs('confirm-dialog-cancel');
  let resolvePending = null;
  dialog.addEventListener('close', () => {
    if (!resolvePending) return;
    resolvePending(dialog.returnValue === 'confirm');
    resolvePending = null;
  });
  dialog.addEventListener('cancel', () => {
    dialog.returnValue = 'cancel';
  });
  return (options) =>
    new Promise((resolve) => {
      if (resolvePending) {
        resolve(false);
        return;
      }
      qs('confirm-dialog-title').textContent = options.title;
      qs('confirm-dialog-body').textContent = options.body;
      qs('confirm-dialog-detail').textContent = options.detail ?? '';
      qs('confirm-dialog-detail').parentElement.hidden = !options.detail;
      confirm.textContent = options.confirmLabel;
      confirm.className = options.confirmClass ?? 'danger';
      dialog.returnValue = 'cancel';
      resolvePending = resolve;
      dialog.showModal();
      cancel.focus();
    });
})();
const confirmProtectionDisable = (options) =>
  confirmDialog({
    title: options.title,
    body: options.body,
    detail: options.detail,
    confirmLabel: 'Disable protection',
  });
const togglePanel = (button) => {
  const expanded = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(expanded));
  qs(button.getAttribute('aria-controls')).hidden = !expanded;
};
const syncSearchState = () => {
  const active = qs('policy-search').value.trim().length > 0;
  if (active === searchActive) return;
  searchActive = active;
  if (active) return;
  searchCollapsedTiers.clear();
  searchCollapsedSecretGroups.clear();
};
const updateRawSource = () => {
  qs('raw-source').textContent = state?.errors.length
    ? 'Read-only original policy JSON. Repair preserves valid settings and writes canonical JSON.'
    : 'Read-only mirror of the controls.';
};
const setRawCopyCopied = (copied) => {
  qs('raw-copy').innerHTML = copied ? rawCopyIcons.check : rawCopyIcons.copy;
  qs('raw-copy').classList.toggle('copied', copied);
  qs('raw-copy').setAttribute(
    'aria-label',
    copied ? 'Copied raw JSON' : 'Copy raw JSON to clipboard',
  );
};
const resetFeedCopy = () => {
  document.querySelectorAll('.feed-copy.copied').forEach((button) => {
    button.classList.remove('copied');
    button.innerHTML = rawCopyIcons.copy;
    button.setAttribute('aria-label', 'Copy log entry as JSON');
  });
};
const copyFeedEntry = async (button) => {
  const entry = renderedFeedEntries[Number(button.dataset.logCopy)];
  if (!entry) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(entry, null, 2));
    if (feedCopyResetTimer) clearTimeout(feedCopyResetTimer);
    resetFeedCopy();
    button.classList.add('copied');
    button.innerHTML = rawCopyIcons.check;
    button.setAttribute('aria-label', 'Copied log entry');
    feedCopyResetTimer = setTimeout(resetFeedCopy, 2000);
  } catch {
    setAppStatus('Copy failed', 'error');
  }
};
const copyRawToClipboard = async () => {
  qs('raw-copy').disabled = true;
  try {
    await navigator.clipboard.writeText(qs('raw').value);
    setRawCopyCopied(true);
    if (rawCopyResetTimer) clearTimeout(rawCopyResetTimer);
    rawCopyResetTimer = setTimeout(() => setRawCopyCopied(false), 2000);
  } catch (error) {
    setAppStatus('Copy failed', 'error');
    setDetailStatus(
      `Error: Could not copy Raw JSON: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    );
  } finally {
    qs('raw-copy').disabled = false;
  }
};
const formatStarCount = (count) => {
  if (typeof count !== 'number') return '';
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(count);
};
const starCountHtml = (count) => {
  const formatted = formatStarCount(count);
  return formatted ? `<span class="star-count">${escapeHtml(formatted)}</span>` : '';
};
const hideStarCta = () => {
  qs('star-row').hidden = true;
  qs('star-slot').innerHTML = '';
};
const renderStarPitch = (context, starred = false) => {
  const evidence =
    context.blockedTotal > 0
      ? `CC Safety Net has blocked <strong>${escapeHtml(context.blockedTotal.toLocaleString('en-US'))}</strong> risky command${context.blockedTotal === 1 ? '' : 's'} on this machine.`
      : '';
  if (starred) {
    qs('star-pitch-text').innerHTML = evidence;
    return;
  }
  qs('star-pitch-text').innerHTML = evidence
    ? `${evidence} If it saved your work, star it on GitHub.`
    : 'If CC Safety Net is useful to you, star it on GitHub.';
};
const renderStarLink = (context, href = fallbackRepoUrl) => {
  qs('star-slot').innerHTML =
    `<a class="star-cta" href="${escapeHtml(href)}" target="_blank" rel="noopener" aria-label="Star CC Safety Net on GitHub (opens github.com)">
      <span class="star-icon" aria-hidden="true">${starIcons.outline}</span>
      <span class="star-label">Star on GitHub</span>
      ${starCountHtml(context.starCount)}
    </a>`;
  qs('star-row').hidden = false;
};
const renderStarCta = (context) => {
  activeStarContext = context;
  if (context.starred === true) {
    hideStarCta();
    return;
  }
  renderStarPitch(context);
  qs('star-mechanism').hidden = context.starred !== false;
  if (context.starred === null) {
    renderStarLink(context);
    return;
  }
  qs('star-slot').innerHTML =
    `<button type="button" class="star-cta" aria-label="Star CC Safety Net on GitHub. One click via your GitHub CLI.">
      <span class="star-icon" aria-hidden="true">${starIcons.outline}</span>
      <span class="star-label">Star on GitHub</span>
      ${starCountHtml(context.starCount)}
    </button>`;
  qs('star-row').hidden = false;
};
const starRepo = async (button) => {
  button.disabled = true;
  const result = await requestJson('/api/star', { method: 'POST' });
  if (result.ok && result.data?.ok === true) {
    button.querySelector('.star-icon').innerHTML = starIcons.filled;
    button.querySelector('.star-label').textContent = 'Starred. Thank you.';
    button.setAttribute('aria-label', 'CC Safety Net starred on GitHub');
    button.classList.add('starred');
    qs('star-mechanism').hidden = true;
    renderStarPitch(activeStarContext, true);
    setAppStatus('Starred on GitHub', 'ok');
    setDetailStatus('');
    return;
  }
  qs('star-mechanism').hidden = true;
  renderStarLink(activeStarContext, result.data?.fallbackUrl ?? fallbackRepoUrl);
};
const loadStarContext = async () => {
  const result = await requestJson('/api/star/context');
  renderStarCta(
    result.ok && result.data ? result.data : { starred: null, starCount: null, blockedTotal: 0 },
  );
};
const syncRawFromForm = () => {
  if (state?.errors.length) return;
  qs('raw').value = formatPolicy(collectFormPolicy());
  updateRawSource();
};
const updateDirtyStatus = () => {
  if (state?.errors.length) return;
  const draftJson = JSON.stringify(collectFormPolicy());
  dirty = draftJson !== JSON.stringify(state.policy);
  qs('policy-savebar').hidden = !dirty;
  qs('dirty-chip').hidden = !dirty || currentView() === 'policy';
  if (dirty) sessionStorage.setItem('cc-safety-net-draft', draftJson);
  if (!dirty) sessionStorage.removeItem('cc-safety-net-draft');
  setDetailStatus('');
  updateActions();
};
const createPathList = (prefix, config) => {
  const setHint = (text) => {
    qs(`${prefix}-hint`).textContent = text;
    qs(`${prefix}-hint`).hidden = !text;
  };
  const render = () => {
    const paths = config.getPaths();
    const disabled = config.isDisabled();
    qs(`${prefix}-count`).textContent = `${paths.length} path${paths.length === 1 ? '' : 's'}`;
    qs(`${prefix}-input`).disabled = disabled;
    qs(`${prefix}-add-button`).disabled = disabled;
    qs(`${prefix}-list`).innerHTML =
      paths.length === 0
        ? `<li class="empty">No ${config.itemLabel}s configured.</li>`
        : paths
            .map(
              (path, index) => `<li class="path-item ${disabled ? 'row-disabled' : ''}">
          <code>${escapeHtml(path)}</code>
          <button type="button" class="icon-button" data-path-list="${prefix}" data-path-remove="${index}" ${disabled ? 'disabled' : ''} aria-label="Remove ${config.itemLabel} ${escapeHtml(path)}">${pathListIcons.remove}</button>
        </li>`,
            )
            .join('');
  };
  let adding = false;
  const add = async (value) => {
    if (adding) return;
    const entries = [...new Set(pathLines(value))];
    if (entries.length === 0) return;
    const submitted = qs(`${prefix}-input`).value;
    const additions = entries.filter((entry) => !config.getPaths().includes(entry));
    if (config.validateAdditions && additions.length) {
      adding = true;
      try {
        const error = await config.validateAdditions([...config.getPaths(), ...additions]);
        if (error) {
          setHint(`Not added: ${additions.join(', ')} — ${error}`);
          return;
        }
      } finally {
        adding = false;
      }
    }
    // Recommit only the initially absent additions against current state, so
    // entries removed during validation stay removed.
    const current = config.getPaths();
    const duplicates = entries.filter((entry) => current.includes(entry));
    config.setPaths([...current, ...additions.filter((entry) => !current.includes(entry))]);
    if (qs(`${prefix}-input`).value === submitted) qs(`${prefix}-input`).value = '';
    setHint(duplicates.length ? `Already listed: ${duplicates.join(', ')}` : '');
    render();
    syncRawFromForm();
    updateDirtyStatus();
    qs(`${prefix}-input`).focus();
  };
  const remove = (index) => {
    config.setPaths(config.getPaths().filter((_, position) => position !== index));
    setHint('');
    render();
    syncRawFromForm();
    updateDirtyStatus();
  };
  return { render, add, remove };
};
const pathLists = {
  'deny-paths': createPathList('deny-paths', {
    getPaths: () => draftPolicy.secret_protection.deny_paths,
    setPaths: (paths) => {
      draftPolicy.secret_protection.deny_paths = paths;
    },
    isDisabled: () => !draftPolicy.secret_protection.enabled,
    itemLabel: 'deny path',
  }),
  'allow-paths': createPathList('allow-paths', {
    getPaths: () => draftPolicy.destructive_command_protection.allow_paths,
    setPaths: (paths) => {
      draftPolicy.destructive_command_protection.allow_paths = paths;
    },
    isDisabled: () => !draftPolicy.destructive_command_protection.enabled,
    itemLabel: 'allow path',
    validateAdditions: async (paths) => {
      const candidate = collectFormPolicy();
      candidate.destructive_command_protection = {
        ...candidate.destructive_command_protection,
        allow_paths: paths,
      };
      const result = await requestJson('/api/policy/preview', {
        method: 'POST',
        body: JSON.stringify(candidate),
      });
      if (result.ok && result.data?.preview) return null;
      return errorText(result);
    },
  }),
};
const groupRules = (rules) =>
  rules.reduce((groups, rule) => {
    const group = groups.find((item) => item.category === rule.category);
    if (group) {
      group.rules.push(rule);
      return groups;
    }
    groups.push({ category: rule.category, rules: [rule] });
    return groups;
  }, []);
const renderSecretPatterns = () => {
  const query = qs('policy-search').value.trim().toLowerCase();
  const rules = state.secretPatterns.filter((rule) =>
    [rule.category, rule.label, rule.id, rule.description].join(' ').toLowerCase().includes(query),
  );
  const overrides = draftPolicy.secret_protection.overrides;
  const disabled = !draftPolicy.secret_protection.enabled;
  const disabledCount = Object.keys(overrides).length;
  qs('secret-summary').textContent = disabled
    ? 'Protection disabled. Saved rule settings and deny paths are preserved.'
    : `${state.secretPatterns.length - disabledCount} active, ${disabledCount} disabled`;
  qs('secret-patterns').innerHTML =
    rules.length === 0
      ? '<p class="empty">No secret protections match the search.</p>'
      : groupRules(rules)
          .map((group) => {
            const expanded =
              secretGroupExpanded.get(group.category) ||
              (searchActive && !searchCollapsedSecretGroups.has(group.category));
            const contentId = `secret-group-${group.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            const allGroupRules = state.secretPatterns.filter(
              (rule) => rule.category === group.category,
            );
            const onCount = disabled
              ? 0
              : allGroupRules.filter((rule) => overrides[rule.id] !== 'off').length;
            return `
      <section class="rule-tier">
        <button type="button" class="rule-tier-head" data-secret-group-toggle="${escapeHtml(group.category)}" aria-expanded="${expanded}" aria-controls="${contentId}">
          <span class="panel-chevron" aria-hidden="true"></span>
          <span class="tier-label"><strong>${escapeHtml(group.category)}</strong></span>
          <span class="tier-counts">${onCount} on · ${allGroupRules.length - onCount} off</span>
        </button>
        <div id="${contentId}" class="tier-content" ${expanded ? '' : 'hidden'}>
        <div class="grid">${group.rules
          .map((rule) => {
            const active = overrides[rule.id] !== 'off';
            const ruleState =
              active && !disabled
                ? { label: 'Active', className: 'state-active' }
                : { label: 'Disabled', className: 'state-disabled' };
            return `<label class="row ${disabled ? 'row-disabled' : ''}">
            <input type="checkbox" data-secret-active="${escapeHtml(rule.id)}" ${checkbox(active)} ${disabled ? 'disabled' : ''}>
            <span>
              <strong>${escapeHtml(rule.label)}</strong>
              <code class="rule-id">${escapeHtml(rule.id)}</code>
              <small><span class="${ruleState.className}">${ruleState.label}</span> ${escapeHtml(rule.description)}</small>
            </span>
          </label>`;
          })
          .join('')}</div>
        </div>
      </section>
    `;
          })
          .join('');
};
const levelCapabilities = (level) => ({
  fail_closed: level === 'strict' || level === 'paranoid',
  paranoid_rm: level === 'paranoid',
  paranoid_interpreters: level === 'paranoid',
});
const presetName = () => safetyLevels[draftPolicy.safety.level][0];
const renderPresetStatus = () => {
  if (!preview) return;
  const customized =
    preview.counts.effectiveCustomizations > 0 ||
    Object.entries(draftPolicy.safety.overrides).some(
      ([key, value]) => value !== levelCapabilities(draftPolicy.safety.level)[key],
    );
  qs('safety-preset-status').textContent = customized ? `${presetName()} · Customized` : '';
  qs('safety-preset-status').classList.toggle('customized', customized);
};
const renderSafety = () => {
  const environmentSources = preview
    ? [
        ...new Set(
          Object.values(preview.capabilities)
            .filter((capability) => capability.source === 'environment')
            .flatMap((capability) =>
              capability.sources.filter((source) => source.startsWith('env ')),
            ),
        ),
      ]
    : [];
  qs('environment-overrides').hidden = environmentSources.length === 0;
  qs('environment-overrides').textContent = environmentSources.length
    ? `Environment-raised protection: ${environmentSources.join(', ')}`
    : '';
  qs('safety-level').innerHTML = Object.entries(safetyLevels)
    .map(
      ([level, meta]) =>
        `<label class="row"><input type="radio" name="safety-level" value="${level}" ${checkbox(draftPolicy.safety.level === level)}><span><strong>${meta[0]}</strong><small>${meta[1]}</small></span></label>`,
    )
    .join('');
  const inherited = levelCapabilities(draftPolicy.safety.level);
  qs('safety-overrides').innerHTML = Object.entries(safetyOverrides)
    .map(([key, meta]) => {
      const value = draftPolicy.safety.overrides[key];
      const inheritedText = inherited[key] ? 'on' : 'off';
      return `<label class="row safety-override-row"><span><strong>${meta[0]}</strong><small>${meta[1]}</small></span><select data-safety-override="${key}">
      <option value="inherit" ${value === undefined ? 'selected' : ''}>Inherit from preset (${inheritedText})</option>
      <option value="true" ${value === true ? 'selected' : ''}>Force on</option>
      <option value="false" ${value === false ? 'selected' : ''}>Force off</option>
    </select></label>`;
    })
    .join('');
  qs('workflow').innerHTML =
    `<label class="row"><input type="checkbox" data-workflow-worktree ${checkbox(draftPolicy.workflow.worktree_mode)}><span><strong>Allow discarding local changes in linked git worktrees</strong><small>Only relaxes linked worktree discard checks.</small></span></label>`;
  renderPresetStatus();
};
const tierForRule = (rule) => {
  if (!rule.activationCapability) return 'normal';
  return rule.activationCapability === 'fail_closed' ? 'strict' : 'paranoid';
};
const tierMeta = {
  normal: ['Available in every preset', 'No additional capability required'],
  strict: ['Strict tier', 'Inherits from Fail closed'],
  paranoid: ['Paranoid tier', 'Inherits from Paranoid rm or Paranoid interpreters'],
};
const ruleStateText = (rule, effective) => {
  if (effective.source === 'master_disabled')
    return 'Off — destructive-command protection disabled';
  if (effective.source === 'rule_override')
    return `${effective.enabled ? 'On' : 'Off'} — user rule override`;
  if (effective.source === 'built_in_default') return 'On — available in every preset';
  if (effective.source === 'environment') {
    const capability = preview.capabilities[rule.activationCapability];
    const source = [...capability.sources].reverse().find((item) => item.startsWith('env '));
    return `${effective.enabled ? 'On' : 'Off'} — environment${source ? `; ${source.slice(4)}` : ''}`;
  }
  if (effective.source === 'capability_override') {
    return `${effective.enabled ? 'On' : 'Off'} — capability override; ${safetyOverrides[rule.activationCapability][0]} forced ${effective.enabled ? 'on' : 'off'}`;
  }
  if (effective.enabled) return `On — ${presetName()} preset`;
  return `Off — ${presetName()} preset; requires ${tierForRule(rule) === 'strict' ? 'Strict' : 'Paranoid'}`;
};
const openRuleExample = (button) => {
  const rule = state.destructiveCommandRules.find((item) => item.id === button.dataset.ruleExample);
  if (!rule) return;
  const popover = qs('rule-example-popover');
  qs('rule-example-title').textContent = rule.label;
  qs('rule-example-command').textContent = rule.example;
  if (!popover.matches(':popover-open')) popover.showPopover();
  const buttonRect = button.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const gap = 8;
  const edge = 12;
  const below = buttonRect.bottom + gap;
  const top =
    below + popoverRect.height <= window.innerHeight - edge
      ? below
      : Math.max(edge, buttonRect.top - gap - popoverRect.height);
  const left = Math.min(
    window.innerWidth - popoverRect.width - edge,
    Math.max(edge, buttonRect.right - popoverRect.width),
  );
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;
};
const renderDestructiveCommands = () => {
  if (!preview) return;
  const query = qs('policy-search').value.trim().toLowerCase();
  const matchingRules = state.destructiveCommandRules.filter((rule) =>
    [rule.category, rule.label, rule.id, rule.description, tierMeta[tierForRule(rule)][0]]
      .join(' ')
      .toLowerCase()
      .includes(query),
  );
  qs('destructive-command-summary').textContent = draftPolicy.destructive_command_protection.enabled
    ? `${preview.counts.enabled} active, ${preview.counts.disabled} disabled`
    : 'Configurable protection disabled. Catastrophic protections remain active; saved rule settings and allow paths are preserved.';
  const enforcedRules = matchingRules.filter((rule) => rule.catastrophic);
  const configurableRules = matchingRules.filter((rule) => !rule.catastrophic);
  const enforcedExpanded =
    tierExpanded.get('enforced') || (searchActive && !searchCollapsedTiers.has('enforced'));
  const enforcedSection =
    enforcedRules.length === 0
      ? ''
      : `<section class="rule-tier rule-tier-enforced">
        <button type="button" class="rule-tier-head" data-tier-toggle="enforced" aria-expanded="${enforcedExpanded}" aria-controls="destructive-tier-enforced">
          <span class="panel-chevron" aria-hidden="true"></span>
          <span class="tier-label"><strong>Always enforced</strong><small>Cannot be disabled by any preset, rule override, or allow path</small></span>
          <span class="tier-counts">${enforcedRules.length} protection${enforcedRules.length === 1 ? '' : 's'}</span>
        </button>
        <div id="destructive-tier-enforced" class="tier-content" ${enforcedExpanded ? '' : 'hidden'}>
          ${groupRules(enforcedRules)
            .map(
              (group) => `<section class="destructive-command-group">
            <h3>${escapeHtml(group.category)}</h3>
            <div class="grid">${group.rules
              .map(
                (rule) => `<div class="row rule-row rule-row-enforced">
                <span class="rule-control">
                  <span>
                    <strong>${escapeHtml(rule.label)}</strong>
                    <code class="rule-id">${escapeHtml(rule.id)}</code>
                    <small><span class="state-active">Always enforced</span> ${escapeHtml(rule.description)}</small>
                  </span>
                </span>
                <button type="button" class="rule-example-button" data-rule-example="${escapeHtml(rule.id)}" aria-label="${escapeHtml(`Show blocked example for ${rule.label}`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
              </div>`,
              )
              .join('')}</div>
          </section>`,
            )
            .join('')}
        </div>
      </section>`;
  qs('destructive-command-rules').innerHTML =
    matchingRules.length === 0
      ? '<p class="empty">No built-in protections match the search.</p>'
      : enforcedSection +
        Object.keys(tierMeta)
          .map((tier) => {
            const rules = configurableRules.filter((rule) => tierForRule(rule) === tier);
            if (rules.length === 0) return '';
            const allTierRules = state.destructiveCommandRules.filter(
              (rule) => !rule.catastrophic && tierForRule(rule) === tier,
            );
            const tierStates = allTierRules.map((rule) => preview.rules[rule.id]);
            const expanded =
              tierExpanded.get(tier) || (searchActive && !searchCollapsedTiers.has(tier));
            const contentId = `destructive-tier-${tier}`;
            return `<section class="rule-tier rule-tier-${tier}">
        <button type="button" class="rule-tier-head" data-tier-toggle="${tier}" aria-expanded="${expanded}" aria-controls="${contentId}">
          <span class="panel-chevron" aria-hidden="true"></span>
          <span class="tier-label"><strong>${tierMeta[tier][0]}</strong><small>${tierMeta[tier][1]}</small></span>
          <span class="tier-counts">${tierStates.filter((item) => item.enabled).length} on · ${tierStates.filter((item) => !item.enabled).length} off · ${tierStates.filter((item) => item.changesInherited).length} customized</span>
        </button>
        <div id="${contentId}" class="tier-content" ${expanded ? '' : 'hidden'}>
          ${groupRules(rules)
            .map(
              (group) => `<section class="destructive-command-group">
            <h3>${escapeHtml(group.category)}</h3>
            <div class="grid">${group.rules
              .map((rule) => {
                const effective = preview.rules[rule.id];
                const override = draftPolicy.destructive_command_protection.overrides[rule.id];
                const status = ruleStateText(rule, effective);
                const disabled = !draftPolicy.destructive_command_protection.enabled;
                return `<div class="row rule-row ${disabled ? 'row-disabled' : ''}">
                <label class="rule-control">
                  <input type="checkbox" data-destructive-command-active="${escapeHtml(rule.id)}" ${checkbox(effective.enabled)} ${disabled ? 'disabled' : ''} aria-label="${escapeHtml(`${rule.label}: ${status}`)}">
                  <span>
                    <strong>${escapeHtml(rule.label)}</strong>
                    <code class="rule-id">${escapeHtml(rule.id)}</code>
                    <small><span class="${effective.enabled ? 'state-active' : 'state-disabled'}">${escapeHtml(status)}</span> ${escapeHtml(rule.description)}</small>
                  </span>
                </label>
                <button type="button" class="rule-example-button" data-rule-example="${escapeHtml(rule.id)}" aria-label="${escapeHtml(`Show blocked example for ${rule.label}`)}" aria-haspopup="dialog" aria-controls="rule-example-popover">?</button>
                ${override && !effective.changesInherited ? `<button type="button" class="inherit-button" data-use-inherited="${escapeHtml(rule.id)}">Use inherited setting</button>` : ''}
              </div>`;
              })
              .join('')}</div>
          </section>`,
            )
            .join('')}
        </div>
      </section>`;
          })
          .join('');
};
const refreshPolicyPreview = async () => {
  const requestId = ++previewRequestId;
  const result = await requestJson('/api/policy/preview', {
    method: 'POST',
    body: JSON.stringify(collectFormPolicy()),
  });
  if (requestId !== previewRequestId) return false;
  if (!result.ok || !result.data?.preview) {
    setAppStatus('Preview failed', 'error');
    setDetailStatus(`Error: ${errorText(result)}`, 'error');
    return false;
  }
  preview = result.data.preview;
  renderProtectionCard();
  renderSafety();
  renderDestructiveCommands();
  return true;
};
function render() {
  draftPolicy = clonePolicy(state.policy);
  preview = state.preview;
  dirty = false;
  qs('policy-savebar').hidden = true;
  qs('dirty-chip').hidden = true;
  qs('policy-path').textContent = state.path + (state.exists ? '' : ' (not created yet)');
  renderSafety();
  qs('destructive-command').innerHTML =
    '<label class="row master"><input type="checkbox" data-destructive-command-enabled ' +
    checkbox(state.policy.destructive_command_protection.enabled) +
    '><span><strong>Destructive command protection</strong><small>Block configurable destructive git, filesystem, and execution patterns. Catastrophic and custom rules remain active when disabled.</small></span><span class="master-badge" aria-hidden="true"></span></label>' +
    '<div id="destructive-command-rules"></div>' +
    '<section class="rule-tier">' +
    '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="allow-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="allow-paths-label">Allow paths</strong><small>Recursive deletes targeting these paths are not blocked, like /tmp. The home directory, or any path containing it, is rejected.</small></span><span class="tier-counts" id="allow-paths-count"></span></button>' +
    '<div class="tier-content paths-content" id="allow-paths-content" hidden>' +
    '<p class="muted">Use an absolute path or a ~/ path. Paste multiple lines to add several paths at once.</p>' +
    '<div class="paths-add"><input type="text" id="allow-paths-input" data-path-input="allow-paths" autocomplete="off" spellcheck="false" placeholder="/absolute/path or ~/path" aria-labelledby="allow-paths-label"><button type="button" class="icon-button" id="allow-paths-add-button" data-path-add="allow-paths" aria-label="Add allow path">' +
    pathListIcons.add +
    '</button></div>' +
    '<p class="paths-hint" id="allow-paths-hint" hidden></p>' +
    '<ul class="paths-list" id="allow-paths-list"></ul>' +
    '</div></section>';
  qs('secret').innerHTML =
    '<label class="row master"><input type="checkbox" id="secret-enabled" ' +
    checkbox(state.policy.secret_protection.enabled) +
    '><span><strong>Secret protection</strong><small>Block default sensitive paths, coding CLI credential locations, and configured deny paths.</small></span><span class="master-badge" aria-hidden="true"></span></label>' +
    '<div id="secret-patterns"></div>' +
    '<section class="rule-tier">' +
    '<button type="button" class="rule-tier-head" aria-expanded="false" aria-controls="deny-paths-content"><span class="panel-chevron" aria-hidden="true"></span><span class="tier-label"><strong id="deny-paths-label">Deny paths</strong><small>Configured paths and everything inside them are blocked while Secret protection is on.</small></span><span class="tier-counts" id="deny-paths-count"></span></button>' +
    '<div class="tier-content paths-content" id="deny-paths-content" hidden>' +
    '<p class="muted">Paste multiple lines to add several paths at once.</p>' +
    '<div class="paths-add"><input type="text" id="deny-paths-input" data-path-input="deny-paths" autocomplete="off" spellcheck="false" placeholder="path/to/protect" aria-labelledby="deny-paths-label"><button type="button" class="icon-button" id="deny-paths-add-button" data-path-add="deny-paths" aria-label="Add deny path">' +
    pathListIcons.add +
    '</button></div>' +
    '<p class="paths-hint" id="deny-paths-hint" hidden></p>' +
    '<ul class="paths-list" id="deny-paths-list"></ul>' +
    '</div></section>';
  qs('raw').value = state.errors.length ? state.raw : formatPolicy(draftPolicy);
  qs('policy-search').value = '';
  syncSearchState();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists['deny-paths'].render();
  pathLists['allow-paths'].render();
  updateRawSource();
  qs('recovery').hidden = state.errors.length === 0;
  updateActions();
  renderProtectionCard();
  if (state.errors.length) {
    if (currentView() !== 'policy') location.hash = 'policy';
    setAppStatus('Repair required', 'error');
    setDetailStatus(`Error: ${state.errors.join('\n')}`, 'error');
    return;
  }
  setAppStatus('');
  setDetailStatus('');
}
const restoreDraft = () => {
  if (state.errors.length) return;
  const stored = sessionStorage.getItem('cc-safety-net-draft');
  if (!stored) return;
  const parsed = (() => {
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  })();
  const isPolicyShape = [
    'safety',
    'workflow',
    'destructive_command_protection',
    'secret_protection',
  ].every((key) => parsed && typeof parsed[key] === 'object' && parsed[key] !== null);
  if (!isPolicyShape || stored === JSON.stringify(state.policy)) {
    sessionStorage.removeItem('cc-safety-net-draft');
    return;
  }
  draftPolicy = parsed;
  // render() builds the two master-toggle checkboxes from state.policy and the
  // sub-renders below do not rebuild them, so sync them from the restored draft.
  document.querySelector('[data-destructive-command-enabled]').checked =
    draftPolicy.destructive_command_protection.enabled;
  qs('secret-enabled').checked = draftPolicy.secret_protection.enabled;
  renderSafety();
  renderDestructiveCommands();
  renderSecretPatterns();
  pathLists['deny-paths'].render();
  pathLists['allow-paths'].render();
  syncRawFromForm();
  updateDirtyStatus();
  void refreshPolicyPreview();
  setAppStatus('Restored unsaved draft', 'ok');
};
async function load() {
  const result = await requestJson('/api/policy');
  if (!isPolicyState(result.data)) {
    setAppStatus('Load failed', 'error');
    setDetailStatus(`Error: Could not load policy: ${errorText(result)}`, 'error');
    return false;
  }
  state = result.data;
  render();
  restoreDraft();
  return true;
}
document.addEventListener('input', (event) => {
  const input = event.target;
  if (input.id === 'policy-search') {
    syncSearchState();
    renderDestructiveCommands();
    renderSecretPatterns();
    return;
  }
  if (input.id === 'activity-search' && activity) {
    activityFilters.query = input.value.trim().toLowerCase();
    renderActivityFeed();
  }
});
document.addEventListener('keydown', (event) => {
  const list = pathLists[event.target?.dataset?.pathInput];
  if (!list || event.key !== 'Enter') return;
  event.preventDefault();
  void list.add(event.target.value);
});
document.addEventListener('paste', (event) => {
  const list = pathLists[event.target?.dataset?.pathInput];
  if (!list) return;
  const text = event.clipboardData?.getData('text') ?? '';
  if (!text.includes('\n')) return;
  event.preventDefault();
  void list.add(`${event.target.value}\n${text}`);
});
document.addEventListener('change', (event) => {
  const input = event.target;
  if (input.id === 'activity-days') {
    activityFilters.days = Number(input.value);
    void loadActivity();
    return;
  }
  if (input.name === 'safety-level') {
    draftPolicy.safety.level = input.value;
    renderSafety();
    syncRawFromForm();
    updateDirtyStatus();
    void refreshPolicyPreview();
    return;
  }
  if (input.dataset?.safetyOverride) {
    if (input.value === 'inherit')
      delete draftPolicy.safety.overrides[input.dataset.safetyOverride];
    if (input.value === 'true') draftPolicy.safety.overrides[input.dataset.safetyOverride] = true;
    if (input.value === 'false') draftPolicy.safety.overrides[input.dataset.safetyOverride] = false;
    syncRawFromForm();
    updateDirtyStatus();
    void refreshPolicyPreview();
    return;
  }
  if ('workflowWorktree' in input.dataset) {
    draftPolicy.workflow.worktree_mode = input.checked;
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if ('destructiveCommandEnabled' in input.dataset) {
    void (async () => {
      if (
        !input.checked &&
        !(await confirmProtectionDisable({
          title: 'Disable destructive command protection?',
          body: 'Built-in destructive git, filesystem, and execution protections will stop blocking commands until you turn this back on.',
          detail: 'Custom rules remain active.',
        }))
      ) {
        input.checked = true;
        return;
      }
      draftPolicy.destructive_command_protection.enabled = input.checked;
      pathLists['allow-paths'].render();
      syncRawFromForm();
      updateDirtyStatus();
      void refreshPolicyPreview();
    })();
    return;
  }
  if (input.dataset?.destructiveCommandActive) {
    const ruleId = input.dataset.destructiveCommandActive;
    if (input.checked === preview.rules[ruleId].inheritedEnabled)
      delete draftPolicy.destructive_command_protection.overrides[ruleId];
    else
      draftPolicy.destructive_command_protection.overrides[ruleId] = input.checked ? 'on' : 'off';
    syncRawFromForm();
    updateDirtyStatus();
    void refreshPolicyPreview();
    return;
  }
  if (input.dataset?.secretActive) {
    if (input.checked) delete draftPolicy.secret_protection.overrides[input.dataset.secretActive];
    else draftPolicy.secret_protection.overrides[input.dataset.secretActive] = 'off';
    renderSecretPatterns();
    syncRawFromForm();
    updateDirtyStatus();
    return;
  }
  if (input.id === 'secret-enabled') {
    void (async () => {
      if (
        !input.checked &&
        !(await confirmProtectionDisable({
          title: 'Disable secret protection?',
          body: 'Default sensitive paths, coding CLI credential locations, and deny paths will stop blocking access until you turn this back on.',
        }))
      ) {
        input.checked = true;
        return;
      }
      draftPolicy.secret_protection.enabled = input.checked;
      renderSecretPatterns();
      pathLists['deny-paths'].render();
      syncRawFromForm();
      updateDirtyStatus();
    })();
  }
});
document.addEventListener('click', (event) => {
  const feedToggle = event.target.closest?.('[data-feed-toggle]');
  if (feedToggle) {
    const expanded = feedToggle.previousElementSibling.classList.toggle('expanded');
    feedToggle.setAttribute('aria-expanded', String(expanded));
    feedToggle.textContent = expanded ? 'Show less' : 'Show more';
    return;
  }
  const feedCopy = event.target.closest?.('[data-log-copy]');
  if (feedCopy) {
    copyFeedEntry(feedCopy);
    return;
  }
  const topRule = event.target.closest?.('.top-rule');
  if (topRule) {
    activityFilters.query = topRule.dataset.ruleId.toLowerCase();
    qs('activity-search').value = topRule.dataset.ruleId;
    if (activity) renderActivityFeed();
    location.hash = 'activity';
    return;
  }
  if (event.target.closest?.('#guard-errors')) {
    activityFilters.decision = 'error';
    if (activity) {
      renderActivityControls();
      renderActivityFeed();
    }
    location.hash = 'activity';
    return;
  }
  const chip = event.target.closest?.('[data-activity-chip]');
  if (chip && activity) {
    activityFilters[chip.dataset.activityChip] = chip.dataset.chipValue;
    renderActivityControls();
    renderActivityFeed();
    return;
  }
  if (event.target.closest?.('#activity-refresh')) {
    void loadActivity();
    return;
  }
  const ruleExampleButton = event.target.closest?.('[data-rule-example]');
  if (ruleExampleButton) {
    openRuleExample(ruleExampleButton);
    return;
  }
  const tierButton = event.target.closest?.('[data-tier-toggle]');
  if (tierButton) {
    const tier = tierButton.dataset.tierToggle;
    const expanded = tierButton.getAttribute('aria-expanded') === 'true';
    tierExpanded.set(tier, !expanded);
    if (searchActive && expanded) searchCollapsedTiers.add(tier);
    if (!expanded) searchCollapsedTiers.delete(tier);
    renderDestructiveCommands();
    return;
  }
  const secretGroupButton = event.target.closest?.('[data-secret-group-toggle]');
  if (secretGroupButton) {
    const category = secretGroupButton.dataset.secretGroupToggle;
    const expanded = secretGroupButton.getAttribute('aria-expanded') === 'true';
    secretGroupExpanded.set(category, !expanded);
    if (searchActive && expanded) searchCollapsedSecretGroups.add(category);
    if (!expanded) searchCollapsedSecretGroups.delete(category);
    renderSecretPatterns();
    return;
  }
  const button = event.target.closest?.('.panel-toggle, .rule-tier-head');
  if (button) {
    togglePanel(button);
    return;
  }
  const inheritedButton = event.target.closest?.('[data-use-inherited]');
  if (inheritedButton) {
    delete draftPolicy.destructive_command_protection.overrides[
      inheritedButton.dataset.useInherited
    ];
    syncRawFromForm();
    updateDirtyStatus();
    void refreshPolicyPreview();
    return;
  }
  if (event.target.closest?.('#reset-rule-customizations')) {
    if (Object.keys(draftPolicy.destructive_command_protection.overrides).length === 0) {
      setAppStatus('No rule customizations to reset', 'ok');
      return;
    }
    void (async () => {
      if (
        !(await confirmDialog({
          title: 'Reset rule customizations?',
          body: 'All built-in destructive-command rules will return to their inherited preset settings.',
          confirmLabel: 'Reset customizations',
        }))
      )
        return;
      draftPolicy.destructive_command_protection.overrides = {};
      syncRawFromForm();
      updateDirtyStatus();
      void refreshPolicyPreview();
    })();
    return;
  }
  if (event.target.closest?.('#discard-changes')) {
    void (async () => {
      if (
        !(await confirmDialog({
          title: 'Discard unsaved changes?',
          body: 'All changes since your last save will be reverted.',
          confirmLabel: 'Discard changes',
        }))
      )
        return;
      void runExclusive('Discarding...', async () => {
        sessionStorage.removeItem('cc-safety-net-draft');
        if (await load()) setAppStatus('Changes discarded.', 'ok');
      });
    })();
    return;
  }
  const addButton = event.target.closest?.('[data-path-add]');
  if (addButton) {
    void pathLists[addButton.dataset.pathAdd].add(qs(`${addButton.dataset.pathAdd}-input`).value);
    return;
  }
  const removeButton = event.target.closest?.('[data-path-remove]');
  if (removeButton)
    pathLists[removeButton.dataset.pathList].remove(Number(removeButton.dataset.pathRemove));
  const starButton = event.target.closest?.('.star-cta');
  if (starButton?.tagName === 'BUTTON') {
    void starRepo(starButton);
    return;
  }
});
qs('dirty-chip').onclick = () => {
  location.hash = 'policy';
};
qs('save').onclick = () => {
  if (!state) {
    setAppStatus('Load failed', 'error');
    setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error');
    return;
  }
  if (state.errors.length) {
    setAppStatus('Repair required', 'error');
    setDetailStatus('Error: Repair policy before saving changes.', 'error');
    return;
  }
  if (!dirty) {
    setAppStatus('No changes to save', 'ok');
    setDetailStatus('');
    return;
  }
  const policy = collectFormPolicy();
  void runExclusive('Saving...', async () => {
    const result = await requestJson('/api/policy', {
      method: 'POST',
      body: JSON.stringify(policy),
    });
    if (!isWriteSuccess(result)) {
      setAppStatus('Save failed', 'error');
      setDetailStatus(`Error: ${errorText(result)}`, 'error');
      return;
    }
    const savedPath = result.data.path;
    sessionStorage.removeItem('cc-safety-net-draft');
    if (await load()) {
      dirty = false;
      setAppStatus(`Saved ${savedPath}.`, 'ok');
      setDetailStatus('');
    }
  });
};
qs('repair').onclick = async () => {
  if (!state) {
    setAppStatus('Load failed', 'error');
    setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error');
    return;
  }
  if (state.errors.length === 0) {
    setAppStatus('');
    setDetailStatus('');
    return;
  }
  if (
    !(await confirmDialog({
      title: 'Repair policy?',
      body: 'This will write canonical policy JSON. Valid settings are preserved; invalid fields are discarded. If the JSON cannot be parsed, defaults are restored.',
      detail: state.path,
      confirmLabel: 'Repair',
      confirmClass: 'primary',
    }))
  ) {
    return;
  }
  void runExclusive('Repairing...', async () => {
    const result = await requestJson('/api/repair', { method: 'POST', body: '{}' });
    if (!isWriteSuccess(result)) {
      setAppStatus('Repair failed', 'error');
      setDetailStatus(`Error: ${errorText(result)}`, 'error');
      return;
    }
    const repairedPath = result.data.path;
    sessionStorage.removeItem('cc-safety-net-draft');
    if (await load()) {
      dirty = false;
      setAppStatus(`Repaired ${repairedPath}.`, 'ok');
      setDetailStatus('');
    }
  });
};
qs('reset').onclick = async () => {
  if (!state) {
    setAppStatus('Load failed', 'error');
    setDetailStatus('Error: Policy is not loaded yet. Reload the page.', 'error');
    return;
  }
  if (
    !(await confirmDialog({
      title: 'Reset policy?',
      body: 'This will restore the default policy JSON at this path.',
      detail: state.path,
      confirmLabel: 'Reset policy',
    }))
  ) {
    return;
  }
  void runExclusive('Resetting...', async () => {
    const result = await requestJson('/api/reset', { method: 'POST', body: '{}' });
    if (!isWriteSuccess(result)) {
      setAppStatus('Reset failed', 'error');
      setDetailStatus(`Error: ${errorText(result)}`, 'error');
      return;
    }
    const resetPath = result.data.path;
    sessionStorage.removeItem('cc-safety-net-draft');
    if (await load()) {
      dirty = false;
      setAppStatus(`Reset ${resetPath} to defaults.`, 'ok');
      setDetailStatus('');
    }
  });
};
setRawCopyCopied(false);
qs('raw-copy').onclick = () => {
  void copyRawToClipboard();
};
const themeOrder = ['auto', 'light', 'dark'];
const themeIcons = {
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"></rect><path d="M8 20h8M12 16v4"></path></svg>',
  light:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"></path></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"></path></svg>',
};
const themeLabels = { auto: 'Auto', light: 'Light', dark: 'Dark' };
const applyTheme = (pref) => {
  document.documentElement.style.colorScheme = pref === 'auto' ? 'light dark' : pref;
  qs('theme-toggle').innerHTML = `${themeIcons[pref]}<span>${themeLabels[pref]}</span>`;
  qs('theme-toggle').setAttribute(
    'aria-label',
    `Color theme: ${themeLabels[pref]}. Click to change.`,
  );
};
let themePref = themeOrder.includes(localStorage.getItem('cc-safety-net-theme'))
  ? localStorage.getItem('cc-safety-net-theme')
  : 'auto';
applyTheme(themePref);
qs('theme-toggle').onclick = () => {
  themePref = themeOrder[(themeOrder.indexOf(themePref) + 1) % themeOrder.length];
  if (themePref === 'auto') localStorage.removeItem('cc-safety-net-theme');
  else localStorage.setItem('cc-safety-net-theme', themePref);
  applyTheme(themePref);
};
window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});
window.addEventListener('hashchange', applyView);
applyView();
load()
  .then((loaded) => {
    if (loaded) void loadStarContext();
    void loadActivity();
  })
  .catch((error) => {
    setAppStatus('Load failed', 'error');
    setDetailStatus(String(error), 'error');
  });
