import { describe, expect, test } from 'bun:test';
import { createToolInvocation, type ToolInvocation } from '@/domain/invocation';

describe('tool invocation domain', () => {
  test('requires commands only for command routes', () => {
    const command = {
      toolName: 'Bash',
      input: { command: 'git status' },
      context: { configCwd: '/project', executionCwd: '/project' },
      route: { kind: 'command', shell: 'posix' },
      command: 'git status',
    } satisfies ToolInvocation;
    const path = {
      toolName: 'Read',
      input: { file_path: 'README.md' },
      context: { configCwd: '/project', executionCwd: '/project' },
      route: { kind: 'path' },
    } satisfies ToolInvocation;

    expect(command.command).toBe('git status');
    expect('command' in path).toBe(false);
  });

  test('creates non-command invocations without retaining extracted command text', () => {
    expect(
      createToolInvocation(
        'custom_runner',
        { command: 'git reset --hard' },
        { kind: 'unknown' },
        { configCwd: '/project', executionCwd: '/project' },
        'git reset --hard',
      ),
    ).toEqual({
      toolName: 'custom_runner',
      input: { command: 'git reset --hard' },
      route: { kind: 'unknown' },
      context: { configCwd: '/project', executionCwd: '/project' },
    });
  });
});
