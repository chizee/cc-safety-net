import { describe, expect, test } from 'bun:test';
import {
  findHookIntegrationByFlag,
  findLegacyTopLevelHookIntegration,
  hookIntegrations,
} from '@/cli/hook-integrations';

describe('hook integration registry', () => {
  test('finds hook integrations by nested hook flags', () => {
    expect(findHookIntegrationByFlag(['--agy-cli'])?.id).toBe('antigravity-cli');
    expect(findHookIntegrationByFlag(['-ac'])?.id).toBe('antigravity-cli');
    expect(findHookIntegrationByFlag(['--coding-cli'])?.id).toBe('claude-code');
    expect(findHookIntegrationByFlag(['--claude-code'])?.id).toBe('claude-code');
    expect(findHookIntegrationByFlag(['-cp'])?.id).toBe('copilot-cli');
    expect(findHookIntegrationByFlag(['-gc'])?.id).toBe('gemini-cli');
    expect(findHookIntegrationByFlag(['-gb'])?.id).toBe('grok-build');
    expect(findHookIntegrationByFlag(['--grok-build'])?.id).toBe('grok-build');
    expect(findHookIntegrationByFlag(['--kimi-code'])?.id).toBe('kimi-code');
    expect(findHookIntegrationByFlag(['-ha'])?.id).toBe('hermes-agent');
    expect(findHookIntegrationByFlag(['--hermes-agent'])?.id).toBe('hermes-agent');
    expect(findHookIntegrationByFlag(['--openclaw'])).toBeUndefined();
    expect(findHookIntegrationByFlag(['--unknown'])).toBeUndefined();
  });

  test('names nothing when the arguments name two integrations or trailing input', () => {
    expect(findHookIntegrationByFlag(['--claude-code', '--kimi-code'])).toBeUndefined();
    expect(findHookIntegrationByFlag(['install', '--kimi-code'])).toBeUndefined();
    expect(findHookIntegrationByFlag([])).toBeUndefined();
  });

  test('limits legacy top-level aliases to existing legacy integrations', () => {
    expect(findLegacyTopLevelHookIntegration('--agy-cli')).toBeUndefined();
    expect(findLegacyTopLevelHookIntegration('-ac')).toBeUndefined();
    expect(findLegacyTopLevelHookIntegration('--coding-cli')).toBeUndefined();
    expect(findLegacyTopLevelHookIntegration('-cc')?.id).toBe('claude-code');
    expect(findLegacyTopLevelHookIntegration('--claude-code')?.id).toBe('claude-code');
    expect(findLegacyTopLevelHookIntegration('-cp')?.id).toBe('copilot-cli');
    expect(findLegacyTopLevelHookIntegration('-gc')?.id).toBe('gemini-cli');
    expect(findLegacyTopLevelHookIntegration('--grok-build')).toBeUndefined();
    expect(findLegacyTopLevelHookIntegration('--kimi-code')).toBeUndefined();
    expect(findLegacyTopLevelHookIntegration('--hermes-agent')).toBeUndefined();
    expect(findLegacyTopLevelHookIntegration(undefined)).toBeUndefined();
  });

  test('keeps Kimi Code in hook help metadata without top-level compatibility', () => {
    const kimi = hookIntegrations.find((integration) => integration.id === 'kimi-code');

    expect(kimi?.displayName).toBe('Kimi Code');
    expect(kimi?.flags).toEqual(['-kc', '--kimi-code']);
    expect(kimi?.legacyTopLevelFlags).toEqual([]);
  });
});
