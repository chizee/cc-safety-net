import { join } from 'node:path';
import { parseCommandArgs } from '@/cli/args';
import { ruleAddExamples, ruleAddOptions, ruleCommand } from '@/cli/commands/rule';
import { printCommandHelp } from '@/cli/help';
import { RULE_DOC } from '@/cli/rule/doc';
import { printRuleAddResult, printRuleChangeResult, printRulesListReport } from '@/cli/rule/format';
import { runRulesMigrate } from '@/cli/rule/migrate';
import { getUpdateNotice } from '@/cli/rule/update-notice';
import { runRulesVerify } from '@/cli/rule/verify';
import { COMMAND_PATTERN, isReservedTransparentWrapper } from '@/engine/facade';
import {
  addRulebookSource,
  getRulesConfigSourceDisplayMap,
  loadRulesPolicy,
  readRulesConfig,
  removeRulebookSource,
  syncRulesConfig,
  writeDefaultRulesConfig,
  writeStarterRulebook,
} from '@/rules/policy';
import { writeJsonAtomic } from '@/rules/policy/config-file';
import {
  ensurePolicyDirectory,
  getPolicyFilesystemTargetForPath,
  PolicyFilesystemError,
  type PolicyFilesystemTarget,
  readPolicyFile,
} from '@/rules/policy/filesystem';
import { getPolicyPaths, getRulebookCacheRoot, getScopePaths } from '@/rules/policy/paths';
import { isGitHubRef, isGitHubRepositorySource, NAME_PATTERN } from '@/rules/policy/source-syntax';

interface RuleFlags {
  global: boolean;
  check: boolean;
  cleanup: boolean;
  deleteSource: boolean;
  example: boolean;
  ref?: string;
  only: string[];
  help: boolean;
  positionals: string[];
  errors: string[];
}

const RULE_SUBCOMMANDS = new Set([
  'init',
  'add',
  'remove',
  'update',
  'sync',
  'list',
  'wrapper',
  'migrate',
  'doc',
  'verify',
]);
const RULE_WRAPPER_ACTIONS = new Set(['add', 'remove', 'list']);

