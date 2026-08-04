import { describe, expect, test } from 'bun:test';
import { renderPolicyGuiHtml } from '@/gui/page';

const html = renderPolicyGuiHtml('test-token');
// The ranking lives in the page script that ships inlined in the document.
// Evaluate just that block of the built script — it is pure and depends only on
// commandSignature directly above it — instead of restructuring it for tests.
const helperSource = html.slice(
  html.indexOf('var commandSignature = (source) => {'),
  html.indexOf('var clearCommandFilter'),
);
type FeedEntry = {
  decision: string;
  command: string;
  segment?: string;
  sessionId?: string;
  failureStage?: string;
};
const findSuspects = new Function(`${helperSource}return findSuspects;`)() as (
  entries: FeedEntry[],
) => Set<FeedEntry>;

describe('suspect filter', () => {
  test('flags a fail-closed denial on its own', () => {
    const failed = {
      decision: 'deny',
      command: 'eval "$(cat script.sh)"',
      sessionId: 's1',
      failureStage: 'parse',
    };
    const blocked = { decision: 'deny', command: 'rm -rf /tmp/build', sessionId: 's1' };

    expect(findSuspects([failed, blocked])).toEqual(new Set([failed]));
  });

  test('flags a signature the same session was blocked on twice', () => {
    const first = { decision: 'deny', command: 'git push origin main', sessionId: 's1' };
    const second = { decision: 'deny', command: 'git push --force', sessionId: 's1' };
    const other = { decision: 'deny', command: 'git status', sessionId: 's1' };

    expect(findSuspects([first, second, other])).toEqual(new Set([first, second]));
  });

  test('matches the signature on the offending segment when there is one', () => {
    const first = {
      decision: 'deny',
      command: 'a && rm -rf dist',
      segment: 'rm -rf dist',
      sessionId: 's1',
    };
    const second = {
      decision: 'deny',
      command: 'b && rm -rf build',
      segment: 'rm -rf build',
      sessionId: 's1',
    };

    expect(findSuspects([first, second])).toEqual(new Set([first, second]));
  });

  test('does not flag one block per session, or entries with no session', () => {
    expect(
      findSuspects([
        { decision: 'deny', command: 'rm -rf dist', sessionId: 's1' },
        { decision: 'deny', command: 'rm -rf dist', sessionId: 's2' },
        { decision: 'deny', command: 'rm -rf dist' },
        { decision: 'deny', command: 'rm -rf dist' },
      ]),
    ).toEqual(new Set());
  });

  test('never flags allowed entries, however often they repeat', () => {
    expect(
      findSuspects([
        { decision: 'allow', command: 'git push origin main', sessionId: 's1' },
        { decision: 'allow', command: 'git push --force', sessionId: 's1' },
      ]),
    ).toEqual(new Set());
  });

  test('the chip renders only when there are suspects, and the feed filters on it', () => {
    expect(html).toContain(
      '[chipHtml("decision", "suspect", "Likely false positive", suspects.size)]',
    );
    expect(html).toContain(
      'if (activityFilters.decision === "suspect" && !suspects.has(entry))\n      return false;',
    );
    expect(html).toContain('if (activityFilters.decision === "suspect" && suspects.size === 0) {');
    expect(html).toContain('suspects = findSuspects(activity.entries);');
  });
});
