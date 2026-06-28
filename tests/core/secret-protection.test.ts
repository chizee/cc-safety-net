import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findSensitivePathTarget,
  findSensitiveTargetInCommand,
  findSensitiveTargetInToolInput,
  getCommandFromToolInput,
} from '@/core/secret-protection';

describe('secret protection path matching', () => {
  test('matches project env files without substring matching', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitivePathTarget(['.env'], cwd)).not.toBeNull();
    expect(findSensitivePathTarget(['.env.local'], cwd)).not.toBeNull();
    expect(findSensitivePathTarget(['src/env.ts'], cwd)).toBeNull();
  });

  test('allows common env template files', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitivePathTarget(['.env.example'], cwd)).toBeNull();
    expect(findSensitivePathTarget(['.env.sample'], cwd)).toBeNull();
    expect(findSensitivePathTarget(['.env.template'], cwd)).toBeNull();
    expect(findSensitivePathTarget(['.env.defaults'], cwd)).toBeNull();
  });

  test('matches home credential paths', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitivePathTarget(['~/.ssh'], cwd)).not.toBeNull();
    expect(findSensitivePathTarget(['~/.ssh/id_rsa'], cwd)).not.toBeNull();
    expect(findSensitivePathTarget(['~/.aws'], cwd)).not.toBeNull();
    expect(findSensitivePathTarget(['~/.aws/credentials'], cwd)).not.toBeNull();
    expect(
      findSensitivePathTarget(['~/.config/gcloud/application_default_credentials.json'], cwd),
    ).not.toBeNull();
    expect(findSensitivePathTarget(['~/.kube/config'], cwd)).not.toBeNull();
    expect(findSensitivePathTarget(['~/.docker/config.json'], cwd)).not.toBeNull();
    expect(findSensitivePathTarget(['~/.npmrc'], cwd)).not.toBeNull();
    expect(findSensitivePathTarget(['~/.pypirc'], cwd)).not.toBeNull();
    expect(findSensitivePathTarget(['~/.netrc'], cwd)).not.toBeNull();
    expect(findSensitivePathTarget(['~/.git-credentials'], cwd)).not.toBeNull();
    expect(findSensitivePathTarget(['~/.config/gh/hosts.yml'], cwd)).not.toBeNull();
  });

  test('normalizes Windows-style separators', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitivePathTarget(['secrets\\production.env'], cwd)).not.toBeNull();
  });

  test('ignores empty and unrelated path targets', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitivePathTarget([''], cwd)).toBeNull();
    expect(findSensitivePathTarget(['package.json'], cwd)).toBeNull();
  });
});

describe('secret protection command target extraction', () => {
  test('blocks recognized file operands and redirects', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('cat .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('env cat .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('sudo command cat .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('grep TOKEN .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand("sed -n '1,10p' .env", cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('cp .env /tmp/env-copy', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('tar -czf env.tgz .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('rm .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('> .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('cat README.md && cat .env', cwd)).not.toBeNull();
  });

  test('does not block display-only mentions', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('echo "Add .env to .gitignore"', cwd)).toBeNull();
    expect(
      findSensitiveTargetInCommand('printf ".env files should not be committed\\n"', cwd),
    ).toBeNull();
    expect(findSensitiveTargetInCommand("cat 'unterminated .env", cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('tar -czf secrets.tgz README.md', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('zip secrets.zip README.md', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('custom-tool .env', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('VAR=value', cwd)).toBeNull();
  });
});

describe('secret protection generic tool input extraction', () => {
  test('extracts commands and path-like values from nested tool input', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInToolInput({ command: 'cat .env' }, cwd)).not.toBeNull();
    expect(findSensitiveTargetInToolInput({ nested: [{ file_path: '.env' }] }, cwd)).not.toBeNull();
    expect(findSensitiveTargetInToolInput({ nested: { path: 'README.md' } }, cwd)).toBeNull();
  });

  test('ignores non-object tool input and non-string commands', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInToolInput(null, cwd)).toBeNull();
    expect(findSensitiveTargetInToolInput('cat .env', cwd)).toBeNull();
    expect(getCommandFromToolInput(null)).toBeUndefined();
    expect(getCommandFromToolInput({ command: '' })).toBeUndefined();
    expect(getCommandFromToolInput({ command: 1 })).toBeUndefined();
  });
});
