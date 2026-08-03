import type { CommandNode, CommandProgram, CommandView } from '@/domain/command';

/** @internal */
export function* walkCommandViews(program: CommandProgram): Generator<CommandView> {
  for (const node of program.nodes) {
    yield* walkNode(node);
  }
}

/** @internal */
export function projectCommandViews(program: CommandProgram): readonly CommandView[] {
  return Object.freeze([...walkCommandViews(program)]);
}

/** @internal Command segments as their word texts, for trace display and fixture matching. */
export function projectSegmentWords(program: CommandProgram): readonly (readonly string[])[] {
  return Object.freeze(
    projectCommandViews(program).map((view) => Object.freeze(view.words.map((word) => word.text))),
  );
}

function* walkNode(node: CommandNode): Generator<CommandView> {
  if (node.kind === 'command') {
    yield node;
    for (const nested of node.nested) yield* walkCommandViews(nested);
    return;
  }
  if (node.kind === 'group') yield* walkCommandViews(node.body);
}
