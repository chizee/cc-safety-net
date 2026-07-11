import { describe, expect, spyOn, test } from 'bun:test';
import { explainCommand } from '@/bin/explain';
import { analyzeCommand } from '@/core/analyze';
import * as gitAnalysis from '@/core/git';
import type { CommandTraceTerminal } from '@/domain/command-trace';
import { createCommandTraceRecorder } from '@/engine/command-trace';
import { evaluateCommandWithTrace } from '@/engine/evaluate-command';
import { createSemanticFactStore } from '@/engine/facts';
import { parseCommand } from '@/parser/command';
import { policySnapshot } from '../helpers/policy';

describe('command trace recorder', () => {
  test('sanitizes before retaining events and deeply freezes the result', () => {
    const recorder = createCommandTraceRecorder();
    recorder.record({
      kind: 'step',
      scope: 'global',
      step: {
        type: 'parse',
        input:
          'TOKEN=hunter2 curl -H "Authorization: Bearer secret" https://user:pass@example.com sk-abcdefghijklmnopqrstuvwxyz123456',
        segments: [
          ['TOKEN=hunter2'],
          ['eyJabcdefghijk.abcdefgh.abcdefgh'],
          ['-----BEGIN PRIVATE KEY----- secret -----END PRIVATE KEY-----'],
        ],
      },
    });
    const terminal: CommandTraceTerminal = { result: 'allowed' };
    const trace = recorder.finish(terminal);
    const serialized = JSON.stringify(trace);

    for (const secret of [
      'hunter2',
      'Bearer secret',
      'user:pass',
      'sk-abcdefghijklmnopqrstuvwxyz123456',
      'eyJabcdefghijk.abcdefgh.abcdefgh',
      'PRIVATE KEY----- secret',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain('TOKEN=<redacted>');
    expect(Object.isFrozen(trace)).toBe(true);
    expect(Object.isFrozen(trace.events)).toBe(true);
    expect(Object.isFrozen(trace.events[0])).toBe(true);
    expect(Object.isFrozen(trace.events[0]?.step)).toBe(true);
    expect(Object.isFrozen(trace.terminal)).toBe(true);
  });

  test('bounds events and all retained text and list dimensions while preserving terminal', () => {
    const recorder = createCommandTraceRecorder({
      maxEvents: 2,
      maxTextLength: 8,
      maxListLength: 2,
    });
    for (let index = 0; index < 4; index++) {
      recorder.record({
        kind: 'step',
        scope: 'segment',
        segmentIndex: index,
        step: {
          type: 'fallback-scan',
          tokensScanned: ['1234567890', 'abcdefghij', 'dropped'],
          embeddedCommandFound: 'very-long-command',
        },
      });
    }
    const trace = recorder.finish({
      result: 'blocked',
      reason: 'reason that is much too long',
      segment: 'segment that is much too long',
    });

    expect(trace.events).toHaveLength(2);
    expect(trace.droppedEvents).toBe(2);
    expect(JSON.stringify(trace.events).length).toBeLessThan(600);
    expect(trace.terminal).toEqual({
      result: 'blocked',
      reason: 'reason t',
      segment: 'segment ',
    });
  });

  test('is total and ignores records after finish', () => {
    const recorder = createCommandTraceRecorder();
    expect(() => recorder.record(undefined as never)).not.toThrow();
    const trace = recorder.finish({ result: 'allowed' });
    expect(() => recorder.record(undefined as never)).not.toThrow();
    expect(recorder.finish({ result: 'blocked', reason: 'later', segment: 'later' })).toBe(trace);
  });

  test('bounds and freezes hostile or oversized terminals without throwing', () => {
    const recorder = createCommandTraceRecorder({ maxTextLength: 8, maxListLength: 8 });
    const terminal = {
      result: 'blocked',
      reason: 'r'.repeat(100_000),
      segment: 's'.repeat(100_000),
      ...Object.fromEntries(Array.from({ length: 100_000 }, (_, index) => [`field${index}`, 'x'])),
    } as CommandTraceTerminal;
    const trace = recorder.finish(terminal);

    expect(trace.terminal).toEqual({ result: 'blocked', reason: 'rrrrrrrr', segment: 'ssssssss' });
    expect(Object.isFrozen(trace)).toBe(true);
    expect(Object.isFrozen(trace.terminal)).toBe(true);

    const hostileRecorder = createCommandTraceRecorder();
    expect(() =>
      hostileRecorder.record({
        kind: 'step',
        scope: 'global',
        step: new Proxy({} as never, {
          ownKeys: () => {
            throw new Error('hostile event');
          },
        }),
      }),
    ).not.toThrow();
    const hostileGetter = {} as Record<string, unknown>;
    Object.defineProperty(hostileGetter, 'value', {
      enumerable: true,
      get() {
        throw new Error('hostile getter');
      },
    });
    expect(() =>
      hostileRecorder.record({ kind: 'step', scope: 'global', step: hostileGetter as never }),
    ).not.toThrow();
    const hostileTerminal = new Proxy({} as CommandTraceTerminal, {
      get: () => {
        throw new Error('hostile terminal');
      },
    });
    expect(() => hostileRecorder.finish(hostileTerminal)).not.toThrow();
    const fallback = hostileRecorder.finish(hostileTerminal);
    expect(fallback.events).toEqual([]);
    expect(fallback.droppedEvents).toBe(3);
    expect(fallback.terminal).toEqual({
      result: 'blocked',
      reason: 'trace unavailable',
      segment: 'trace unavailable',
    });
    expect(Object.isFrozen(fallback)).toBe(true);
    expect(Object.isFrozen(fallback.terminal)).toBe(true);
  });

  test('bounds traversal work for getter-backed arrays and objects', () => {
    let arrayReads = 0;
    let objectReads = 0;
    const values: unknown[] = [];
    const fields: Record<string, unknown> = {};
    for (let index = 0; index < 10_000; index++) {
      Object.defineProperty(values, index, {
        enumerable: true,
        get() {
          arrayReads++;
          return index === 0 ? 'TOKEN=retained-secret' : `discarded-${index}`;
        },
      });
      Object.defineProperty(fields, `field${index}`, {
        enumerable: true,
        get() {
          objectReads++;
          return index === 0 ? 'TOKEN=retained-secret' : `discarded-${index}`;
        },
      });
    }

    const recorder = createCommandTraceRecorder({
      maxEvents: 2,
      maxListLength: 1,
      maxObjectProperties: 1,
      maxTextLength: 32,
    });
    const started = performance.now();
    expect(() =>
      recorder.record({ kind: 'step', scope: 'global', step: values as never }),
    ).not.toThrow();
    expect(() =>
      recorder.record({ kind: 'step', scope: 'global', step: fields as never }),
    ).not.toThrow();
    const trace = recorder.finish({ result: 'allowed' });

    expect(arrayReads).toBeLessThanOrEqual(4);
    expect(objectReads).toBeLessThanOrEqual(4);
    expect(performance.now() - started).toBeLessThan(100);
    expect(JSON.stringify(trace).length).toBeLessThan(500);
    expect(JSON.stringify(trace)).not.toContain('retained-secret');
  });

  test('bounds cyclic and over-depth event values without dropping the event', () => {
    const cyclic: Record<string, unknown> = { value: 'safe' };
    cyclic.self = cyclic;
    cyclic.child = { child: { child: { value: 'too-deep' } } };
    const recorder = createCommandTraceRecorder({ maxDepth: 2 });

    expect(() =>
      recorder.record({ kind: 'step', scope: 'global', step: cyclic as never }),
    ).not.toThrow();
    const trace = recorder.finish({ result: 'allowed' });

    expect(trace.events).toHaveLength(1);
    expect(trace.droppedEvents).toBe(0);
    expect(JSON.stringify(trace)).not.toContain('too-deep');
    expect(JSON.stringify(trace).length).toBeLessThan(500);
  });

  test('sanitizes property keys with deterministic collision and truncation behavior', () => {
    const recorder = createCommandTraceRecorder({ maxTextLength: 32 });
    recorder.record({
      kind: 'step',
      scope: 'global',
      step: {
        type: 'parse',
        ghp_abcdefghijklmnopqrstuvwxyz: 'first-retained',
        npm_abcdefghijklmnopqrstuvwxyz: 'second-discarded',
        NORMAL_ENV: 'preserved',
      } as never,
    });
    const trace = recorder.finish({ result: 'allowed' });
    const step = trace.events[0]?.step as unknown as Record<string, unknown>;

    expect(step).toEqual({
      type: 'parse',
      '<redacted>': 'first-retained',
      NORMAL_ENV: 'preserved',
    });
    expect(Object.keys(step)).toEqual(['type', '<redacted>', 'NORMAL_ENV']);
    expect(JSON.stringify(trace)).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(trace)).not.toContain('npm_abcdefghijklmnopqrstuvwxyz');
    expect(JSON.stringify(trace)).not.toContain('second-discarded');

    const bounded = createCommandTraceRecorder({ maxObjectProperties: 2, maxTextLength: 8 });
    bounded.record({
      kind: 'step',
      scope: 'global',
      step: { type: 'parse', [`ordinary-${'x'.repeat(10_000)}`]: 'safe' } as never,
    });
    const boundedStep = bounded.finish({ result: 'allowed' }).events[0]?.step as unknown as Record<
      string,
      unknown
    >;
    expect(boundedStep).toEqual({ type: 'parse', ordinary: 'safe' });
    expect(JSON.stringify(boundedStep).length).toBeLessThan(100);
  });

  test('parses each unique recursive command only once', () => {
    let parseCount = 0;
    const store = createSemanticFactStore({
      parseCommand: (source, dialect) => {
        parseCount++;
        return parseCommand(source, dialect);
      },
    });

    const evaluation = evaluateCommandWithTrace(
      'bash -c "echo ok" && bash -c "echo ok"',
      { policySnapshot: policySnapshot() },
      undefined,
      store,
    );

    expect(evaluation.analysis).toBeNull();
    expect(parseCount).toBe(2);
  });

  test('caches separate authoritative and compatibility-display dialects once', () => {
    const parsedDialects: Array<string | undefined> = [];
    const store = createSemanticFactStore({
      parseCommand: (source, dialect) => {
        parsedDialects.push(dialect);
        return parseCommand(source, dialect);
      },
    });

    const evaluation = evaluateCommandWithTrace(
      String.raw`Remove-Item C:\Windows -Recurse -Force`,
      { policySnapshot: policySnapshot() },
      undefined,
      store,
    );

    expect(evaluation.analysis).not.toBeNull();
    expect(parsedDialects).toEqual(['auto', 'posix']);
  });

  test('ordinary enforcement does not compute trace-only Git detail', () => {
    const detailed = spyOn(gitAnalysis, 'analyzeGitDetailed');
    try {
      analyzeCommand('git status', { policySnapshot: policySnapshot() });
      expect(detailed).not.toHaveBeenCalled();

      explainCommand('git status', { policySnapshot: policySnapshot() });
      expect(detailed).toHaveBeenCalledTimes(1);
    } finally {
      detailed.mockRestore();
    }
  });
});
