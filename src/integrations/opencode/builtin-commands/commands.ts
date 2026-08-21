import type { BuiltinCommands } from '@/integrations/opencode/builtin-commands/types';
import { CC_SAFETY_NET_TEMPLATE } from '@/integrations/templates/cc-safety-net';

export function loadBuiltinCommands(): BuiltinCommands {
  return {
    'cc-safety-net': {
      description: 'Manage CC Safety Net rulebooks',
      template: CC_SAFETY_NET_TEMPLATE.slice(CC_SAFETY_NET_TEMPLATE.indexOf('## Workflow')),
    },
  };
}
