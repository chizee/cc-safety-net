import { describe, expect, test } from 'bun:test';
import { HOOK_INPUT_MAX_BYTES, readBoundedHookInput } from '@/integrations/hook/common';
import {
  getHookDenyReason,
  type HookFormat,
  runAntigravityHook,
  runCodingCliHook,
  runCopilotHook,
  runGeminiHook,
  runKimiHook,
} from '../hook-helpers';

describe('bounded hook input', () => {
  test('counts raw bytes across chunk boundaries, including multibyte text', async () => {
    const exact = 'x'.repeat(HOOK_INPUT_MAX_BYTES - 4);
    expect(await readBoundedHookInput([Buffer.from(exact), Buffer.from('😀')])).toBe(`${exact}😀`);
    await expect(
      readBoundedHookInput([Buffer.from(exact), Buffer.from('😀'), Buffer.from('x')]),
    ).rejects.toThrow('hook input byte limit exceeded');
  });

  test('stops and cancels input immediately at the first overflowing chunk', async () => {
    let nextCalls = 0;
    let returnCalls = 0;
    let destroyCalls = 0;
    const chunks = [Buffer.alloc(HOOK_INPUT_MAX_BYTES), Buffer.from('x'), Buffer.from('unread')];
    const input = {
      [Symbol.asyncIterator]() {
        return this;
      },
      next: async () => {
        const value = chunks[nextCalls++];
        return value ? { done: false as const, value } : { done: true as const, value: undefined };
      },
      return: async () => {
        returnCalls++;
        return { done: true as const, value: undefined };
      },
      destroy: () => {
        destroyCalls++;
      },
    };

    await expect(readBoundedHookInput(input)).rejects.toThrow('hook input byte limit exceeded');
    expect(nextCalls).toBe(2);
    expect(returnCalls).toBe(1);
    expect(destroyCalls).toBe(1);
  });

  test.each([
    ['coding-cli', 'claude-code', runCodingCliHook],
    ['gemini-cli', 'gemini-cli', runGeminiHook],
    ['kimi-code', 'kimi-code', runKimiHook],
    ['copilot-cli', 'copilot-cli', runCopilotHook],
    ['antigravity-cli', 'antigravity-cli', runAntigravityHook],
  ] as const)('fails closed once for oversized %s protocol input', async (_name, format, run) => {
    const result = await run(`{"padding":"${'x'.repeat(HOOK_INPUT_MAX_BYTES)}"}`);

    expect(getHookDenyReason(result, format as HookFormat)).toContain(
      'Failed to parse hook input JSON.',
    );
    expect(result.stdout.split('\n')).toHaveLength(1);
  });
});
