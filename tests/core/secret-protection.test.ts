import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findSensitivePathTarget,
  findSensitiveTargetInCommand,
  findSensitiveTargetInToolInput,
  getCommandFromToolInput,
} from '@/core/secret-protection';
import { withEnv } from '../helpers.ts';

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

  test('does not treat grep/rg search patterns as file targets', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('grep credentials README.md', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('rg id_rsa docs/', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('grep -i password config.yml', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('rg "API_KEY" src/', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('rg id_rsa', cwd)).toBeNull();
  });

  test('still blocks sensitive file operands after a grep/rg pattern', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('grep TOKEN .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('rg pattern ~/.ssh', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('grep -r foo id_rsa', cwd)).not.toBeNull();
  });

  test('blocks grep/rg pattern files read via -f/--file', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('grep -f .env README.md', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('rg -f ~/.ssh/id_rsa src', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('grep --file .env README.md', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('rg --file=.env src', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('grep -f.env README.md', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('grep -rf .env README.md', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('rg -if .env src', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('grep -nf .env README.md', cwd)).not.toBeNull();
  });

  test('treats positionals as files when the pattern comes from an option', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('grep -e TOKEN .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('grep --regexp TOKEN .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('grep --file patterns .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('rg -f pat .env src', cwd)).not.toBeNull();
    // getopt permutation: secretfile before -e is still a file read
    expect(findSensitiveTargetInCommand('grep .env -e foo', cwd)).not.toBeNull();
  });

  test('does not flag benign searches when the pattern comes from an option', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('grep -e TOKEN README.md', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('grep --regexp TOKEN config.yml', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('rg -e TODO src/', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('grep README.md -e foo', cwd)).toBeNull();
  });

  test('blocks rg --files targeting sensitive paths (patternless mode)', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('rg --files ~/.ssh', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('rg --files secrets/', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('rg --files ~/.aws', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('rg -i --files ~/.ssh', cwd)).not.toBeNull();
    // non-sensitive path enumeration stays allowed
    expect(findSensitiveTargetInCommand('rg --files src', cwd)).toBeNull();
  });

  test('does not flag patterns supplied via arg-consuming options', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('grep -A 2 credentials README.md', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('rg -C 3 id_rsa src/', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('grep -e credentials README.md', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('rg -m 5 credentials .', cwd)).toBeNull();
    expect(
      findSensitiveTargetInCommand('grep --after-context=2 credentials README.md', cwd),
    ).toBeNull();
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

describe('secret protection case-insensitive matching', () => {
  test('flags uppercased and mixed-case sensitive paths', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      '.ENV',
      '.Env.Local',
      '/app/.ENV.STAGING',
      '~/.AWS',
      '/home/user/.AWS/CREDENTIALS',
      '/home/user/.SSH/ID_RSA',
      '/tmp/ID_RSA.BAK',
      '~/.NPMRC',
      '~/.NETRC',
      'project/Secrets/token.txt',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
    }
  });

  test('keeps env exemptions case-insensitive', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of ['.ENV.EXAMPLE', '/app/.ENV.SAMPLE', '.ENV.TEMPLATE']) {
      expect(findSensitivePathTarget([target], cwd), target).toBeNull();
    }
  });
});

describe('secret protection distinctive basenames anywhere', () => {
  test('blocks absolute paths to keys and credentials regardless of directory', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      '/home/user/.ssh/id_rsa',
      '/home/user/.ssh/id_ed25519',
      '/home/user/.aws/credentials',
      '/root/.ssh/id_rsa',
      '/etc/ssh/id_ecdsa',
      '/home/u/.ssh/id_rsa.copy',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
    }
  });
});

describe('secret protection home-anchored credential locations', () => {
  test('blocks ~/.ssh, ~/.aws and sibling config files under ~', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      '~/.ssh',
      '~/.ssh/config',
      '~/.ssh/known_hosts',
      '~/.aws',
      '~/.aws/config',
      '~/.gcp',
      '~/.config/gcloud',
      '~/.config/gcloud/application_default_credentials.json',
      '~/.kube/config',
      '~/.docker/config.json',
      '~/.config/gh/hosts.yml',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
    }
  });

  test('blocks absolute current-home credential paths', () => {
    const home = join(tmpdir(), 'secret-protection-home');
    const cwd = join(home, 'project');

    withEnv({ HOME: home }, () => {
      for (const target of [
        join(home, '.ssh', 'config'),
        join(home, '.ssh', 'known_hosts'),
        join(home, '.kube', 'config'),
        join(home, '.docker', 'config.json'),
        join(home, '.config', 'gh', 'hosts.yml'),
      ]) {
        expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
      }
    });
  });

  test('blocks repeated slash home credential paths', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of ['~//.ssh/config', '~//.kube/config']) {
      expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
    }
  });

  test('does not block home-only config paths outside ~ (avoids repo false positives)', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      '/home/user/.aws/config',
      '/home/user/.kube/config',
      '/home/user/.docker/config.json',
      '/home/user/.config/gh/hosts.yml',
      '/home/user/.config/gcloud',
      '/home/user/.config/gcloud/application_default_credentials.json',
      'tests/fixtures/.ssh/config',
      '.aws/README.md',
      'infra/.kube/config',
      'docs/.docker/config.json',
      'deploy/.config/gh/hosts.yml',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).toBeNull();
    }
  });
});

describe('secret protection rename-shielded variants', () => {
  test('flags copied / renamed keys and credentials', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      'id_rsa.bak',
      'id_rsa.backup',
      'id_rsa-old',
      'id_rsa_old',
      'id_rsa.key',
      'id_rsa.pem',
      'id_rsa.orig',
      'id_rsa.tmp',
      'id_ed25519-old',
      'id_ecdsa.bak',
      'credentials.backup',
      'credentials-old',
      '/tmp/id_rsa.save',
      '/home/u/.ssh/id_rsa.copy',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
    }
  });

  test('does not flag public keys or unrelated lookalikes', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      'id_rsa.pub',
      'id_ed25519.pub',
      'id_ecdsa.pub',
      'id_rsafoo',
      'credentials.json',
      'server.key.example',
      '.envrc',
      'environment.py',
      '.env_example',
      '.env.example',
      '.env.sample',
      '.env.template',
      '.env.defaults',
      '.env.example.production',
      '.env.sample.staging',
      'package.json',
      'README.md',
      'app.py',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).toBeNull();
    }
  });
});

describe('secret protection env variant coverage', () => {
  test('flags every .env.<environment> variant', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      '.env.staging',
      '.env.development',
      '.env.production',
      '.env.test',
      '.env.local',
      '.env.production.local',
      '.env.development.local',
      '/app/.env.ci',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
    }
  });
});

describe('secret protection public keys in sensitive directories', () => {
  test('blocks public keys inside ~/.ssh and secrets/ (wholesale dir deny)', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      '~/.ssh/id_rsa.pub',
      '~/.ssh/id_ed25519.pub',
      '~/.ssh/id_ecdsa.pub',
      'secrets/id_rsa.pub',
      'deploy/secrets/id_ed25519.pub',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
    }
  });

  test('still exempts public keys outside sensitive directories', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      'id_rsa.pub',
      '/tmp/id_rsa.pub',
      'keys/id_ed25519.pub',
      '/etc/ssh/id_ecdsa.pub',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).toBeNull();
    }
  });
});
