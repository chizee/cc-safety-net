import type { NonCommandToolInputKind } from '@/domain/invocation';
export declare function normalizeToolName(toolName: string): string;
export declare function getNonCommandToolInputKind(toolName: string): NonCommandToolInputKind;
export declare function getCommandFromToolInput(input: unknown): string | undefined;
export declare function extractPathLikeToolValues(input: unknown, pathLikeKeys: ReadonlySet<string>): string[];
export declare function extractPatchTargetsFromToolInput(input: unknown): string[];
