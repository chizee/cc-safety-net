import type { CommandIssue, CommandNode, CommandProgram, CommandRedirection, CommandView, CommandWord, CommandWordPart, WordProvenance } from '@/domain/command';
/** @internal */
export declare function createCommandNodes(): CommandNode[];
/** @internal */
export declare function createCommandIssues(): CommandIssue[];
/** @internal */
export declare function createCommandAccumulator(): {
    words: CommandWord[];
    redirections: CommandRedirection[];
    nested: CommandProgram[];
    start: number;
    end: number;
    reset(): void;
};
/** @internal */
export declare function freezeCommandView(command: CommandView): CommandView;
/** @internal */
export declare function appendAccumulatedCommand(nodes: CommandNode[], accumulator: ReturnType<typeof createCommandAccumulator>, command: CommandView): void;
/** @internal */
export declare function appendCommandWordPart(parts: CommandWordPart[], source: string, start: number, end: number, provenance: WordProvenance): void;
/** @internal */
export declare function createCommandWordParts(source: string): {
    parts: CommandWordPart[];
    push: (start: number, end: number, provenance: WordProvenance) => void;
};
/** @internal */
export declare function freezeCommandWord(word: Omit<CommandWord, 'kind' | 'parts'> & Pick<Partial<CommandWord>, 'parts'>): CommandWord;
/** @internal */
export declare function freezeParsedCommandWord(source: string, start: number, end: number, text: string, provenance: WordProvenance, quoted: boolean, parts?: CommandWordPart[]): CommandWord;
/** @internal */
export declare function freezeCommandProgram(program: CommandProgram): CommandProgram;
