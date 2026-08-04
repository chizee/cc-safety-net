import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runNativeCommand, runNativeCommands } from '../../../src/integrations/install/native';
import { makeTempHome } from '../hook-helpers';

describe('runNativeCommand failures', () => {
  test('surfaces the spawn failure reason when the binary is missing', () => {
    const command = ['cc-safety-net-no-such-binary-xyz', '--version'] as const;
    const message = (() => {
      try {
        runNativeCommand(command);
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    })();

    const lines = message.split('\n');

    expect(lines[0]).toBe('Failed to run cc-safety-net-no-such-binary-xyz --version.');
    expect(message).not.toContain('(exit');
    expect(lines[1]).toContain('cc-safety-net-no-such-binary-xyz');
  });

  test('reports the exit code, stdout and stderr on a nonzero exit', () => {
    const command = ['sh', '-c', 'echo out; echo err >&2; exit 3'] as const;

    const message = (() => {
      try {
        runNativeCommand(command);
        return '';
      } catch (error) {
        return (error as Error).message;
      }
    })();

    expect(message).toBe(
      'Failed to run sh -c echo out; echo err >&2; exit 3 (exit 3).\nout\n\nerr',
    );
  });
});

describe('runNativeCommands sequencing', () => {
  test('aborts at the first failing command and propagates its error', () => {
    const dir = makeTempHome('safety-net-native-commands');

    expect(() =>
      runNativeCommands([
        ['sh', '-c', `touch ${join(dir, 'first')}`],
        ['sh', '-c', 'exit 4'],
        ['sh', '-c', `touch ${join(dir, 'third')}`],
      ]),
    ).toThrow(/exit 4/);

    expect(existsSync(join(dir, 'first'))).toBe(true);
    expect(existsSync(join(dir, 'third'))).toBe(false);
  });
});
