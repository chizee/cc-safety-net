/**
 * Amp personal-scope install: the plugin is pushed to the user's Amp Personal Plugins
 * repository over hidden git plumbing. Every `amp`/`git` call goes through the injected
 * runner, so no test here touches the network or a real Amp repository.
 */

import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { buildAmpArtifactHeader } from '@/integrations/amp/artifact';
import { getAmpPluginPath, installAmp, uninstallAmp } from '@/integrations/amp/install';
import type { AmpRunner } from '@/integrations/amp/run';
import { getPackageVersion } from '@/integrations/system-info';
import { normalizeGuiPolicy } from '@/policy/store';
import { withEnv } from '../../helpers.ts';
import { makeTempHome } from '../hook-helpers.ts';

const CLONE_REF = 'jliew/-/plugins';
const REPOSITORIES_JSON = JSON.stringify(
  [
    {
      scope: 'user',
      exists: true,
      cloneURL: 'https://ampcode.com/git/@jliew/-/plugins',
      viewerCanWrite: true,
      cloneRef: CLONE_REF,
    },
  ],
  null,
  2,
);

function writeArtifactFixture(dir: string): string {
  const artifactPath = join(dir, 'artifact.ts');
  writeFileSync(artifactPath, `${buildAmpArtifactHeader('9.9.9')}export default function () {}\n`);
  return artifactPath;
}

type StubOptions = {
  /** Response for `amp plugins repositories --json`. */
  repositories?: { status?: number | null; errorCode?: string; stdout?: string; stderr?: string };
  /** Populate the fake checkout the way the hosted repository would. */
  seedCheckout?: (checkout: string) => void;
  /** Joined command prefix that should fail. */
  failCommand?: string;
  /** Emulate core.autocrlf: staging renormalizes the file back to HEAD, so the tree stays clean. */
  stageLeavesTreeClean?: boolean;
};

function makeAmpStub(options: StubOptions = {}) {
  const calls: string[] = [];
  const state: { checkout?: string; staged?: string; dirty?: boolean } = {};
  const run: AmpRunner = (command, cwd) => {
    const line = command.join(' ');
    calls.push(line);

    if (line === 'amp plugins repositories --json') {
      return {
        status:
          options.repositories && 'status' in options.repositories
            ? (options.repositories.status ?? null)
            : 0,
        errorCode: options.repositories?.errorCode,
        stdout: options.repositories?.stdout ?? REPOSITORIES_JSON,
        stderr: options.repositories?.stderr ?? '',
      };
    }
    if (line === 'git status --porcelain') {
      return { status: 0, stdout: state.dirty ? 'M  cc-safety-net.ts\n' : '', stderr: '' };
    }
    if (options.failCommand && line.startsWith(options.failCommand)) {
      return { status: 1, stdout: '', stderr: `${command[0]}: boom` };
    }
    if (command[1] === 'clone') {
      state.checkout = command[3];
      if (command[3]) options.seedCheckout?.(command[3]);
      return { status: 0, stdout: '', stderr: '' };
    }
    if (line.startsWith('git add') && cwd) {
      const staged = join(cwd, 'cc-safety-net.ts');
      state.staged = existsSync(staged) ? readFileSync(staged, 'utf-8') : undefined;
    }
    if (line.startsWith('git add') || line.startsWith('git rm')) {
      state.dirty = !options.stageLeavesTreeClean;
    }
    return { status: 0, stdout: '', stderr: '' };
  };

  return { calls, run, state };
}

/** Stub whose checkout already holds the exact bytes of the packaged artifact. */
function makeCurrentCheckoutStub(artifactPath: string) {
  return makeAmpStub({
    seedCheckout: (checkout) =>
      writeFileSync(join(checkout, 'cc-safety-net.ts'), readFileSync(artifactPath)),
  });
}

function gitCalls(calls: readonly string[]): string[] {
  return calls.filter((call) => call.startsWith('git '));
}

