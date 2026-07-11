import type { CommandNode, CommandProgram, CommandView } from '@/domain/command';

/** @internal */
export function* walkCommandViews(program: CommandProgram): Generator<CommandView> {
  for (const node of program.nodes) {
    yield* walkNode(node);
  }
}

function* walkNode(node: CommandNode): Generator<CommandView> {
  if (node.kind === 'command') {
    yield node;
    for (const nested of node.nested) yield* walkCommandViews(nested);
    return;
  }
  if (node.kind === 'group') yield* walkCommandViews(node.body);
}
