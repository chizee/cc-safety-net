import { describe, expect, test } from 'bun:test';
import { buildReportRequest, scrubReportPaths } from '@/gui/frontend/report';

const ISSUE_URL =
  'https://github.com/kenryu42/cc-safety-net/issues/new?template=false_positive.yml';

describe('the false-positive report', () => {
  test('scrubs the project path before the home it sits under', () => {
    const home = '/var/home/robin';
    const cwd = `${home}/checkouts/ledger`;

    expect(
      scrubReportPaths(
        `reading "${cwd}/src/app.ts" failed, and ${home}/.ssh/id_ed25519 was next; last: ${cwd}`,
        cwd,
        home,
      ),
    ).toBe(
      'reading "<project>/src/app.ts" failed, and ~/.ssh/id_ed25519 was next; last: <project>',
    );
  });

  test('leaves a path that merely starts with the project path alone', () => {
    expect(
      scrubReportPaths('/srv/work/ledger-old/notes.md', '/srv/work/ledger', '/var/home/robin'),
    ).toBe('/srv/work/ledger-old/notes.md');
  });

  test('carries only the fields that have something to say', () => {
    const url = new URL(
      buildReportRequest({ command: 'rm -rf /tmp/x', reason: '', why: 'test' }).url,
    );

    expect(buildReportRequest({}).url).toBe(ISSUE_URL);
    expect(url.origin + url.pathname).toBe('https://github.com/kenryu42/cc-safety-net/issues/new');
    expect(url.searchParams.get('template')).toBe('false_positive.yml');
    expect(url.searchParams.get('command')).toBe('rm -rf /tmp/x');
    expect(url.searchParams.get('why')).toBe('test');
    expect(url.searchParams.has('reason')).toBeFalse();
  });

  test('drops the largest field until the URL fits, and names what it dropped', () => {
    const request = buildReportRequest({
      command: 'd'.repeat(9000),
      why: 'e'.repeat(20),
    });

    expect(request.dropped).toStrictEqual(['command']);
    expect(request.url.length).toBeLessThanOrEqual(8000);
    expect(new URL(request.url).searchParams.get('why')).toBe('e'.repeat(20));
  });
});
