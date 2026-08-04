import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { getActivityFeed } from '@/gui/activity';
import { renderPolicyGuiHtml } from '@/gui/page';

const html = renderPolicyGuiHtml('test-token');
// Scrubbing and URL building are the privacy boundary, but they live in the page
// script that ships inlined in the document. Evaluate just that block — it is
// pure, so it needs no DOM — instead of restructuring the script for tests.
const helperSource = html.slice(
  html.indexOf('var reportIssueUrl ='),
  html.indexOf('var openReportDialog ='),
);
const helpers = new Function(
  `${helperSource}return { scrubReportPaths, buildReportUrl, buildReportRequest };`,
)() as {
  scrubReportPaths: (text: string, cwd?: string | null, home?: string | null) => string;
  buildReportUrl: (fields: Record<string, string>) => string;
  buildReportRequest: (fields: Record<string, string>) => { url: string; dropped: string[] };
};

describe('false positive report', () => {
  test('scrubs the entry cwd before the home directory, keeping path structure', () => {
    expect(
      helpers.scrubReportPaths(
        'cd /Users/ada/dev/app/src && cat /Users/ada/.aws/credentials',
        '/Users/ada/dev/app',
        '/Users/ada',
      ),
    ).toBe('cd <project>/src && cat ~/.aws/credentials');
  });

  test('scrubs every occurrence, including the cwd field inside the entry JSON', () => {
    expect(
      helpers.scrubReportPaths(
        JSON.stringify({ command: 'rm -rf /Users/ada/dev/app/dist', cwd: '/Users/ada/dev/app' }),
        '/Users/ada/dev/app',
        '/Users/ada',
      ),
    ).toBe('{"command":"rm -rf <project>/dist","cwd":"<project>"}');
  });

  test('leaves paths that only share a prefix with the project or home alone', () => {
    // A devcontainer cwd of /app must not rewrite an unrelated /var/lib/appdata.
    expect(helpers.scrubReportPaths('rm -r /var/lib/appdata', '/app', '/root')).toBe(
      'rm -r /var/lib/appdata',
    );
    // A sibling directory is not inside the project and must not read as if it is.
    expect(
      helpers.scrubReportPaths('tar -cf /Users/ada/dev/api-backup.tar', '/Users/ada/dev/api', null),
    ).toBe('tar -cf /Users/ada/dev/api-backup.tar');
    // Another account's home is not this user's home; a partial match would carry
    // the ~ marker and read as scrubbed while still publishing the rest.
    expect(helpers.scrubReportPaths('cat /home/kenji/clients/acme.sql', null, '/home/ken')).toBe(
      'cat /home/kenji/clients/acme.sql',
    );
  });

  test('scrubs a Windows entry when values are serialised through the replacer', () => {
    const entry = {
      command: 'rimraf C:\\Users\\ada\\dev\\acme\\dist',
      cwd: 'C:\\Users\\ada\\dev\\acme',
    };
    const scrub = (text: string) =>
      helpers.scrubReportPaths(text, entry.cwd, 'C:\\Users\\ada') as string;

    // JSON.stringify doubles every backslash, so scrubbing the serialised text
    // never matches the cwd needle and the entry would ship unscrubbed.
    expect(scrub(JSON.stringify(entry))).toContain('C:\\\\Users\\\\ada');

    // Scrubbing each value first is what the dialog does, and it does match.
    const scrubbed = JSON.stringify(entry, (_key, value) =>
      typeof value === 'string' ? scrub(value) : value,
    );
    expect(scrubbed).not.toContain('ada');
    expect(JSON.parse(scrubbed)).toEqual({ command: 'rimraf <project>\\dist', cwd: '<project>' });
  });

  test('skips a prefix the entry does not carry', () => {
    expect(helpers.scrubReportPaths('rm -rf /Users/ada/dev/app', null, undefined)).toBe(
      'rm -rf /Users/ada/dev/app',
    );
    expect(helpers.scrubReportPaths('rm -rf /Users/ada/dev/app', null, '/Users/ada')).toBe(
      'rm -rf ~/dev/app',
    );
  });

  test('prefills the issue form and leaves the expected field to the human', () => {
    const url = new URL(
      helpers.buildReportUrl({
        command: 'git checkout -- .',
        entry: '{"ruleId":"git.checkout","level":"strict"}',
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://github.com/kenryu42/cc-safety-net/issues/new',
    );
    expect(url.searchParams.get('template')).toBe('false_positive.yml');
    expect(url.searchParams.get('command')).toBe('git checkout -- .');
    expect(url.searchParams.get('entry')).toBe('{"ruleId":"git.checkout","level":"strict"}');
    expect(url.searchParams.has('expected')).toBe(false);
  });

  test('omits a field the page could not fill', () => {
    const url = new URL(helpers.buildReportUrl({ command: 'ls', entry: '' }));

    expect(url.searchParams.has('entry')).toBe(false);
    expect(url.searchParams.get('command')).toBe('ls');
  });

  test('keeps every field when the prefill fits GitHub cap', () => {
    const request = helpers.buildReportRequest({ command: 'ls', entry: '{}' });

    expect(request.dropped).toEqual([]);
    expect(new URL(request.url).searchParams.get('entry')).toBe('{}');
  });

  test('drops the largest field when the prefill exceeds GitHub cap', () => {
    const request = helpers.buildReportRequest({
      command: 'ls',
      entry: JSON.stringify({ command: 'x'.repeat(9000) }),
    });
    const url = new URL(request.url);

    expect(request.dropped).toEqual(['entry']);
    expect(request.url.length).toBeLessThanOrEqual(8000);
    expect(url.searchParams.has('entry')).toBe(false);
    expect(url.searchParams.get('command')).toBe('ls');
  });

  test('keeps dropping until the link actually fits, and reports every field dropped', () => {
    // `entry` embeds the command, so a command near COMMAND_MAX_LENGTH still
    // overflows the cap on its own once the entry is gone.
    const command = 'x'.repeat(8829);
    const request = helpers.buildReportRequest({
      command,
      entry: JSON.stringify({ command }),
    });

    expect(request.url.length).toBeLessThanOrEqual(8000);
    expect(request.dropped).toEqual(['entry', 'command']);
    expect(new URL(request.url).searchParams.has('command')).toBe(false);
  });

  test('activity payload carries the home directory the client scrubs with', () => {
    expect(getActivityFeed(7, null).homeDir).toBe(homedir());
  });

  test('only blocked rows offer the report action, and the preview is editable', () => {
    expect(html).toContain(
      '${deny ? `<button type="button" class="icon-button feed-report" data-report-fp="${index}"',
    );
    expect(html).toContain(
      'const scrub = (text) => scrubReportPaths(text, entry.cwd, activity?.homeDir);',
    );
    expect(html).toContain('<textarea id="report-command"');
    expect(html).toContain('<textarea id="report-entry"');
    // Prefill only: the user submits on GitHub themselves.
    expect(html).toContain('window.open(request.url, "_blank", "noopener");');
  });
});
