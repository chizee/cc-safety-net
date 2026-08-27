import { describe, expect, test } from 'bun:test';
import type { CustomRuleMatch, PolicyRule } from '@/ir/policy';
import { checkPolicyRuleMatch } from '@/rules/custom';

// Fixture commands are analyzer input token lists; they are never executed.
function v2Rule(name: string, command: string, match: CustomRuleMatch): PolicyRule {
  return { name, command, block_args: [], match, reason: `${name} reason` };
}

const matchedId = (tokens: string[], rules: PolicyRule[]) =>
  checkPolicyRuleMatch(tokens, rules)?.id ?? null;

const terraformDestroy = v2Rule('block-terraform-destroy', 'terraform', {
  command_path: ['destroy'],
});
const terraformApplyDestroy = v2Rule('block-terraform-apply-destroy', 'terraform', {
  command_path: ['apply'],
  any_args: ['-destroy', '--destroy'],
});
const terraformStateRm = v2Rule('block-terraform-state-rm', 'terraform', {
  command_path: ['state', 'rm'],
  exclude_args: ['-dry-run', '--dry-run'],
});
const awsTerminateInstances = v2Rule('block-aws-terminate-instances', 'aws', {
  command_path: ['ec2', 'terminate-instances'],
});
const awsS3Rm = v2Rule('block-aws-s3-rm', 'aws', {
  command_path: ['s3', 'rm'],
  exclude_args: ['--dryrun'],
});
const gcloudInstancesDelete = v2Rule('block-gcloud-instances-delete', 'gcloud', {
  command_path: ['compute', 'instances', 'delete'],
});
const gcloudBetaInstancesDelete = v2Rule('block-gcloud-beta-instances-delete', 'gcloud', {
  command_path: ['beta', 'compute', 'instances', 'delete'],
});
const azGroupDelete = v2Rule('block-az-group-delete', 'az', {
  command_path: ['group', 'delete'],
});

describe('rulebook v2 command_path matching', () => {
  test('matches the command path and ignores other paths of the same command', () => {
    expect(matchedId(['terraform', 'destroy'], [terraformDestroy])).toBe(
      'custom.block-terraform-destroy',
    );
    expect(matchedId(['terraform', 'plan'], [terraformDestroy])).toBeNull();
  });

  test('skips recognized global options and their values before the path', () => {
    expect(
      matchedId(
        ['aws', '--profile', 'prod', 'ec2', 'terminate-instances', '--instance-ids', 'i-1'],
        [awsTerminateInstances],
      ),
    ).toBe('custom.block-aws-terminate-instances');
    expect(
      matchedId(
        ['gcloud', '--project', 'prod', 'compute', 'instances', 'delete', 'vm'],
        [gcloudInstancesDelete],
      ),
    ).toBe('custom.block-gcloud-instances-delete');
    expect(
      matchedId(
        ['aws', '--cli-error-format', 'json', 'ec2', 'terminate-instances'],
        [awsTerminateInstances],
      ),
    ).toBe('custom.block-aws-terminate-instances');
  });

  test('skips recognized az global options and their values before the path', () => {
    expect(
      matchedId(
        ['az', '--subscription', 'prod', 'group', 'delete', '--name', 'rg'],
        [azGroupDelete],
      ),
    ).toBe('custom.block-az-group-delete');
    expect(matchedId(['az', '-o', 'json', 'group', 'delete'], [azGroupDelete])).toBe(
      'custom.block-az-group-delete',
    );
    expect(matchedId(['az', '--output', 'json', 'group', 'delete'], [azGroupDelete])).toBe(
      'custom.block-az-group-delete',
    );
    expect(matchedId(['az', '--query', 'name', 'group', 'delete'], [azGroupDelete])).toBe(
      'custom.block-az-group-delete',
    );
    expect(
      matchedId(['az', '--subscription', 'prod', 'group', 'list'], [azGroupDelete]),
    ).toBeNull();
  });

  test('skips a recognized global option placed between path words', () => {
    expect(
      matchedId(
        ['gcloud', 'compute', '--project', 'prod', 'instances', 'delete', 'vm'],
        [gcloudInstancesDelete],
      ),
    ).toBe('custom.block-gcloud-instances-delete');
  });

  test('skips an unrecognized flag without consuming a following word', () => {
    expect(
      matchedId(['aws', '--no-paginate', 'ec2', 'terminate-instances'], [awsTerminateInstances]),
    ).toBe('custom.block-aws-terminate-instances');
  });

  test('treats an =-joined value as part of its own token', () => {
    expect(
      matchedId(['terraform', '-chdir=prod', 'state', 'rm', 'module.old'], [terraformStateRm]),
    ).toBe('custom.block-terraform-state-rm');
  });

  test('keeps release channels distinct instead of implicitly optional', () => {
    expect(
      matchedId(
        ['gcloud', 'beta', 'compute', 'instances', 'delete', 'vm'],
        [gcloudInstancesDelete],
      ),
    ).toBeNull();
    expect(
      matchedId(
        ['gcloud', 'beta', 'compute', 'instances', 'delete', 'vm'],
        [gcloudBetaInstancesDelete],
      ),
    ).toBe('custom.block-gcloud-beta-instances-delete');
  });

  test('does not match a lookalike path that ends in the same word', () => {
    expect(
      matchedId(['gcloud', 'compute', 'instances', 'create', 'delete'], [gcloudInstancesDelete]),
    ).toBeNull();
  });

  test('misses when an unlisted value-taking option separates its value', () => {
    expect(
      matchedId(
        ['aws', '--newflag', 'value', 'ec2', 'terminate-instances'],
        [awsTerminateInstances],
      ),
    ).toBeNull();
    expect(
      matchedId(
        ['gcloud', '--newflag', 'value', 'compute', 'instances', 'delete'],
        [gcloudInstancesDelete],
      ),
    ).toBeNull();
    expect(matchedId(['terraform', '-unknown', 'value', 'destroy'], [terraformDestroy])).toBeNull();
  });

  test('normalizes the executable but keeps path words case-sensitive', () => {
    expect(matchedId(['/usr/bin/TERRAFORM', 'destroy'], [terraformDestroy])).toBe(
      'custom.block-terraform-destroy',
    );
    expect(
      matchedId(['gcloud', 'Compute', 'instances', 'delete'], [gcloudInstancesDelete]),
    ).toBeNull();
  });
});

