/**
 * `policy check` and `policy apply`: the human gesture behind every policy write.
 * The agent proposes a policy JSON and verifies it with `check`; `apply` is
 * the terminal command the human runs, so it confirms interactively and refuses
 * to run without a TTY. There is deliberately no `--yes` and no non-interactive
 * mode — an invocation laundered past the guard would otherwise apply silently.
 * A project proposal is written with only the fields it sets, so everything it
 * leaves out keeps inheriting from the user policy, and its diff compares the
 * effective user-plus-project merge — the level a sparse proposal would drop or
 * restore has to be visible in the confirmation the human reads.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { parseCommandArgs } from '@/cli/args';
import { policyCommand } from '@/cli/commands/policy';
import { printCommandHelp } from '@/cli/help';
import {
  getProjectPolicyPath,
  getUserPolicyDiagnostics,
  mergeProjectPolicy,
  projectPolicyProjection,
} from '@/engine/facade';
import type { GuiPolicy } from '@/ir/policy';
import { getUserPolicyPath, normalizeGuiPolicy, writeUserPolicyFromGui } from '@/policy/store';
import { writeJsonAtomic } from '@/rules/policy/config-file';

type PolicyCommandOptions = {
  cwd?: string;
  /** Confirmation seams, so the prompt is exercised without a real terminal. */
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
};

const POLICY_SUBCOMMANDS = new Set(['check', 'apply']);
const UNSET = '(unset)';

export async function runPolicyCommand(
  args: readonly string[],
  options: PolicyCommandOptions = {},
): Promise<number> {
  const parsed = parseCommandArgs(
    { label: 'policy', booleans: { global: ['-g', '--global'] }, positionals: 'list' },
    args,
  );
  const subcommand = parsed.positionals[0];
  const errors = [
    ...parsed.errors,
    ...(subcommand && !POLICY_SUBCOMMANDS.has(subcommand)
      ? [`Unknown policy subcommand: ${subcommand}`]
      : []),
    ...(subcommand && POLICY_SUBCOMMANDS.has(subcommand) && !parsed.positionals[1]
      ? [`policy ${subcommand} requires a file`]
      : []),
    ...parsed.positionals.slice(2).map((extra) => `Unexpected policy argument: ${extra}`),
  ];
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    return 1;
  }
  const file = parsed.positionals[1];
  if (!subcommand || !file) {
    printCommandHelp(policyCommand, console.error);
    return 1;
  }

  const targetPath = parsed.flags.global
    ? getUserPolicyPath()
    : getProjectPolicyPath(options.cwd ?? process.cwd());
  const proposal = readPolicyJson(file);
  const diagnostics = [
    ...proposal.errors,
    ...getUserPolicyDiagnostics(proposal.value).map((error) => `${file}: ${error}`),
    // Writing while silently omitting a validated section would let apply claim
    // success for a policy that is not the one the proposal described.
    ...(!parsed.flags.global && isRecord(proposal.value) && proposal.value.audit !== undefined
      ? [
          `${file}: audit settings are user scope only; remove the audit section from a project proposal`,
        ]
      : []),
  ];
  if (diagnostics.length > 0) {
    for (const diagnostic of diagnostics) console.error(diagnostic);
    return 1;
  }

  const proposed = normalizeGuiPolicy(proposal.value);
  console.log(`Scope: ${parsed.flags.global ? 'user' : 'project'} (${targetPath})`);
  console.log(`Proposal: ${file}`);
  if (parsed.flags.global) {
    printPolicyDiff(normalizeGuiPolicy(readPolicyJson(targetPath).value), proposed, true);
  }
  if (!parsed.flags.global) {
    const user = normalizeGuiPolicy(readPolicyJson(getUserPolicyPath()).value);
    console.log('Effective policy (user + project merged):');
    printPolicyDiff(
      mergeProjectPolicy(user, projectPolicyProjection(readPolicyJson(targetPath).value).policy)
        .policy,
      mergeProjectPolicy(user, projectPolicyProjection(proposal.value).policy).policy,
      false,
    );
  }
  if (subcommand === 'check') return 0;

  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  if (!input.isTTY || !output.isTTY) {
    console.error('policy apply confirms interactively; run this yourself in a terminal:');
    console.error(`  cc-safety-net policy apply ${file}${parsed.flags.global ? ' --global' : ''}`);
    return 1;
  }
  const confirmed = await confirmApply(`Apply this policy to ${targetPath}? [y/N] `, input, output);
  if (!confirmed) {
    console.log('Cancelled; nothing was written.');
    return 0;
  }

  writeScopePolicy(targetPath, proposal.value, proposed, parsed.flags.global);
  console.log(`Policy applied: ${targetPath}`);
  return 0;
}

