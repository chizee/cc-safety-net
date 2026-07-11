import type { CommandIssue, CommandProgram, CommandView } from '@/domain/command';
import type { ToolCallContext, ToolRoute } from '@/domain/invocation';
import type { ShellKind } from '@/types';

/** @internal */
export type CommandFactUsage = 'input-candidate' | 'declared-command';

/** @internal */
export type ShellSyntaxEntry =
  | { readonly kind: 'word'; readonly text: string }
  | { readonly kind: 'operator'; readonly operator: string; readonly boundary: boolean }
  | {
      readonly kind: 'redirection';
      readonly operator: string;
      readonly role: 'file-read' | 'file-write' | 'here-data';
      readonly targetOrder: 'immediate' | 'legacy-segment';
      readonly target?: string;
    };

/** @internal */
export type ShellSyntaxFacts = {
  readonly status: 'complete' | 'unclosed-quote' | 'invalid';
  readonly source: string;
  readonly entries: readonly ShellSyntaxEntry[];
};

/** @internal */
export type CommandSyntaxFacts = {
  readonly usages: readonly CommandFactUsage[];
  readonly source: string;
  readonly program: CommandProgram;
  readonly views: readonly CommandView[];
  readonly uncertainties: readonly CommandIssue[];
  readonly shell: ShellSyntaxFacts;
};

/** @internal */
export type SemanticFactStore = {
  readonly getShellSyntax: (source: string) => ShellSyntaxFacts;
  readonly getCommandProgram: (source: string, dialect: ShellKind) => CommandProgram;
};

/** @internal */
export type PathFact = {
  readonly raw: string;
  readonly role: 'tool-path' | 'patch-target';
  readonly access: 'read' | 'write' | 'unknown';
};

/** @internal */
export type SemanticFacts = {
  readonly invocation: {
    readonly toolName: string;
    readonly route: ToolRoute;
    readonly context: ToolCallContext;
  };
  readonly commands: readonly CommandSyntaxFacts[];
  readonly paths: readonly PathFact[];
  readonly store: SemanticFactStore;
};