function withTempHome<T>(name: string, run: (homeDir: string) => T): T {
  const homeDir = makeTempHome(name);
  try {
    return run(homeDir);
  } finally {
    rmSync(homeDir, { recursive: true, force: true });
  }
}

function writeLocalPlugin(homeDir: string, content: string): string {
  const localPath = getAmpPluginPath(homeDir);
  mkdirSync(join(localPath, '..'), { recursive: true });
  writeFileSync(localPath, content);
  return localPath;
}

/**
 * Installs with the user policy file at `<homeDir>/.cc-safety-net/policy.json`.
 * CC_SAFETY_NET_HOME redirects the policy lookup and HOME redirects the home-relative path
 * repair that normalization performs, so no case here reads the developer's real home.
 */
function installWithUserPolicy(
  homeDir: string,
  artifactPath: string,
  run: AmpRunner,
  policyJson?: string,
) {
  const safetyNetHome = join(homeDir, '.cc-safety-net');
  mkdirSync(safetyNetHome, { recursive: true });
  if (policyJson !== undefined) writeFileSync(join(safetyNetHome, 'policy.json'), policyJson);
  return withEnv({ CC_SAFETY_NET_HOME: safetyNetHome, HOME: homeDir }, () =>
    installAmp(homeDir, artifactPath, run),
  );
}

/** The published bytes past the packaged artifact: the policy stamp, or '' when unstamped. */
function stampedSuffix(staged: string | undefined, artifactPath: string): string {
  return String(staged).slice(readFileSync(artifactPath, 'utf-8').length);
}

