import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeCommand } from '@/core/analyze';
import { blockedSegment, withEnv } from '../../helpers';
import { behavioralContractCases } from './behavioral-contract-cases';

const root = mkdtempSync(join(tmpdir(), 'cc-safety-net-contract-'));
const cwd = join(root, 'workspace');
mkdirSync(cwd);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('analyzeCommand behavioral contract', () => {
  for (const contractCase of behavioralContractCases({ cwd, home: homedir() })) {
    test(contractCase.name, () => {
      const result = withEnv(
        {
          CC_SAFETY_NET_LEVEL: '',
          CC_SAFETY_NET_STRICT: '',
          SAFETY_NET_STRICT: '',
          CC_SAFETY_NET_PARANOID: '',
          SAFETY_NET_PARANOID: '',
          CC_SAFETY_NET_PARANOID_RM: '',
          SAFETY_NET_PARANOID_RM: '',
          CC_SAFETY_NET_PARANOID_INTERPRETERS: '',
          SAFETY_NET_PARANOID_INTERPRETERS: '',
          CC_SAFETY_NET_WORKTREE: '',
          SAFETY_NET_WORKTREE: '',
        },
        () => analyzeCommand(contractCase.command, contractCase.options),
      );

      if (contractCase.expected.kind === 'allow') {
        expect(result).toBeNull();
        return;
      }

      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe(contractCase.expected.ruleId);
      expect(result?.intent).toBe(contractCase.expected.intent);
      expect(result?.reason).toContain(contractCase.expected.reasonIncludes);
      if (contractCase.expected.segment !== undefined) {
        expect(blockedSegment(result)).toBe(contractCase.expected.segment);
      }
    });
  }
});
