import { describe, expect, test } from 'bun:test';
import { formatBlockedMessage } from '@/integrations/format';

describe('formatBlockedMessage', () => {
  test('includes reason in output', () => {
    const result = formatBlockedMessage({ reason: 'test reason' });
    expect(result).toContain('BLOCKED by CC Safety Net');
    expect(result).toContain('Reason: test reason');
  });

  test('includes command when provided', () => {
    const result = formatBlockedMessage({
      reason: 'test reason',
      command: 'rm -rf /',
    });
    expect(result).toContain('Command: rm -rf /');
  });

  test('includes tool name when provided', () => {
    const result = formatBlockedMessage({
      reason: 'test reason',
      command: 'rm -rf /',
      toolName: 'Bash',
    });
    expect(result).toContain('Tool: Bash');
    expect(result.indexOf('Reason:')).toBeLessThan(result.indexOf('Tool: Bash'));
    expect(result.indexOf('Tool: Bash')).toBeLessThan(result.indexOf('Command:'));
  });

  test('redacts the config warning and omits the line without one', () => {
    const result = formatBlockedMessage({
      reason: 'test reason',
      configWarning: 'invalid policy config: token sk-proj_1234567890abcdefghijklmnopqrstuv',
      redact: (text) => text.replace(/sk-proj_[A-Za-z0-9]+/g, '<redacted>'),
    });
    expect(result).toContain('Config warning: invalid policy config: token <redacted>');
    expect(formatBlockedMessage({ reason: 'test reason' })).not.toContain('Config warning:');
  });

  test('omits tool line when tool name is absent', () => {
    const result = formatBlockedMessage({ reason: 'test reason' });
    expect(result).not.toContain('Tool:');
  });

  test('includes segment when provided', () => {
    const result = formatBlockedMessage({
      reason: 'test reason',
      segment: 'git reset --hard',
    });
    expect(result).toContain('Segment: git reset --hard');
  });

  test('includes both command and segment when different', () => {
    const result = formatBlockedMessage({
      reason: 'test reason',
      command: 'full command here',
      segment: 'git reset --hard',
    });
    expect(result).toContain('Command: full command here');
    expect(result).toContain('Segment: git reset --hard');
  });

  test('does not duplicate segment when same as command', () => {
    const result = formatBlockedMessage({
      reason: 'test reason',
      command: 'git reset --hard',
      segment: 'git reset --hard',
    });
    expect(result).toContain('Command: git reset --hard');
    const segmentMatches = result.match(/Segment:/g);
    expect(segmentMatches).toBeNull();
  });

  test('truncates long commands with maxLen', () => {
    const longCommand = 'a'.repeat(300);
    const result = formatBlockedMessage({
      reason: 'test reason',
      command: longCommand,
      maxLen: 50,
    });
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(longCommand.length + 100);
  });

  test('uses default maxLen of 200', () => {
    const longCommand = 'a'.repeat(300);
    const result = formatBlockedMessage({
      reason: 'test reason',
      command: longCommand,
    });
    expect(result).toContain('...');
  });

  test('does not truncate short commands', () => {
    const shortCommand = 'rm -rf /';
    const result = formatBlockedMessage({
      reason: 'test reason',
      command: shortCommand,
    });
    expect(result).toContain(`Command: ${shortCommand}`);
    expect(result).not.toContain('...');
  });

  test('includes footer about asking user', () => {
    const result = formatBlockedMessage({ reason: 'test reason' });
    expect(result).toContain('ask the user');
  });

  test('includes rule id when provided', () => {
    const result = formatBlockedMessage({
      reason: 'test reason',
      ruleId: 'git.push-force',
    });
    expect(result).toContain('Rule: git.push-force');
  });

  test.each([
    ['hard_stop', 'Do not retry this operation or attempt any workaround'],
    ['use_alternative', 'Continue the task using the safer alternative described above'],
    ['scope_down', 'Retry with a narrower, explicit target as described above'],
    ['manual_only', 'ask the user for explicit permission'],
    ['stop_and_explain', 'Do not brute-force variants'],
  ] as const)('uses %s footer', (intent, expected) => {
    const result = formatBlockedMessage({ reason: 'test reason', intent });
    expect(result).toContain(expected);
  });

  test('applies redact function to command', () => {
    const redactFn = (text: string) => text.replace(/secret/g, '***');
    const result = formatBlockedMessage({
      reason: 'test reason',
      command: 'rm -rf /secret/path',
      redact: redactFn,
    });
    expect(result).toContain('Command: rm -rf /***/path');
    expect(result).not.toContain('secret');
  });

  test('applies redact function to reason', () => {
    const redactFn = (text: string) => text.replace(/secret/g, '***');
    const result = formatBlockedMessage({
      reason: 'invalid policy JSON near secret',
      redact: redactFn,
    });

    expect(result).toContain('Reason: invalid policy JSON near ***');
    expect(result).not.toContain('secret');
  });

  test('applies redact function to segment', () => {
    const redactFn = (text: string) => text.replace(/password/g, '***');
    const result = formatBlockedMessage({
      reason: 'test reason',
      command: 'full command',
      segment: 'echo password',
      redact: redactFn,
    });
    expect(result).toContain('Segment: echo ***');
    expect(result).not.toContain('password');
  });
});
