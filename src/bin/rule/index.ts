import { join } from 'node:path';
import { ruleCommand } from '@/bin/commands/rule';
import { printCommandHelp } from '@/bin/help';
import { RULE_DOC } from '@/bin/rule/doc';
import {
  printRuleChangeResult,
  printRulesListReport,
  printRulesTestResult,
} from '@/bin/rule/format';
import { runRulesMigrate } from '@/bin/rule/migrate';
import { runRulesVerify } from '@/bin/rule/verify';
import { isReservedTransparentWrapper } from '@/core/analyze/transparent-wrappers';
import {
  addRulebookSource,
  getRulesConfigSourceDisplayMap,
  loadRulesPolicy,
  readRulesConfig,
  removeRulebookSource,
  syncRulesConfig,
  testRulebookSources,
  writeDefaultRulesConfig,
  writeStarterRulebook,
} from '@/core/rules/policy';
import { writeJsonAtomic } from '@/core/rules/policy/config-file';
import {
  ensurePolicyDirectory,
  getPolicyFilesystemTargetForPath,
  PolicyFilesystemError,
  type PolicyFilesystemTarget,
  readPolicyFile,
} from '@/core/rules/policy/filesystem';
import { getPolicyPaths, getRulebookCacheRoot, getScopePaths } from '@/core/rules/policy/paths';
import { COMMAND_PATTERN } from '@/types';

interface RuleFlags {
  global: boolean;
  check: boolean;
  cleanup: boolean;
  deleteSource: boolean;
  example: boolean;
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
  'test',
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
  if (flags.errors.length > 0) {
    for (const error of flags.errors) console.error(error);
    return 1;
  }

  const subcommand = flags.positionals[0];
  if (flags.help) {
    printCommandHelp(ruleCommand);
    return 0;
  }
  if (!subcommand) {
    printCommandHelp(ruleCommand);
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
    const result = await addRulebookSource(value, options);
    printRuleChangeResult(result, `Added rulebook source: ${value}`);
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

  if (subcommand === 'test') {
    const sources = value ? [value] : [];
    const result = await testRulebookSources(sources, options);
    printRulesTestResult(result);
    return result.ok ? 0 : 1;
  }

  if (subcommand === 'migrate') {
    return runRulesMigrate({ cleanup: flags.cleanup, cwd: process.cwd() });
  }

  if (subcommand === 'doc') {
    console.log(RULE_DOC);
    return 0;
  }

  if (subcommand === 'verify') {
    return runRulesVerify();
  }

  return 1;
}

function parseRuleFlags(args: readonly string[]): RuleFlags {
  const flags: RuleFlags = {
    global: false,
    check: false,
    cleanup: false,
    deleteSource: false,
    example: false,
    help: false,
    positionals: [],
    errors: [],
  };

  for (const arg of args) {
    if (arg === '-g' || arg === '--global') {
      flags.global = true;
    } else if (arg === '--check') {
      flags.check = true;
    } else if (arg === '--delete-source') {
      flags.deleteSource = true;
    } else if (arg === '--cleanup') {
      flags.cleanup = true;
    } else if (arg === '--example') {
      flags.example = true;
    } else if (arg === '-h' || arg === '--help') {
      flags.help = true;
    } else if (arg.startsWith('-')) {
      flags.errors.push(unknownRuleOption(flags.positionals[0], arg));
    } else {
      flags.positionals.push(arg);
    }
  }

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
  if (subcommand === 'migrate') {
    if (flags.global) flags.errors.push('Unknown option for rule migrate: --global');
    if (flags.check) flags.errors.push('Unknown option for rule migrate: --check');
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

function unknownRuleOption(subcommand: string | undefined, option: string) {
  if (subcommand === 'migrate') return `Unknown option for rule migrate: ${option}`;
  return `Unknown rule option: ${option}`;
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