describe('Amp personal install', () => {
  test('pushes the packaged artifact to the personal plugins repository', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub();

      const result = installAmp(homeDir, artifactPath, stub.run);

      expect(result.alreadyInstalled).toBe(false);
      expect(result.path).toBe(`${CLONE_REF}/cc-safety-net.ts`);
      expect(stub.calls[0]).toBe('amp plugins repositories --json');
      expect(stub.calls[1]).toBe(`amp clone user-plugins ${stub.state.checkout}`);
      expect(stub.state.staged).toBe(readFileSync(artifactPath, 'utf-8'));
      expect(gitCalls(stub.calls)).toEqual([
        'git add cc-safety-net.ts',
        'git status --porcelain',
        `git -c commit.gpgsign=false commit -m chore: update cc-safety-net plugin to v${getPackageVersion()}`,
        'git push origin HEAD',
      ]);
      expect(existsSync(String(stub.state.checkout))).toBe(false);
    });
  });

  test('reports already installed and pushes nothing when the bytes match', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeCurrentCheckoutStub(artifactPath);

      const result = installAmp(homeDir, artifactPath, stub.run);

      expect(result.alreadyInstalled).toBe(true);
      expect(result.path).toBe(`${CLONE_REF}/cc-safety-net.ts`);
      expect(gitCalls(stub.calls)).toEqual([]);
    });
  });

  test('replaces an outdated managed artifact in the checkout', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub({
        seedCheckout: (checkout) =>
          writeFileSync(
            join(checkout, 'cc-safety-net.ts'),
            `${buildAmpArtifactHeader('0.0.1')}export default 0;\n`,
          ),
      });

      const result = installAmp(homeDir, artifactPath, stub.run);

      expect(result.alreadyInstalled).toBe(false);
      expect(stub.state.staged).toBe(readFileSync(artifactPath, 'utf-8'));
    });
  });

  test('refuses an unmanaged file in the personal plugins repository', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub({
        seedCheckout: (checkout) =>
          writeFileSync(join(checkout, 'cc-safety-net.ts'), 'export default 1;\n'),
      });

      expect(() => installAmp(homeDir, artifactPath, stub.run)).toThrow(
        'Refusing to overwrite unmanaged file',
      );
      expect(gitCalls(stub.calls)).toEqual([]);
      expect(existsSync(String(stub.state.checkout))).toBe(false);
    });
  });

  test('reports already installed when staging renormalizes the checkout back to HEAD', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub({
        // core.autocrlf smudges the committed LF plugin to CRLF, so the bytes differ even
        // though `git add` renormalizes the index straight back to HEAD.
        seedCheckout: (checkout) =>
          writeFileSync(
            join(checkout, 'cc-safety-net.ts'),
            readFileSync(artifactPath, 'utf-8').replaceAll('\n', '\r\n'),
          ),
        stageLeavesTreeClean: true,
      });

      const result = installAmp(homeDir, artifactPath, stub.run);

      expect(result.alreadyInstalled).toBe(true);
      expect(gitCalls(stub.calls)).toEqual(['git add cc-safety-net.ts', 'git status --porcelain']);
    });
  });

  test.each([
    [
      'a symlink',
      (checkout: string, target: string) => symlinkSync(target, join(checkout, 'cc-safety-net.ts')),
    ],
    ['a directory', (checkout: string) => mkdirSync(join(checkout, 'cc-safety-net.ts'))],
  ])('refuses %s at the plugin path in the personal plugins repository', (_label, seed) => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub({ seedCheckout: (checkout) => seed(checkout, artifactPath) });

      expect(() => installAmp(homeDir, artifactPath, stub.run)).toThrow('not a regular file');
      expect(gitCalls(stub.calls)).toEqual([]);
    });
  });

  test('fails with an actionable message when the amp CLI is missing', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub({
        repositories: { status: null, errorCode: 'ENOENT', stderr: 'spawn amp ENOENT' },
      });

      expect(() => installAmp(homeDir, artifactPath, stub.run)).toThrow('Amp CLI not found');
      expect(stub.calls).toEqual(['amp plugins repositories --json']);
    });
  });

  test('does not blame a missing CLI when the amp command times out', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub({
        repositories: { status: null, errorCode: 'ETIMEDOUT', stderr: 'spawnSync amp ETIMEDOUT' },
      });

      expect(() => installAmp(homeDir, artifactPath, stub.run)).toThrow(
        /did not finish \(ETIMEDOUT\)/,
      );
    });
  });

  test('fails on the preflight step when amp plugins repositories exits non-zero', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub({
        repositories: { status: 1, stdout: '', stderr: 'not signed in' },
      });

      expect(() => installAmp(homeDir, artifactPath, stub.run)).toThrow(
        /amp plugins repositories --json/,
      );
      expect(stub.calls).toEqual(['amp plugins repositories --json']);
    });
  });

  test('fails when no writable personal plugins repository exists', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub({
        repositories: {
          stdout: JSON.stringify([
            { scope: 'user', exists: true, viewerCanWrite: false, cloneRef: CLONE_REF },
          ]),
        },
      });

      expect(() => installAmp(homeDir, artifactPath, stub.run)).toThrow(
        /Personal Plugins repository/,
      );
      expect(stub.calls).toEqual(['amp plugins repositories --json']);
    });
  });

  test('fails with the actionable message when the repositories output is not JSON', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub({ repositories: { stdout: 'not json' } });

      expect(() => installAmp(homeDir, artifactPath, stub.run)).toThrow(
        /Personal Plugins repository/,
      );
      expect(stub.calls).toEqual(['amp plugins repositories --json']);
    });
  });

  test('reports the failed step and removes the checkout when the push fails', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub({ failCommand: 'git push' });

      expect(() => installAmp(homeDir, artifactPath, stub.run)).toThrow(/git push origin HEAD/);
      expect(existsSync(String(stub.state.checkout))).toBe(false);
    });
  });

  test('reports the failed step when the clone fails', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub({ failCommand: 'amp clone' });

      expect(() => installAmp(homeDir, artifactPath, stub.run)).toThrow(/amp clone user-plugins/);
    });
  });

  test('removes a leftover managed local plugin that would mask the personal one', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const localPath = writeLocalPlugin(
        homeDir,
        `${buildAmpArtifactHeader('0.0.1')}export default 0;\n`,
      );
      const stub = makeAmpStub();

      installAmp(homeDir, artifactPath, stub.run);

      expect(existsSync(localPath)).toBe(false);
    });
  });

  test('removes the masking local plugin even when the personal copy is current', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const localPath = writeLocalPlugin(homeDir, readFileSync(artifactPath, 'utf-8'));
      const stub = makeCurrentCheckoutStub(artifactPath);

      const result = installAmp(homeDir, artifactPath, stub.run);

      expect(result.alreadyInstalled).toBe(true);
      expect(existsSync(localPath)).toBe(false);
    });
  });

  test('keeps an unmanaged local file at the system plugin path', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const localPath = writeLocalPlugin(homeDir, 'export default 1;\n');

      installAmp(homeDir, artifactPath, makeAmpStub().run);

      expect(readFileSync(localPath, 'utf-8')).toBe('export default 1;\n');
    });
  });

  test('keeps a symlink at the system plugin path even when it points at managed content', () => {
    withTempHome('safety-net-amp-personal', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const localPath = getAmpPluginPath(homeDir);
      mkdirSync(join(localPath, '..'), { recursive: true });
      symlinkSync(artifactPath, localPath);

      installAmp(homeDir, artifactPath, makeAmpStub().run);
      expect(lstatSync(localPath).isSymbolicLink()).toBe(true);

      uninstallAmp(homeDir, makeAmpStub().run);
      expect(lstatSync(localPath).isSymbolicLink()).toBe(true);
    });
  });
});

