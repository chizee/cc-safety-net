import type { CustomRule } from '@/ir/policy';

interface RulebookFixture {
  command: string;
  expect: 'blocked' | 'allowed';
  rule?: string;
}

export interface Rulebook {
  rulebook_version: 1;
  name: string;
  version: string;
  description?: string;
  author?: string;
  allowed_commands: string[];
  rules: CustomRule[];
  tests?: RulebookFixture[];
}
