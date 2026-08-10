import { expect } from 'bun:test';

export function expectTypeScriptProjectCompiles(projectPath: string): void {
  const result = Bun.spawnSync([process.execPath, 'x', 'tsc', '--project', projectPath], {
    stderr: 'pipe',
    stdout: 'pipe',
  });
  expect(result.exitCode).toBe(0);
  expect(`${result.stdout.toString()}${result.stderr.toString()}`).toBe('');
}
