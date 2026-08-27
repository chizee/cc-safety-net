import type { BlockIntent } from '@/ir/decision';
import type { CustomRule, CustomRuleMatch } from '@/ir/policy';

interface RulebookFixture {
  command: string;
  expect: 'blocked' | 'allowed';
  rule?: string;
}

interface CustomRuleV2 {
  name: string;
  command: string;
  match: CustomRuleMatch;
  reason: string;
  intent?: BlockIntent;
}

interface RulebookBase {
  name: string;
  version: string;
  description?: string;
  author?: string;
  allowed_commands: string[];
  tests?: RulebookFixture[];
}

export type Rulebook =
  | (RulebookBase & { rulebook_version: 1; rules: CustomRule[] })
  | (RulebookBase & { rulebook_version: 2; rules: CustomRuleV2[] });
