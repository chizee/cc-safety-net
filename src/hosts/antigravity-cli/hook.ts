import { isAbsolute, join } from 'node:path';
import { AnalysisLimit, createBudget } from '@/core/budget';
import {
  type CwdDenial,
  createCwdDenial,
  createFailedClosedDenial,
  type IntegrationDenial,
} from '@/core/denial';
import type { Environment, PathResolver } from '@/core/environment';
import { resolveExistingPath } from '@/core/paths/canonicalization';
import {
  extractPatchTargetsFromToolInput,
  extractPathLikeToolValues,
  ToolInputLimitError,
} from '@/core/tool-input';
import {
  cwdProblem,
  firstTrustedRoot,
  getToolRoute,
  isSameOrInsidePath,
  resolveContainedCwd,
} from '@/gate/intake';
import type { CommandToolKind, ToolCallContext } from '@/gate/invocation';
import { runConfiguredHookAdapter } from '@/hosts/hook/common';

export function getAntigravityHooksPath(homeDir: string): string {
  return join(homeDir, '.gemini', 'config', 'hooks.json');
}

interface AntigravityCliHookInput {
  toolCall?: {
    name?: string;
    args?: Record<string, unknown>;
  };
  stepIdx?: number;
  conversationId?: string;
  workspacePaths?: string[];
  transcriptPath?: string;
  artifactDirectoryPath?: string;
}

interface AntigravityCliHookOutput {
  decision: 'deny';
  reason: string;
}

const ANTIGRAVITY_CLI_COMMAND_TOOLS = new Map<string, CommandToolKind>([['run_command', 'auto']]);
const ANTIGRAVITY_PATH_KEYS = new Set([
  'absolutepath',
  'directorypath',
  'file_path',
  'filepath',
  'path',
  'searchdirectory',
  'searchpath',
  'target_file',
  'targetfile',
]);

function getAntigravityCliToolRoute(toolName: string) {
  return getToolRoute(toolName, ANTIGRAVITY_CLI_COMMAND_TOOLS);
}

type AntigravityDenyOutput = (denial: IntegrationDenial) => void;

export async function runAntigravityCliHook(): Promise<void> {
  await runConfiguredHookAdapter<AntigravityCliHookInput>({
    agent: 'antigravity-cli',
    createDenyOutput: (message): AntigravityCliHookOutput => ({
      decision: 'deny',
      reason: message,
    }),
    isSupported: () => true,
    getToolName: (input) => input.toolCall?.name,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: normalizeAntigravityToolArgs(input.toolCall?.args, toolName),
      route: getAntigravityCliToolRoute(toolName),
    }),
    getContext: resolveAntigravityContext,
    getSessionId: (input) => input.conversationId,
  });
}

function resolveAntigravityContext(
  input: AntigravityCliHookInput,
  toolInput: unknown,
  toolName: string,
  outputDeny: AntigravityDenyOutput,
  environment: Environment,
): ToolCallContext | null {
  const workspacePaths = requestedWorkspacePaths(input);
  if (!workspacePaths[0]) {
    outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
    return null;
  }
  const configRoots = workspacePaths.flatMap((root) => {
    const canonicalRoot = firstTrustedRoot([root], environment.paths);
    return canonicalRoot ? [canonicalRoot] : [];
  });
  if (!configRoots[0]) {
    outputAntigravityCwdDeny(outputDeny, toolInput, toolName, {
      directory: 'session',
      problem: 'unusable',
      cwd: workspacePaths[0],
    });
    return null;
  }
  if (toolName !== 'run_command') {
    let targetRoot: string | null;
    try {
      targetRoot = resolveAntigravityTargetRoot(
        toolInput,
        toolName,
        configRoots,
        environment.paths,
      );
    } catch (error) {
      if (error instanceof ToolInputLimitError) {
        outputAntigravityCwdDeny(outputDeny, undefined, toolName);
        return null;
      }
      if (!(error instanceof AnalysisLimit)) throw error;
      outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
      return null;
    }
    if (!targetRoot) {
      outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
      return null;
    }
    return { configCwd: targetRoot, executionCwd: targetRoot };
  }

  const args = input.toolCall?.args;
  if (!args || !Object.hasOwn(args, 'Cwd')) {
    return { configCwd: configRoots[0], executionCwd: configRoots[0] };
  }
  const cwd = args.Cwd;
  if (typeof cwd !== 'string' || cwd.trim() === '') {
    outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
    return null;
  }

  const containedCwd = resolveContainedCwd(cwd, configRoots, environment.paths);
  if (containedCwd) {
    const configCwd = mostSpecificContainingRoot(containedCwd, configRoots);
    if (!configCwd) {
      outputAntigravityCwdDeny(outputDeny, toolInput, toolName);
      return null;
    }
    return { configCwd, executionCwd: containedCwd };
  }

  outputAntigravityCwdDeny(outputDeny, toolInput, toolName, {
    directory: 'requested',
    problem: cwdProblem(cwd, configRoots[0], environment.paths),
    cwd,
  });
  return null;
}

function resolveAntigravityTargetRoot(
  toolInput: unknown,
  toolName: string,
  configRoots: readonly string[],
  paths: PathResolver,
): string | null {
  const route = getAntigravityCliToolRoute(toolName);
  const targets = [
    ...extractPathLikeToolValues(toolInput, ANTIGRAVITY_PATH_KEYS),
    ...(route.kind === 'patch' ? extractPatchTargetsFromToolInput(toolInput) : []),
  ].filter(isAbsolute);
  const budget = createBudget();
  const targetRoots = new Set(
    targets.flatMap((target) => {
      const root = mostSpecificContainingRoot(
        resolveExistingPath(target, paths, budget),
        configRoots,
      );
      return root ? [root] : [];
    }),
  );
  if (targetRoots.size > 1) return null;
  return [...targetRoots][0] ?? configRoots[0] ?? null;
}

function mostSpecificContainingRoot(path: string, roots: readonly string[]): string | null {
  return (
    roots
      .filter((root) => isSameOrInsidePath(path, root))
      .reduce((best, root) => (root.length > best.length ? root : best), '') || null
  );
}

function outputAntigravityCwdDeny(
  outputDeny: AntigravityDenyOutput,
  toolInput: unknown,
  toolName: string,
  cause?: CwdDenial,
): void {
  const command =
    toolInput && typeof toolInput === 'object'
      ? (toolInput as Record<string, unknown>).command
      : undefined;
  const evidence = { command: typeof command === 'string' ? command : undefined, toolName };
  outputDeny(cause ? createCwdDenial(cause, evidence) : createFailedClosedDenial(evidence));
}

function requestedWorkspacePaths(input: AntigravityCliHookInput): string[] {
  if (input.workspacePaths === undefined) return [process.cwd()];
  return Array.isArray(input.workspacePaths)
    ? input.workspacePaths.filter((path) => typeof path === 'string' && path.trim() !== '')
    : [];
}

function normalizeAntigravityToolArgs(
  args: Record<string, unknown> | undefined,
  toolName: string,
): unknown {
  if (!args) return undefined;
  if (toolName !== 'run_command') return args;
  return {
    ...args,
    command:
      typeof args.CommandLine === 'string' && args.CommandLine !== ''
        ? args.CommandLine
        : undefined,
  };
}
