import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findSensitivePathTarget,
  findSensitiveTargetInCommand,
  findSensitiveTargetInToolInput,
  getCommandFromToolInput,
} from '@/core/secret-protection';
import {
  SECRET_PROTECTION_RULE_IDS,
  SECRET_PROTECTION_RULE_METADATA,
} from '@/core/secret-protection-rules';
import { withEnv } from '../helpers.ts';

describe('secret protection rule metadata', () => {
  test('covers every stable per-pattern rule id', () => {
    expect(SECRET_PROTECTION_RULE_METADATA.map((entry) => entry.id).sort()).toEqual(
      [...SECRET_PROTECTION_RULE_IDS].sort(),
    );
    expect(SECRET_PROTECTION_RULE_IDS).toContain('secret.basename.env');
    expect(SECRET_PROTECTION_RULE_IDS).toContain('secret.pattern.env-variant');
    expect(SECRET_PROTECTION_RULE_IDS).toContain('secret.home.ssh');
    expect(SECRET_PROTECTION_RULE_IDS).toContain('secret.dir.secrets');
    expect(SECRET_PROTECTION_RULE_IDS).toContain('secret.variant.id-rsa.pem');
    expect(SECRET_PROTECTION_RULE_IDS).toContain('secret.ext.pem');
    expect(SECRET_PROTECTION_RULE_IDS).toContain('secret.ext-pattern.sql');
    for (const entry of SECRET_PROTECTION_RULE_METADATA) {
      expect(entry.category).not.toBe('');
      expect(entry.label).not.toBe('');
      expect(entry.description).not.toBe('');
    }
  });
});

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