describe('Amp personal install policy snapshot', () => {
  const POLICY_JSON = JSON.stringify({
    version: 1,
    safety: { level: 'strict', overrides: {} },
    destructive_command_protection: {
      enabled: true,
      overrides: { 'git.reset-hard': 'off', 'bogus.rule': 'off' },
      allow_paths: [],
    },
    smuggled: '";process.exit(1);//',
  });

  test('appends the normalized policy snapshot to the published artifact', () => {
    withTempHome('safety-net-amp-policy', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub();

      installWithUserPolicy(homeDir, artifactPath, stub.run, POLICY_JSON);

      const stamp = stampedSuffix(stub.state.staged, artifactPath);
      expect(stamp).toBe(
        `;globalThis.__CC_SAFETY_NET_EMBEDDED_POLICY__ = ${JSON.stringify(
          normalizeGuiPolicy(JSON.parse(POLICY_JSON)),
        )};\n`,
      );
      // Normalization, not the raw file bytes, is what reaches the emitted code.
      expect(stamp).not.toContain('smuggled');
      expect(stamp).not.toContain('bogus.rule');
      expect(stamp).toContain('"level":"strict"');
    });
  });

  test.each([
    ['no policy file', undefined],
    ['an empty policy file', '  \n'],
    ['an unparseable policy file', '{ not json'],
    ['a policy file that is not a JSON object', '"paranoid"'],
  ])('publishes the bare artifact with %s', (_label, policyJson) => {
    withTempHome('safety-net-amp-policy', (homeDir) => {
      const artifactPath = writeArtifactFixture(homeDir);
      const stub = makeAmpStub();

      installWithUserPolicy(homeDir, artifactPath, stub.run, policyJson);

      expect(stub.state.staged).toBe(readFileSync(artifactPath, 'utf-8'));
    });
  });

  /** Publishes with POLICY_JSON, then reinstalls over a checkout already holding those bytes. */
  function reinstallOverPublished(homeDir: string, policyJson: string) {
    const artifactPath = writeArtifactFixture(homeDir);
    const first = makeAmpStub();
    installWithUserPolicy(homeDir, artifactPath, first.run, POLICY_JSON);

    const second = makeAmpStub({
      seedCheckout: (checkout) =>
        writeFileSync(join(checkout, 'cc-safety-net.ts'), String(first.state.staged)),
    });
    return {
      artifactPath,
      stub: second,
      result: installWithUserPolicy(homeDir, artifactPath, second.run, policyJson),
    };
  }

  test('reports already installed when the checkout already holds the stamped artifact', () => {
    withTempHome('safety-net-amp-policy', (homeDir) => {
      const reinstall = reinstallOverPublished(homeDir, POLICY_JSON);

      expect(reinstall.result.alreadyInstalled).toBe(true);
      expect(gitCalls(reinstall.stub.calls)).toEqual([]);
    });
  });

  test('republishes after the user edits the policy file', () => {
    withTempHome('safety-net-amp-policy', (homeDir) => {
      const reinstall = reinstallOverPublished(
        homeDir,
        JSON.stringify({ version: 1, safety: { level: 'paranoid', overrides: {} } }),
      );

      expect(reinstall.result.alreadyInstalled).toBe(false);
      expect(gitCalls(reinstall.stub.calls)).toContain('git push origin HEAD');
      expect(stampedSuffix(reinstall.stub.state.staged, reinstall.artifactPath)).toContain(
        '"level":"paranoid"',
      );
    });
  });
});