describe('rulebook v2 argument conditions', () => {
  test('requires at least one any_args token in either accepted spelling', () => {
    expect(matchedId(['terraform', 'apply', '-destroy'], [terraformApplyDestroy])).toBe(
      'custom.block-terraform-apply-destroy',
    );
    expect(matchedId(['terraform', 'apply', '--destroy'], [terraformApplyDestroy])).toBe(
      'custom.block-terraform-apply-destroy',
    );
    expect(matchedId(['terraform', 'apply'], [terraformApplyDestroy])).toBeNull();
    expect(matchedId(['terraform', 'apply', '--destroy=true'], [terraformApplyDestroy])).toBeNull();
  });

  test('an exclude_args token vetoes the match in every accepted spelling', () => {
    expect(matchedId(['aws', 's3', 'rm', 's3://bucket', '--dryrun'], [awsS3Rm])).toBeNull();
    expect(matchedId(['aws', 's3', 'rm', 's3://bucket'], [awsS3Rm])).toBe('custom.block-aws-s3-rm');
    expect(
      matchedId(['terraform', 'state', 'rm', '-dry-run', 'module.old'], [terraformStateRm]),
    ).toBeNull();
    expect(
      matchedId(['terraform', 'state', 'rm', '--dry-run', 'module.old'], [terraformStateRm]),
    ).toBeNull();
  });

  test('does not expand short options into single letters', () => {
    const anyShort = v2Rule('block-short-any', 'terraform', {
      command_path: ['apply'],
      any_args: ['-d'],
    });
    const excludeShort = v2Rule('block-short-exclude', 'terraform', {
      command_path: ['apply'],
      exclude_args: ['-d'],
    });
    expect(matchedId(['terraform', 'apply', '-destroy'], [anyShort])).toBeNull();
    expect(matchedId(['terraform', 'apply', '-destroy'], [excludeShort])).toBe(
      'custom.block-short-exclude',
    );
  });
});

describe('rulebook v2 rule ordering', () => {
  test('the first matching rule wins', () => {
    const broad = v2Rule('block-terraform-any-destroy', 'terraform', { command_path: ['destroy'] });
    expect(matchedId(['terraform', 'destroy'], [terraformDestroy, broad])).toBe(
      'custom.block-terraform-destroy',
    );
    expect(matchedId(['terraform', 'destroy'], [broad, terraformDestroy])).toBe(
      'custom.block-terraform-any-destroy',
    );
  });

  test('v1 rules keep their own semantics in a mixed rule list', () => {
    const v1Rule: PolicyRule = {
      name: 'block-terraform-apply-flag',
      command: 'terraform',
      subcommand: 'apply',
      block_args: ['-a'],
      reason: 'v1 reason',
    };
    // v1 still expands short options: -auto-approve matches the -a block arg.
    expect(matchedId(['terraform', 'apply', '-auto-approve'], [v1Rule, terraformDestroy])).toBe(
      'custom.block-terraform-apply-flag',
    );
    expect(matchedId(['terraform', 'destroy'], [v1Rule, terraformDestroy])).toBe(
      'custom.block-terraform-destroy',
    );
  });
});
