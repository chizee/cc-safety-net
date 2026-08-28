import {
  type AddRulebookSourceResult,
  getRulebookDisplaySource,
  type LoadedRulesPolicy,
  type RulebookLockEntryWithStats,
  type RuleOverride,
} from '@/rules/policy';

export function printRuleChangeResult(
  result: {
    ok: boolean;
    errors: string[];
    warnings?: string[];
    entries: RulebookLockEntryWithStats[];
  },
  action: string,
): void {
  if (!result.ok) {
    printResultErrors(result);
    return;
  }
  printResultWarnings(result);
  console.log(action);
  printSuccessfulRuleChange(result);
}

export function printRuleAddResult(result: AddRulebookSourceResult, source: string): void {
  if (!result.add) {
    printRuleChangeResult(result, `Added rulebook source: ${source}`);
    return;
  }
  if (!result.ok) {
    printResultErrors(result);
    return;
  }
  printResultWarnings(result);
  if (result.add.added.length > 0) {
    console.log(
      `Added ${result.add.added.length} ${result.add.added.length === 1 ? 'rulebook' : 'rulebooks'} from ${result.add.source} at ${result.add.ref}:`,
    );
    for (const name of result.add.added) console.log(`  - ${name}`);
  }
  if (result.add.alreadyConfigured.length > 0) {
    console.log(
      `Rulebooks already configured from ${result.add.source} at ${result.add.ref}: ${result.add.alreadyConfigured.join(', ')}`,
    );
  }
  if (result.add.commits.length === 1) {
    console.log(`Locked at ${result.add.commits[0]?.slice(0, 7)}.`);
  } else if (result.add.commits.length > 1) {
    console.log(`Locked at ${result.add.commits.map((commit) => commit.slice(0, 7)).join(', ')}.`);
  }
  printSuccessfulRuleChange(result);
}

function printSuccessfulRuleChange(result: { entries: RulebookLockEntryWithStats[] }): void {
  console.log('Rule config synced.');
  console.log('');
  printActiveRulebookSummary(result.entries);
}

function printActiveRulebookSummary(entries: RulebookLockEntryWithStats[]): void {
  if (entries.length === 0) {
    console.log('Active rulebooks: (none)');
    return;
  }
  console.log(`Active rulebooks (${entries.length}):`);
  for (const entry of entries) {
    console.log(`  - ${entry.name} ${entry.version} (${formatRuleCount(entry.ruleCount ?? 0)})`);
    console.log(`    Source: ${getRulebookDisplaySource(entry)}`);
  }
}

function formatRuleCount(count: number): string {
  return `${count} ${count === 1 ? 'rule' : 'rules'}`;
}

export function printRulesListReport(
  policy: LoadedRulesPolicy,
  sourceDisplayMaps: Record<'user' | 'project', Map<string, string>>,
): void {
  printListSection('Active sources', policy.rulebooks, (rulebook) => [
    `[${rulebook.source}] ${rulebook.name} ${rulebook.version}`,
    `  Source: ${sourceDisplayMaps[rulebook.source].get(rulebook.spec) ?? rulebook.spec}`,
  ]);
  printListSection('Active rules', policy.rules, (rule) => [
    `[${getRuleSource(policy, rule.name)}] ${rule.name}`,
    `  Command: ${rule.subcommand ? `${rule.command} ${rule.subcommand}` : rule.command}`,
    `  Block args: ${rule.block_args.join(', ')}`,
    `  Reason: ${rule.reason}`,
  ]);
  printListSection('Disabled rules', getMergedOverrides(policy, 'off'), (override) => [
    override.key,
  ]);
  printListSection('Reason overrides', getMergedOverrides(policy, 'reason'), (override) => [
    override.key,
    `  Reason: ${(override.value as { reason: string }).reason}`,
  ]);
  printListSection('Transparent wrappers', policy.transparent_wrappers, (wrapper) => [wrapper]);
  printListSection('Issues', policy.errors, (error) => [error]);
  printListSection('Warnings', policy.warnings, (warning) => [warning]);
}

function printListSection<T>(title: string, items: T[], format: (item: T) => string[]): void {
  if (items.length === 0) {
    console.log(`${title}: (none)`);
    return;
  }
  console.log(`${title} (${items.length}):`);
  for (const item of items) {
    const [firstLine, ...detailLines] = format(item);
    console.log(`  - ${firstLine}`);
    for (const line of detailLines) console.log(`    ${line}`);
  }
}

function getRuleSource(policy: LoadedRulesPolicy, ruleName: string): 'user' | 'project' {
  return (
    policy.rulebooks.find((rulebook) => rulebook.rules.includes(ruleName))?.source ?? 'project'
  );
}

function getMergedOverrides(
  policy: LoadedRulesPolicy,
  kind: 'off' | 'reason',
): Array<{ key: string; value: RuleOverride }> {
  return Object.entries({
    ...(policy.userConfig?.overrides ?? {}),
    ...(policy.projectConfig?.overrides ?? {}),
  })
    .filter((entry): entry is [string, RuleOverride] => {
      if (kind === 'off') return entry[1] === 'off';
      return !!entry[1] && typeof entry[1] === 'object';
    })
    .map(([key, value]) => ({ key, value }));
}

function printResultErrors(result: { errors: string[] }): void {
  for (const error of result.errors) console.error(error);
}

function printResultWarnings(result: { warnings?: string[] }): void {
  if (!result.warnings || result.warnings.length === 0) return;
  for (const warning of result.warnings) console.warn(warning);
}