describe('Amp personal uninstall', () => {
  test('removes, commits and pushes the managed file', () => {
    withTempHome('safety-net-amp-personal-uninstall', (homeDir) => {
      const stub = makeAmpStub({
        seedCheckout: (checkout) =>
          writeFileSync(
            join(checkout, 'cc-safety-net.ts'),
            `${buildAmpArtifactHeader('1.0.0')}export default 0;\n`,
          ),
      });

      const result = uninstallAmp(homeDir, stub.run);

      expect(result.alreadyInstalled).toBe(true);
      expect(result.path).toBe(`${CLONE_REF}/cc-safety-net.ts`);
      expect(gitCalls(stub.calls)).toEqual([
        'git rm cc-safety-net.ts',
        'git status --porcelain',
        `git -c commit.gpgsign=false commit -m chore: remove cc-safety-net plugin v${getPackageVersion()}`,
        'git push origin HEAD',
      ]);
      expect(existsSync(String(stub.state.checkout))).toBe(false);
    });
  });

  test('reports not installed when the personal repository has no plugin', () => {
    withTempHome('safety-net-amp-personal-uninstall', (homeDir) => {
      const stub = makeAmpStub();

      const result = uninstallAmp(homeDir, stub.run);

      expect(result.alreadyInstalled).toBe(false);
      expect(gitCalls(stub.calls)).toEqual([]);
    });
  });

  test('refuses to remove an unmanaged file from the personal repository', () => {
    withTempHome('safety-net-amp-personal-uninstall', (homeDir) => {
      const stub = makeAmpStub({
        seedCheckout: (checkout) =>
          writeFileSync(join(checkout, 'cc-safety-net.ts'), 'export default 1;\n'),
      });

      expect(() => uninstallAmp(homeDir, stub.run)).toThrow('Refusing to remove unmanaged file');
      expect(gitCalls(stub.calls)).toEqual([]);
    });
  });

  test('also removes the managed local plugin and keeps an unmanaged one', () => {
    withTempHome('safety-net-amp-personal-uninstall', (homeDir) => {
      const managed = writeLocalPlugin(
        homeDir,
        `${buildAmpArtifactHeader('1.0.0')}export default 0;\n`,
      );
      uninstallAmp(homeDir, makeAmpStub().run);
      expect(existsSync(managed)).toBe(false);

      writeLocalPlugin(homeDir, 'export default 1;\n');
      uninstallAmp(homeDir, makeAmpStub().run);
      expect(readFileSync(managed, 'utf-8')).toBe('export default 1;\n');
    });
  });
});
