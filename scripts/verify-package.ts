#!/usr/bin/env bun

import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const PACKAGE_FILES = [
  'package/LICENSE',
  'package/README.md',
  'package/dist/bin/cc-safety-net.js',
  'package/dist/index.d.ts',
  'package/dist/index.js',
  'package/dist/pi/index.js',
  'package/package.json',
] as const;
const MAX_TARBALL_BYTES = 369_000;

interface PackResult {
  filename: string;
  size: number;
  files: Array<{ path: string; mode: number }>;
}

interface BuildPackageTarballOptions {
  outputDirectory: string;
  gitHead?: string;
  npmCommand?: string[];
}

function run(command: string[], cwd = process.cwd(), allowedExitCodes = [0], stdin?: string) {
  const result = Bun.spawnSync(command, {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    ...(stdin === undefined ? {} : { stdin: Buffer.from(stdin) }),
  });
  if (allowedExitCodes.includes(result.exitCode)) return result;
  throw new Error(
    `${command.join(' ')} failed (${result.exitCode})\n${result.stdout}${result.stderr}`,
  );
}

export async function verifyPackage(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'cc-safety-net-package-'));
  const outputArgument = process.argv.indexOf('--output');
  const outputDirectory =
    outputArgument === -1
      ? directory
      : resolve(process.argv[outputArgument + 1] ?? throwMissingOutputDirectory());
  mkdirSync(outputDirectory, { recursive: true });
  try {
    const gitHeadArgument = process.argv.indexOf('--git-head');
    const { result, tarball } = await buildPackageTarball({
      outputDirectory,
      ...(gitHeadArgument === -1
        ? {}
        : { gitHead: process.argv[gitHeadArgument + 1] ?? throwMissingGitHead() }),
    });
    const files = result.files.map((file) => `package/${file.path}`).sort();
    if (JSON.stringify(files) !== JSON.stringify(PACKAGE_FILES)) {
      throw new Error(`Unexpected npm package files:\n${files.join('\n')}`);
    }
    if (result.size > MAX_TARBALL_BYTES) {
      throw new Error(`npm tarball is ${result.size} bytes; maximum is ${MAX_TARBALL_BYTES}`);
    }
    const bin = result.files.find((file) => file.path === 'dist/bin/cc-safety-net.js');
    if (!bin || bin.mode !== 0o755) throw new Error('Packed CLI mode is not 0755');
    if (result.files.some((file) => file !== bin && file.mode !== 0o644)) {
      throw new Error('Packed non-executable files must have mode 0644');
    }

    run(['npm', 'init', '--yes'], directory);
    run(
      [
        'npm',
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        tarball,
        '@opencode-ai/plugin@1.0.224',
        '@types/node@18',
        'typescript@5',
      ],
      directory,
    );
    const packageRoot = join(directory, 'node_modules', 'cc-safety-net');
    const cli = join(packageRoot, 'dist', 'bin', 'cc-safety-net.js');
    const overLimitRulebook = join(
      directory,
      '.cc-safety-net',
      'rules',
      'package-limits',
      'rulebook.json',
    );
    mkdirSync(resolve(overLimitRulebook, '..'), { recursive: true });
    writeFileSync(
      overLimitRulebook,
      JSON.stringify({
        rulebook_version: 1,
        name: 'package-limits',
        version: '1.0.0',
        allowed_commands: ['echo'],
        rules: [
          {
            name: 'oversized',
            command: 'echo',
            block_args: Array(1_025).fill('TOPSECRET'),
            reason: 'TOPSECRET',
          },
        ],
        tests: [{ command: 'echo TOPSECRET', expect: 'blocked', rule: 'oversized' }],
      }),
    );
    const ruleLimitResult = run(['node', cli, 'rule', 'test', 'package-limits'], directory, [1]);
    if (
      !ruleLimitResult.stderr.includes(
        "Rulebook exceeds CC Safety Net's safe validation limits.",
      ) ||
      ruleLimitResult.stderr.includes('TOPSECRET')
    ) {
      throw new Error('Packed CLI did not fail closed on an over-limit rulebook');
    }
    for (const args of [
      ['--version'],
      ['--help'],
      ['explain', '--json', 'git status'],
      ['explain', '--json', 'git reset --hard'],
    ]) {
      run(['node', cli, ...args], directory);
    }
    if (
      !run(['node', cli, 'explain', '--json', 'git status'], directory).stdout.includes('allowed')
    ) {
      throw new Error('Packed CLI did not allow the safe explain command');
    }
    if (
      !run(['node', cli, 'explain', '--json', 'git reset --hard'], directory).stdout.includes(
        'blocked',
      )
    ) {
      throw new Error('Packed CLI did not block the destructive explain command');
    }
    const aliasConfigReason =
      'Git aliases supplied through command-line or environment config can hide or execute commands. Run git without Git alias overrides, or ask the user to run it manually.';
    for (const command of ['GIT_CONFIG_COUNT=1025 git status', 'GIT_CONFIG_COUNT=1 git status']) {
      const output = JSON.parse(
        run(
          ['node', cli, 'hook', '--claude-code'],
          directory,
          [0],
          JSON.stringify({
            session_id: 'package-verification',
            cwd: directory,
            hook_event_name: 'PreToolUse',
            tool_name: 'Bash',
            tool_input: { command },
          }),
        ).stdout.toString(),
      ) as {
        hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
      };
      if (
        output.hookSpecificOutput?.permissionDecision !== 'deny' ||
        output.hookSpecificOutput.permissionDecisionReason !==
          `BLOCKED by CC Safety Net\n\nReason: ${aliasConfigReason}\n\nRule: git.alias-config\n\nCommand: ${command}\n\nIf this operation is truly needed, ask the user for explicit permission and have them run the command manually.`
      ) {
        throw new Error(`Packed CLI did not fail closed on incomplete Git config: ${command}`);
      }
    }
    const largeSafeCommand = `'git push ${'x '.repeat(45_000)}'`;
    if (
      !run(['node', cli, 'explain', '--json', largeSafeCommand], directory).stdout.includes(
        'allowed',
      )
    ) {
      throw new Error('Packed CLI did not allow the large safe explain command');
    }

    const evalModule = (source: string, expected = 0) =>
      run(['node', '--input-type=module', '--eval', source], directory, [expected]);
    evalModule(
      "import * as api from 'cc-safety-net'; if (Object.keys(api).join() !== 'CCSafetyNetPlugin') process.exit(2)",
    );
    run(['node', '--eval', "require('cc-safety-net')"], directory, [1]);
    evalModule("import 'cc-safety-net/dist/index.js'", 1);
    evalModule(`
      import { createRequire } from 'node:module';
      import { dirname, resolve } from 'node:path';
      import { pathToFileURL } from 'node:url';
      const require = createRequire(import.meta.url);
      const packageRoot = dirname(require.resolve('cc-safety-net/package.json'));
      const manifest = require(resolve(packageRoot, 'package.json'));
      if (JSON.stringify(manifest.dependencies) !== JSON.stringify({ zod: '4.3.5' })) process.exit(4);
      if (manifest.peerDependencies['@opencode-ai/plugin'] !== '^1.0.224') process.exit(5);
      if (!manifest.peerDependenciesMeta['@opencode-ai/plugin'].optional) process.exit(6);
      const extension = manifest.pi.extensions[0];
      if (extension !== './dist/pi/index.js') process.exit(2);
      const loaded = await import(pathToFileURL(resolve(packageRoot, extension)).href);
      if (typeof loaded.default !== 'function') process.exit(3);
    `);

    writeFileSync(
      join(directory, 'consumer.ts'),
      "import { CCSafetyNetPlugin } from 'cc-safety-net';\nvoid CCSafetyNetPlugin;\n",
    );
    writeFileSync(
      join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          noEmit: true,
          strict: true,
          target: 'ES2022',
        },
        files: ['consumer.ts'],
      }),
    );
    run([join(directory, 'node_modules', '.bin', 'tsc'), '--project', 'tsconfig.json'], directory);
    console.log(`Verified ${basename(tarball)} (${result.size} bytes)`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function buildPackageTarball(options: BuildPackageTarballOptions) {
  if (options.gitHead && !/^[0-9a-f]{40}$/.test(options.gitHead)) {
    throw new Error(`gitHead must be a full commit SHA: ${options.gitHead}`);
  }
  const stagingDirectory = mkdtempSync(join(tmpdir(), 'cc-safety-net-pack-stage-'));
  try {
    cpSync('README.md', join(stagingDirectory, 'README.md'));
    cpSync('LICENSE', join(stagingDirectory, 'LICENSE'));
    cpSync('dist', join(stagingDirectory, 'dist'), { recursive: true });
    chmodSync(join(stagingDirectory, 'dist', 'bin', 'cc-safety-net.js'), 0o755);
    const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as Record<string, unknown>;
    delete manifest.gitHead;
    writeFileSync(
      join(stagingDirectory, 'package.json'),
      `${JSON.stringify(options.gitHead ? { ...manifest, gitHead: options.gitHead } : manifest, null, 2)}\n`,
    );
    const packed = JSON.parse(
      run([
        ...(options.npmCommand ?? ['npm']),
        'pack',
        stagingDirectory,
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        options.outputDirectory,
      ]).stdout.toString(),
    ) as PackResult[];
    const result = packed[0];
    if (!result) throw new Error('npm pack did not report an artifact');
    const tarball = resolve(options.outputDirectory, result.filename);
    const packedManifest = run(['tar', '-xOf', tarball, 'package/package.json']);
    const actualGitHead = (JSON.parse(packedManifest.stdout.toString()) as { gitHead?: string })
      .gitHead;
    if (actualGitHead !== options.gitHead) {
      throw new Error(
        `Packed gitHead mismatch: expected ${options.gitHead ?? 'absent'}, found ${actualGitHead ?? 'absent'}`,
      );
    }
    return { result, tarball };
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

function throwMissingOutputDirectory(): never {
  throw new Error('--output requires a directory');
}

function throwMissingGitHead(): never {
  throw new Error('--git-head requires a full commit SHA');
}

if (import.meta.main) await verifyPackage();