function confirmApply(
  question: string,
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream,
): Promise<boolean> {
  const prompt = createInterface({ input, output, terminal: false });
  return new Promise((resolve) => {
    // EOF (Ctrl-D) closes the stream without ever delivering a line; treat it as
    // a decline so the command cannot hang on a callback that will never fire.
    // The answer callback resolves before closing: close() emits synchronously,
    // and resolving after it would let the decline win over a typed yes.
    prompt.once('close', () => resolve(false));
    prompt.question(question, (answer) => {
      resolve(/^y(es)?$/i.test(answer.trim()));
      prompt.close();
    });
  });
}

function writeScopePolicy(
  path: string,
  proposalValue: unknown,
  normalized: GuiPolicy,
  global: boolean,
): void {
  if (global) {
    writeUserPolicyFromGui(normalized);
    return;
  }
  // Only the fields the proposal sets are written: a field absent from the project
  // file inherits from the user policy at load time, and writing defaults instead
  // would silently pin them (e.g. materialize level "standard" under a strict user).
  const value = isRecord(proposalValue) ? proposalValue : {};
  mkdirSync(dirname(path), { recursive: true });
  writeJsonAtomic(path, {
    version: normalized.version,
    ...Object.fromEntries(
      ['safety', 'workflow', 'destructive_command_protection', 'secret_protection']
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, value[key]]),
    ),
  });
}

/** Reads one policy file's JSON; a non-empty `errors` means the caller must stop. */
function readPolicyJson(path: string): { value?: unknown; errors: string[] } {
  if (!existsSync(path)) return { errors: [`${path}: file not found`] };
  try {
    return { value: JSON.parse(readFileSync(path, 'utf-8')) as unknown, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      errors: [`${path}: ${error instanceof SyntaxError ? `Invalid JSON: ${message}` : message}`],
    };
  }
}

/**
 * The whole diff: the policy file shape is fixed and small, so one flat map of
 * `field.path` to displayed value covers it without a diff library. Audit belongs
 * to the user scope only and drops out of a project-scope comparison.
 */
function printPolicyDiff(current: GuiPolicy, proposed: GuiPolicy, global: boolean): void {
  const before = flattenPolicy(current, global);
  const after = flattenPolicy(proposed, global);
  const lines = [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((field) =>
    before[field] === after[field]
      ? []
      : [`  ${field}: ${before[field] ?? UNSET} -> ${after[field] ?? UNSET}`],
  );
  if (lines.length === 0) {
    console.log('No changes.');
    return;
  }
  console.log(`Changes (${lines.length}):`);
  for (const line of lines) console.log(line);
}

function flattenPolicy(policy: GuiPolicy, includeAudit: boolean): Record<string, string> {
  return {
    'safety.level': policy.safety.level,
    ...flattenSection('safety.overrides', policy.safety.overrides),
    'workflow.worktree_mode': String(policy.workflow.worktree_mode),
    'destructive_command_protection.enabled': String(policy.destructive_command_protection.enabled),
    ...flattenSection(
      'destructive_command_protection.overrides',
      policy.destructive_command_protection.overrides,
    ),
    'destructive_command_protection.allow_paths': flattenList(
      policy.destructive_command_protection.allow_paths,
    ),
    'secret_protection.enabled': String(policy.secret_protection.enabled),
    ...flattenSection('secret_protection.overrides', policy.secret_protection.overrides),
    'secret_protection.deny_paths': flattenList(policy.secret_protection.deny_paths),
    'secret_protection.allow_paths': flattenList(policy.secret_protection.allow_paths),
    ...(includeAudit ? { 'audit.retention_days': String(policy.audit.retention_days) } : {}),
  };
}

function flattenSection(prefix: string, values: Record<string, string | boolean | undefined>) {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      value === undefined ? [] : [[`${prefix}.${key}`, String(value)]],
    ),
  ) as Record<string, string>;
}

function flattenList(values: readonly string[]): string {
  return values.length === 0 ? '(none)' : values.join(', ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
