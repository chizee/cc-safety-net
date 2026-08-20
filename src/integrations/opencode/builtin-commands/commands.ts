import type {
  BuiltinCommands,
  CommandDefinition,
} from '@/integrations/opencode/builtin-commands/types';
import { CC_SAFETY_NET_TEMPLATE } from '@/integrations/templates/cc-safety-net';

export function loadBuiltinCommands(): BuiltinCommands {
  const definition: CommandDefinition = {
    description: 'Manage CC Safety Net rulebooks',
    template: CC_SAFETY_NET_TEMPLATE.slice(CC_SAFETY_NET_TEMPLATE.indexOf('## Workflow')),
  };

  return { 'cc-safety-net': definition };
}
