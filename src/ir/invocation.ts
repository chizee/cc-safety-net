/** @internal */
export type CommandToolKind = 'posix' | 'powershell' | 'auto';

/** @internal */
export type NonCommandToolInputKind = 'patch' | 'path' | 'grep' | 'glob' | 'unknown';

type NonCommandToolRoute = {
  [Kind in NonCommandToolInputKind]: { kind: Kind };
}[NonCommandToolInputKind];

/** @internal */
export type ToolRoute = { kind: 'command'; shell: CommandToolKind } | NonCommandToolRoute;

/** @internal */
export type ToolCallContext = {
  configCwd: string;
  executionCwd: string;
  policyConfigCwds?: readonly string[];
};

type ToolInvocationBase = {
  toolName: string;
  input: unknown;
  context: ToolCallContext;
};

/** @internal */
export type ToolInvocation =
  | (ToolInvocationBase & {
      route: Extract<ToolRoute, { kind: 'command' }>;
      command: string | null;
    })
  | (ToolInvocationBase & {
      route: Exclude<ToolRoute, { kind: 'command' }>;
    });

/** @internal */
export function createToolInvocation(
  toolName: string,
  input: unknown,
  route: ToolRoute,
  context: ToolCallContext,
  command: string | null,
): ToolInvocation {
  if (route.kind !== 'command') return { toolName, input, route, context };
  return { toolName, input, route, context, command };
}