describe('secret protection per-pattern overrides', () => {
  test('disabled rule ids skip only the matching default pattern', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(
      findSensitivePathTarget(['server.pem'], cwd, {
        disabledRules: new Set(['secret.ext.pem']),
        denyPaths: [],
      }),
    ).toBeNull();
    expect(
      findSensitivePathTarget(['server.p12'], cwd, {
        disabledRules: new Set(['secret.ext.pem']),
        denyPaths: [],
      }),
    ).not.toBeNull();
    expect(
      findSensitivePathTarget(['id_rsa.pem'], cwd, {
        disabledRules: new Set(['secret.ext.pem']),
        denyPaths: [],
      }),
    ).not.toBeNull();
  });

  test('explicit deny paths still block when the default pattern is disabled', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(
      findSensitivePathTarget(['server.pem'], cwd, {
        disabledRules: new Set(['secret.ext.pem']),
        denyPaths: ['server.pem'],
      }),
    ).not.toBeNull();
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
    expect(findSensitiveTargetInCommand('custom-tool README.md', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('VAR=value', cwd)).toBeNull();
  });

  test('blocks unlisted file readers reading sensitive operands', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('xxd .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('base64 .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('openssl enc -in .env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('strings id_rsa', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('custom-tool .env', cwd)).not.toBeNull();
    // key=value operands (dd if=/of=) are unwrapped
    expect(findSensitiveTargetInCommand('dd if=.env', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('dd of=.env', cwd)).not.toBeNull();
  });

  test('does not flag unlisted commands with benign operands', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('custom-tool README.md', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('make FOO=bar', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('xxd README.md', cwd)).toBeNull();
  });

  test('scans find path roots without flagging predicate patterns', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('find ~/.ssh -type f', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('find secrets/ -type f', cwd)).not.toBeNull();
    // -name .env is a search pattern, not a read
    expect(findSensitiveTargetInCommand('find . -name .env', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('find src -type f', cwd)).toBeNull();
  });

  test('blocks interpreters reading sensitive paths from inline code', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(
      findSensitiveTargetInCommand(`python3 -c "print(open('.env').read())"`, cwd),
    ).not.toBeNull();
    expect(
      findSensitiveTargetInCommand(
        `node -e "console.log(require('fs').readFileSync('.env','utf8'))"`,
        cwd,
      ),
    ).not.toBeNull();
    expect(findSensitiveTargetInCommand(`ruby -e 'puts File.read(".env")'`, cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand(`python3.11 -c "open('.env')"`, cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('bash -c "cat .env"', cwd)).not.toBeNull();
    // script-file positionals are still checked
    expect(findSensitiveTargetInCommand('python3 ~/.ssh/id_rsa', cwd)).not.toBeNull();
  });

  test('blocks base64-decoded sensitive paths from inline interpreter literals', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(
      findSensitiveTargetInCommand(
        `python3 -c "import base64, os; b = base64.b64decode('LmVudg==').decode(); p = os.path.expanduser('~/Developer/420024-lab/test-cc/') + b; print(open(p).read())"`,
        cwd,
      ),
    ).not.toBeNull();
    expect(
      findSensitiveTargetInCommand(
        `node -e "const p = Buffer.from('fi8uc3NoL2lkX3JzYQ==', 'base64').toString(); require('fs').readFileSync(p, 'utf8')"`,
        cwd,
      ),
    ).not.toBeNull();
    expect(
      findSensitiveTargetInCommand(
        `ruby -e "require 'base64'; path = Base64.decode64('c2VjcmV0cy9wcm9kLmtleQ'); puts File.read(path)"`,
        cwd,
      ),
    ).not.toBeNull();
  });

  test('does not flag interpreters running benign code', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('python3 build.py', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand(`python3 -c "print('hello')"`, cwd)).toBeNull();
    expect(findSensitiveTargetInCommand(`node -e "console.log(1 + 1)"`, cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('bash -c "ls src"', cwd)).toBeNull();
    expect(
      findSensitiveTargetInCommand(
        `python3 -c "import base64; print(base64.b64decode('UkVBRE1FLm1k').decode())"`,
        cwd,
      ),
    ).toBeNull();
  });

  test('blocks variable indirection by capturing assignment values', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(
      findSensitiveTargetInCommand(`f=.env; python3 -c "print(open('$f').read())"`, cwd),
    ).not.toBeNull();
    expect(findSensitiveTargetInCommand('f=.env; cat $f', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('f=.env && cat "$f"', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('d=~/.ssh; cat $d/id_rsa', cwd)).not.toBeNull();
    expect(findSensitiveTargetInCommand('k=id_rsa; xxd $k', cwd)).not.toBeNull();
  });

  test('blocks base64-decoded sensitive paths in command substitutions', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(
      findSensitiveTargetInCommand(
        `b64=$(echo LmVudg== | base64 -d); python3 -c "print(open('$b64').read())"`,
        cwd,
      ),
    ).not.toBeNull();
    expect(
      findSensitiveTargetInCommand(
        'key=$(printf %s fi8uc3NoL2lkX3JzYQ== | base64 --decode); cat "$key"',
        cwd,
      ),
    ).not.toBeNull();
    expect(
      findSensitiveTargetInCommand(
        'file=$(printf %s c2VjcmV0cy9wcm9kLmtleQ | base64 -d); cat "$file"',
        cwd,
      ),
    ).not.toBeNull();
    expect(
      findSensitiveTargetInCommand(
        'npmrc=$(base64 --decode <<< Lm5wbXJj); python3 -c "open(\'$npmrc\')"',
        cwd,
      ),
    ).not.toBeNull();
  });

  test('does not decode base64-looking text outside decoder substitutions', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('echo LmVudg==', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('note=LmVudg==; echo "$note"', cwd)).toBeNull();
    expect(
      findSensitiveTargetInCommand('file=$(printf %s UkVBRE1FLm1k | base64 -d); cat "$file"', cwd),
    ).toBeNull();
  });

  test('does not flag assignments of benign values', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitiveTargetInCommand('VAR=value', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('msg=hello; echo $msg', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('f=README.md; cat $f', cwd)).toBeNull();
    expect(findSensitiveTargetInCommand('DEBUG=1 node app.js', cwd)).toBeNull();
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

describe('secret protection broad path signatures', () => {
  test('flags standalone sensitive extensions', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      'server.pem',
      'vault.kdbx',
      'prod.ovpn',
      'backup.sql',
      'wallet.keychain',
      'CERT.P12',
      '/tmp/archive.PKCS12',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
    }
  });

  test('flags regex-style sensitive extensions', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      'server.key',
      'deploy.keypair',
      'java.keystore',
      'gnome.keyring',
      'keepass.kdb',
      'keepass.kdbx',
      'database.sql',
      'database.sqldump',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
    }
  });

  test('does not flag log files by default', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    expect(findSensitivePathTarget(['application.log'], cwd)).toBeNull();
  });

  test('flags non-standard extensionless SSH key filenames', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      'deploy_key_rsa',
      'github_ed25519',
      'staging_ecdsa',
      'backup_dsa',
      '/tmp/DEPLOY_KEY_RSA',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
    }
  });

  test('does not flag public-key variants of broad SSH filenames', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of ['deploy_key_rsa.pub', 'github_ed25519.pub']) {
      expect(findSensitivePathTarget([target], cwd), target).toBeNull();
    }
  });

  test('skips dependency and cache paths for broad signatures only', () => {
    const cwd = join(tmpdir(), 'secret-protection-project');

    for (const target of [
      'node_modules/pkg/server.pem',
      'vendor/cache/vault.kdbx',
      'vendor/bundle/prod.ovpn',
      '.git/hooks/deploy_key_rsa',
      'src/__pycache__/database.sql',
    ]) {
      expect(findSensitivePathTarget([target], cwd), target).toBeNull();
    }

    for (const target of ['node_modules/pkg/.env', 'vendor/cache/id_rsa']) {
      expect(findSensitivePathTarget([target], cwd), target).not.toBeNull();
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
