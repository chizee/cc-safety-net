import type {
  CommandIssue,
  CommandNode,
  CommandProgram,
  CommandRedirection,
  CommandView,
  CommandWord,
  CommandWordPart,
  WordProvenance,
} from '@/ir/command';

/** @internal */
export function createCommandNodes() {
  return [] as CommandNode[];
}

/** @internal */
export function createCommandIssues() {
  return [] as CommandIssue[];
}

/** @internal */
export function createCommandAccumulator() {
  return {
    words: [] as CommandWord[],
    redirections: [] as CommandRedirection[],
    nested: [] as CommandProgram[],
    start: -1,
    end: -1,
    reset() {
      this.words = [];
      this.redirections = [];
      this.nested = [];
      this.start = -1;
      this.end = -1;
    },
  };
}

/** @internal */
export function freezeCommandView(command: CommandView): CommandView {
  return Object.freeze({
    ...command,
    span: Object.freeze(command.span),
    words: Object.freeze(command.words),
    redirections: Object.freeze(
      command.redirections.map((redirection) =>
        Object.freeze({
          ...redirection,
          span: Object.freeze(redirection.span),
          ...(redirection.heredoc
            ? {
                heredoc: Object.freeze({
                  ...redirection.heredoc,
                  bodySpan: Object.freeze(redirection.heredoc.bodySpan),
                  terminatorSpan: Object.freeze(redirection.heredoc.terminatorSpan),
                }),
              }
            : {}),
        }),
      ),
    ),
    nested: Object.freeze(command.nested.map((program) => freezeCommandProgram(program))),
  });
}

/** @internal */
export function appendAccumulatedCommand(
  nodes: CommandNode[],
  accumulator: ReturnType<typeof createCommandAccumulator>,
  command: CommandView,
) {
  nodes.push(command);
  accumulator.reset();
}

/** @internal */
export function appendCommandWordPart(
  parts: CommandWordPart[],
  source: string,
  start: number,
  end: number,
  provenance: WordProvenance,
) {
  if (end <= start) return;
  parts.push({ raw: source.slice(start, end), span: { start, end }, provenance });
}

/** @internal */
export function createCommandWordParts(source: string) {
  const parts: CommandWordPart[] = [];
  return {
    parts,
    push: (start: number, end: number, provenance: WordProvenance) =>
      appendCommandWordPart(parts, source, start, end, provenance),
  };
}

/** @internal */
export function freezeCommandWord(
  word: Omit<CommandWord, 'kind' | 'parts'> & Pick<Partial<CommandWord>, 'parts'>,
): CommandWord {
  const parts = word.parts ?? [
    {
      raw: word.raw,
      span: word.span,
      provenance: word.provenance,
    },
  ];
  return Object.freeze({
    kind: 'word',
    ...word,
    span: Object.freeze(word.span),
    parts: Object.freeze(
      parts.map((part) => Object.freeze({ ...part, span: Object.freeze(part.span) })),
    ),
  });
}

/** @internal */
export function freezeParsedCommandWord(
  source: string,
  start: number,
  end: number,
  text: string,
  provenance: WordProvenance,
  quoted: boolean,
  parts?: CommandWordPart[],
) {
  return freezeCommandWord({
    text,
    raw: source.slice(start, end),
    span: { start, end },
    provenance,
    quoted,
    ...(parts ? { parts } : {}),
  });
}

/** @internal */
export function freezeCommandProgram(program: CommandProgram): CommandProgram {
  return Object.freeze({
    ...program,
    span: Object.freeze(program.span),
    issues: Object.freeze(
      program.issues.map((issue) => Object.freeze({ ...issue, span: Object.freeze(issue.span) })),
    ),
    nodes: Object.freeze(
      program.nodes.map((node) => {
        if (node.kind === 'command') return freezeCommandView(node);
        if (node.kind === 'group' || node.kind === 'function') {
          return Object.freeze({
            ...node,
            span: Object.freeze(node.span),
            body: freezeCommandProgram(node.body),
          });
        }
        return Object.freeze({ ...node, span: Object.freeze(node.span) });
      }),
    ),
  });
}