export async function runRuleCommand(args: readonly string[]): Promise<number> {
  try {
    return await runRuleCommandInternal(args);
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

async function runRuleCommandInternal(args: readonly string[]): Promise<number> {
  const flags = parseRuleFlags(args);
  // An incomplete invocation such as `rule wrapper --help` is a help request, not the
  // mistake the parser reports. A name that resolves to nothing — `rule bogus --help` —
  // is still a typo, so it falls through to the error below.
  const helpCommand = flags.help ? getRuleHelpCommand(flags.positionals) : null;
  if (helpCommand) {
    printCommandHelp(helpCommand);
    return 0;
  }
  if (flags.errors.length > 0) {
    for (const error of flags.errors) console.error(error);
    return 1;
  }

  const subcommand = flags.positionals[0];
  if (!subcommand) {
    printCommandHelp(ruleCommand, console.error);
    return 1;
  }
  const value = flags.positionals[1];
  const options = { global: flags.global, check: flags.check };

  if (subcommand === 'init') {
    const scope = getScopePaths(options);
    const dir = scope.configDir;
    ensureRulesConfig(scope.configTarget);
    ensurePolicyDirectory(
      getPolicyFilesystemTargetForPath(
        scope.filesystemScope,
        getRulebookCacheRoot({ ...options, cacheConfigDir: dir }),
      ),
    );
    const rulebookPath = join(dir, 'example-rules', 'rulebook.json');
    const rulebookTarget = getPolicyFilesystemTargetForPath(scope.filesystemScope, rulebookPath);
    if (flags.example && readPolicyFile(rulebookTarget) === null)
      writeStarterRulebook(rulebookTarget, 'example-rules');
    const result = await syncRulesConfig(options);
    printRuleChangeResult(result, 'Rule config initialized.');
    return result.ok ? 0 : 1;
  }

  if (subcommand === 'add') {
    if (!value) {
      console.error('rule add requires a source');
      return 1;
    }
    const result = await addRulebookSource(value, {
      ...options,
      ref: flags.ref,
      rulebooks: flags.only.length > 0 ? flags.only : undefined,
    });
    printRuleAddResult(result, value);
    return result.ok ? 0 : 1;
  }

  if (subcommand === 'remove') {
    if (!value) {
      console.error('rule remove requires a source');
      return 1;
    }
    const result = await removeRulebookSource(value, {
      ...options,
      deleteSource: flags.deleteSource,
    });
    printRuleChangeResult(result, `Removed rulebook source: ${value}`);
    return result.ok ? 0 : 1;
  }

  if (subcommand === 'update' || subcommand === 'sync') {
    const result = await syncRulesConfig({
      ...options,
      only: subcommand === 'update' ? value : undefined,
      refresh: subcommand === 'update',
    });
    printRuleChangeResult(result, flags.check ? 'Rule config checked.' : 'Rule config synced.');
    return result.ok ? 0 : 1;
  }

  if (subcommand === 'list') {
    const policy = loadRulesPolicy();
    const paths = getPolicyPaths({});
    printRulesListReport(policy, {
      user: getRulesConfigSourceDisplayMap(policy.userConfigPath, paths.userScope),
      project: getRulesConfigSourceDisplayMap(policy.projectConfigPath, paths.projectScope),
    });
    return policy.errors.length > 0 ? 1 : 0;
  }

  if (subcommand === 'wrapper') {
    return runRuleWrapperCommand(flags);
  }

  if (subcommand === 'migrate') {
    return runRulesMigrate({ cleanup: flags.cleanup, cwd: process.cwd() });
  }

  if (subcommand === 'doc') {
    console.log(RULE_DOC);
    const notice = await getUpdateNotice();
    if (notice) console.error(notice);
    return 0;
  }

  if (subcommand === 'verify') {
    return runRulesVerify();
  }

  return 1;
}

/**
 * Reuses the existing per-leaf entries so `rule <leaf> --help` describes that leaf, not the
 * tree. Returns null when the positionals name nothing the help can answer for.
 */
function getRuleHelpCommand(positionals: string[]) {
  if (positionals.length === 0) return ruleCommand;
  const leaves = ruleCommand.subcommands.filter(
    (leaf) => leaf.usage.split(' ')[0] === positionals[0],
  );
  if (leaves.length === 0) return null;
  // `rule wrapper` covers three actions; showing one of them would hide the other two.
  if (positionals.length === 1 && leaves.length > 1) {
    return {
      name: `rule ${positionals[0]}`,
      description: `Subcommands of rule ${positionals[0]}`,
      usage: `rule ${positionals[0]} <subcommand>`,
      subcommands: leaves,
      options: [],
    };
  }
  const leaf =
    positionals.length === 1
      ? leaves[0]
      : leaves.find((entry) => entry.usage.split(' ')[1] === positionals[1]);
  if (!leaf) return null;
  return {
    name: `rule ${positionals[0]}`,
    description: leaf.description,
    usage: `rule ${leaf.usage}`,
    options: positionals[0] === 'add' ? ruleAddOptions : [],
    examples: positionals[0] === 'add' ? ruleAddExamples : undefined,
  };
}

function parseRuleFlags(args: readonly string[]): RuleFlags {
  const parsed = parseCommandArgs(
    {
      label: 'rule',
      booleans: {
        global: ['-g', '--global'],
        check: ['--check'],
        cleanup: ['--cleanup'],
        deleteSource: ['--delete-source'],
        example: ['--example'],
      },
      values: { ref: ['--ref'] },
      lists: { only: ['--only'] },
      positionals: 'list',
    },
    args,
  );
  const flags: RuleFlags = {
    ...parsed.flags,
    ref: parsed.values.ref,
    only: parsed.lists.only ?? [],
    help: parsed.help,
    positionals: parsed.positionals,
    errors: parsed.errors,
  };

  validateRuleFlags(flags);
  return flags;
}

function validateRuleFlags(flags: RuleFlags): void {
  const [subcommand] = flags.positionals;
  if (subcommand && !RULE_SUBCOMMANDS.has(subcommand)) {
    flags.errors.push(`Unknown rule subcommand: ${subcommand}`);
  }
  if (flags.deleteSource && subcommand !== 'remove') {
    if (subcommand && RULE_SUBCOMMANDS.has(subcommand)) {
      flags.errors.push(`Unknown option for rule ${subcommand}: --delete-source`);
    } else {
      flags.errors.push("--delete-source is only valid with 'rule remove'");
    }
  }
  if (flags.cleanup && subcommand !== 'migrate') {
    flags.errors.push(unknownRuleOption(subcommand, '--cleanup'));
  }
  if (flags.example && subcommand !== 'init') {
    flags.errors.push(unknownRuleOption(subcommand, '--example'));
  }
  if (flags.ref && subcommand !== 'add') {
    flags.errors.push(unknownRuleOption(subcommand, '--ref'));
  }
  if (flags.only.length > 0 && subcommand !== 'add') {
    flags.errors.push(unknownRuleOption(subcommand, '--only'));
  }
  if (subcommand === 'add') validateRuleAddFlags(flags);
  if (subcommand === 'migrate') {
    if (flags.global) flags.errors.push(unknownRuleOption(subcommand, '--global'));
    if (flags.check) flags.errors.push(unknownRuleOption(subcommand, '--check'));
    if (flags.positionals.length > 1) {
      flags.errors.push(`Unexpected rule migrate argument: ${flags.positionals[1]}`);
    }
  } else if (subcommand === 'wrapper') {
    validateRuleWrapperFlags(flags);
  } else if (flags.positionals.length > 2) {
    flags.errors.push(`Unexpected rule argument: ${flags.positionals[2]}`);
  }
  if (subcommand === 'list' && flags.global) {
    flags.errors.push('Unknown option for rule list: --global');
  }
}

function validateRuleAddFlags(flags: RuleFlags): void {
  const source = flags.positionals[1];
  if (!source && flags.only.length > 0) {
    flags.errors.push('rule add requires owner/repo before --only');
    return;
  }
  if (!source) return;
  if ((flags.ref || flags.only.length > 0) && !isGitHubRepositorySource(source)) {
    if (flags.ref) {
      flags.errors.push(`--ref can only select a ref for an owner/repo source: ${source}`);
    }
    if (flags.only.length > 0) {
      flags.errors.push('--only can only select rulebooks from an owner/repo source');
    }
    return;
  }
  if (flags.ref && !isGitHubRef(flags.ref)) {
    flags.errors.push(`--ref must be a single path segment: ${flags.ref}`);
  }
  const invalidNames = flags.only.filter((name) => !NAME_PATTERN.test(name));
  if (invalidNames.length > 0) {
    flags.errors.push(`Invalid rulebook names: ${invalidNames.join(', ')}`);
  }
}

function unknownRuleOption(subcommand: string | undefined, option: string) {
  return subcommand
    ? `Unknown option for rule ${subcommand}: ${option}`
    : `Unknown option for rule: ${option}`;
}

function validateRuleWrapperFlags(flags: RuleFlags): void {
  const action = flags.positionals[1];
  const command = flags.positionals[2];
  if (!action) {
    flags.errors.push('rule wrapper requires add, remove, or list');
    return;
  }
  if (!RULE_WRAPPER_ACTIONS.has(action)) {
    flags.errors.push(`Unknown rule wrapper action: ${action}`);
    return;
  }
  if (action === 'list') {
    if (command) flags.errors.push(`Unexpected rule wrapper argument: ${command}`);
    return;
  }
  if (!command) {
    flags.errors.push(`rule wrapper ${action} requires a command`);
    return;
  }
  if (flags.positionals.length > 3) {
    flags.errors.push(`Unexpected rule wrapper argument: ${flags.positionals[3]}`);
  }
}

function ensureRulesConfig(configPath: PolicyFilesystemTarget): void {
  if (readPolicyFile(configPath) === null) {
    writeDefaultRulesConfig(configPath);
    return;
  }

  const loaded = readRulesConfig(configPath);
  if (!loaded.config) return;

  writeJsonAtomic(configPath, {
    version: 1,
    rules: loaded.config.rules,
    overrides: loaded.config.overrides ?? {},
    transparent_wrappers: loaded.config.transparent_wrappers ?? [],
  });
}

async function runRuleWrapperCommand(flags: RuleFlags): Promise<number> {
  const action = flags.positionals[1];
  const command = flags.positionals[2];
  const configPath = getScopePaths({ global: flags.global }).configTarget;

  if (action === 'list') {
    const loaded = readRulesConfig(configPath);
    if (loaded.errors.length > 0) {
      for (const error of loaded.errors) console.error(error);
      return 1;
    }
    printTransparentWrappers(loaded.config?.transparent_wrappers ?? []);
    return 0;
  }

  if (!command || !COMMAND_PATTERN.test(command)) {
    console.error('transparent wrapper must match command pattern');
    return 1;
  }
  if (isReservedTransparentWrapper(command)) {
    console.error(`reserved command "${command}" cannot be a wrapper`);
    return 1;
  }

  const loaded = readRulesConfig(configPath);
  if (loaded.errors.length > 0) {
    for (const error of loaded.errors) console.error(error);
    return 1;
  }
  const config = loaded.config ?? {
    version: 1 as const,
    rules: [],
    overrides: {},
    transparent_wrappers: [],
  };
  const wrappers =
    action === 'add'
      ? [...new Set([...(config.transparent_wrappers ?? []), command])]
      : (config.transparent_wrappers ?? []).filter((wrapper) => wrapper !== command);

  writeJsonAtomic(configPath, {
    version: 1,
    rules: config.rules,
    overrides: config.overrides ?? {},
    transparent_wrappers: wrappers,
  });
  console.log(
    action === 'add'
      ? `Added transparent wrapper: ${command}`
      : `Removed transparent wrapper: ${command}`,
  );
  return 0;
}

function printTransparentWrappers(wrappers: string[]): void {
  if (wrappers.length === 0) {
    console.log('Transparent wrappers: (none)');
    return;
  }
  console.log(`Transparent wrappers (${wrappers.length}):`);
  for (const wrapper of wrappers) console.log(`  - ${wrapper}`);
}
