import { explainCommand } from '@/bin/explain';
import { type TestExplainOptions, testExplainOptions } from '../../helpers/policy';

export function explainTestCommand(command: string, options?: TestExplainOptions) {
  return explainCommand(
    command,
    testExplainOptions({ config: { version: 1, rules: [] }, ...options }),
  );
}
