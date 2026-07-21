import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const workflows = [
  '.github/workflows/ci.yml',
  '.github/workflows/test-windows.yml',
  '.github/workflows/lint-github-actions-workflows.yml',
  '.github/workflows/prepare-release.yml',
  '.github/workflows/publish.yml',
].map((path) => [path, readFileSync(path, 'utf8')] as const);

describe('CI and release workflows', () => {
  test('pins third-party actions and the Bun toolchain', () => {
    for (const [path, workflow] of workflows) {
      for (const line of workflow.split('\n').filter((line) => line.includes('uses:'))) {
        expect(line, `${path}: ${line}`).toMatch(/uses: [^\s]+@[0-9a-f]{40}$/);
      }
      if (workflow.includes('setup-bun')) {
        expect(workflow).toContain('bun-version: 1.3.14');
      }
    }
  });

  test('runs CI without path filters and never mutates generated files', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).not.toContain('paths:');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('Auto-commit');
    expect(workflow).toContain('git diff --exit-code -- dist assets/cc-safety-net.schema.json');
  });

  test('stress-checks E2E stability and preserves failure evidence', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const windows = readFileSync('.github/workflows/test-windows.yml', 'utf8');
    expect(ci).toContain('run: bun run test:e2e:stability');
    for (const workflow of [ci, windows]) {
      expect(workflow).toContain(
        'CC_SAFETY_NET_E2E_ARTIFACTS: ${{ runner.temp }}/cc-safety-net-e2e',
      );
      expect(workflow).toContain('if: ${{ failure() }}');
      expect(workflow).toContain('uses: actions/upload-artifact@');
      expect(workflow).toContain('if-no-files-found: ignore');
    }
  });

  test('audits bundled build dependencies instead of omitting development dependencies', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toContain('run: bun run audit:dependencies');
    expect(workflow).not.toMatch(/bun audit[^\n]*(?:--production|--omit[= ]dev)/);
  });

  test('contains no history-rewriting release commands', () => {
    const source = workflows.map((entry) => entry[1]).join('\n');
    expect(source).not.toMatch(/git (?:push[^\n]*--force|reset|rebase|tag -f)/);
    expect(source).toContain('npm publish');
    expect(source).toContain('--provenance');
    expect(source).toContain('id-token: write');
  });

  test('publishes the exact tarball exercised by the package verifier', () => {
    const workflow = readFileSync('.github/workflows/publish.yml', 'utf8');
    expect(workflow).toContain('verify-package.ts --output package-output');
    expect(workflow).not.toContain('npm pack --ignore-scripts --pack-destination');
    expect(workflow).toContain('npm publish "$TARBALL"');
    expect(workflow).not.toContain('--clobber');
    expect(workflow).toContain('cmp "existing/');
  });

  test('binds publishing to a protected tag environment and least-privilege jobs', () => {
    const prepare = readFileSync('.github/workflows/prepare-release.yml', 'utf8');
    const publish = readFileSync('.github/workflows/publish.yml', 'utf8');
    expect(publish).toContain('test "$GITHUB_REF" = "refs/tags/$TAG"');
    expect(publish).toContain('test "$GITHUB_REF_TYPE" = "tag"');
    expect(publish).toContain('environment: npm');
    expect(publish).toContain('gitHead');
    expect(prepare).toContain('persist-credentials: false');
    expect(prepare).toContain('bun run scripts/release-transaction.ts');
    expect(prepare).not.toContain('git commit -m');
    expect(prepare).not.toContain('git tag "v${VERSION}"');
    expect(publish.match(/id-token: write/g)).toHaveLength(1);
    expect(publish.slice(publish.indexOf('publish-github-release:'))).not.toContain('bun install');
    expect(publish.slice(publish.indexOf('publish-github-release:'))).not.toContain(
      'bun run build',
    );
    expect(prepare.slice(prepare.indexOf('mutate:'))).not.toContain('bun install');
    expect(prepare.slice(prepare.indexOf('mutate:'))).not.toContain('bun run build');
    const mutate = prepare.slice(prepare.indexOf('\n  mutate:'), prepare.indexOf('\n  dispatch:'));
    const dispatch = prepare.slice(prepare.indexOf('\n  dispatch:'));
    expect(mutate).toContain('contents: write');
    expect(mutate).not.toContain('actions: write');
    expect(dispatch).toContain('actions: write');
    expect(dispatch).not.toContain('actions/checkout');
    expect(dispatch).not.toContain('setup-bun');
    expect(dispatch).not.toContain('bun install');
    expect(dispatch).toContain(
      'gh workflow run publish.yml --repo "$GITHUB_REPOSITORY" --ref "$TAG" -f tag="$TAG"',
    );
  });

  test('keeps Windows repository-mode checks portable while verifying packed mode', () => {
    const windows = readFileSync('.github/workflows/test-windows.yml', 'utf8');
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    expect(windows).not.toContain('bun run check:ci');
    for (const command of ['lint:ci', 'typecheck', 'knip', 'check-duplicates', 'sg:scan']) {
      expect(windows).toContain(`bun run ${command}`);
    }
    expect(windows).toContain("bun test tests --test-name-pattern '\\[windows\\]'");
    expect(windows).toContain('if (-not ($result -match "ALLOWED")) { exit 1 }');
    expect(windows).toContain('bun run build');
    expect(ci).toContain('os: windows-latest');
    expect(ci).toContain('bun run verify:package');
  });
});
