import { readdir, readFile, stat } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { posix, relative, resolve } from 'node:path';
import pkg from '../package.json';
import { AMP_MANAGED_HEADER } from '../src/amp/index';

const AMP_ARTIFACT = 'dist/amp/cc-safety-net.ts';

const BUILD_ENTRY_ARTIFACTS = [
  AMP_ARTIFACT,
  'dist/bin/cc-safety-net.js',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/pi/index.js',
] as const;

function isBuildChunkArtifact(path: string): boolean {
  return /^dist\/chunks\/[A-Za-z0-9_-]+\.js$/.test(path);
}

/** @internal */
export function requiresRepositoryExecutableMode(platform: NodeJS.Platform): boolean {
  return platform !== 'win32';
}

/** @internal */
export function hasUnresolvedShellQuoteImport(source: string): boolean {
  return /(?:\bfrom\s+|\bimport\s*(?:\(\s*)?|\brequire\w*\(\s*)['"]shell-quote(?:\/[^'"]*)?['"]/.test(
    source,
  );
}

// Every module specifier the source actually imports or requires at runtime.
// Only import (`from "x"`), dynamic import (`import("x")`), and require (`require("x")`)
// positions are matched, so the word "import" appearing inside a string literal is ignored.
/** @internal */
export function getRuntimeImportSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(/(?:\bfrom\s*["']|\bimport\s*\(\s*["']|\brequire\w*\(\s*["'])([^"']+)["']/g),
  ]
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined);
}

// A self-contained artifact may only import Node built-ins; any other specifier
// (zod, a repository `@/` alias, a shared `./chunks/` file, `@ampcode/plugin`) means
// a runtime dependency leaked into the bundle.
/** @internal */
export function unbundledRuntimeImports(source: string): string[] {
  return [
    ...new Set(getRuntimeImportSpecifiers(source).filter((specifier) => !isBuiltin(specifier))),
  ];
}

async function listFiles(directory: string): Promise<string[]> {
  return (
    await Promise.all(
      (
        await readdir(directory, { withFileTypes: true })
      ).map(async (entry) => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) return listFiles(path);
        return [relative(process.cwd(), path).replaceAll('\\', '/')];
      }),
    )
  )
    .flat()
    .sort();
}

function getSharedChunkImports(path: string, source: string): string[] {
  return [...source.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined)
    .map((specifier) => posix.normalize(posix.join(posix.dirname(path), specifier)))
    .filter(isBuildChunkArtifact);
}

export async function verifyBuildArtifacts(): Promise<string[]> {
  const files = await listFiles(resolve('dist'));
  const unexpected = files.filter(
    (path) =>
      !(BUILD_ENTRY_ARTIFACTS as readonly string[]).includes(path) && !isBuildChunkArtifact(path),
  );
  const missingEntries = BUILD_ENTRY_ARTIFACTS.filter((path) => !files.includes(path));
  const chunks = files.filter(isBuildChunkArtifact);
  if (unexpected.length > 0 || missingEntries.length > 0) {
    throw new Error(`Unexpected build artifacts:\n${files.join('\n')}`);
  }

  const reachableChunks = new Set<string>();
  const pending = BUILD_ENTRY_ARTIFACTS.filter((path) => path.endsWith('.js')) as string[];
  const missingChunks = new Set<string>();
  while (pending.length > 0) {
    const path = pending.shift();
    if (!path) break;
    for (const chunk of getSharedChunkImports(path, await readFile(path, 'utf8'))) {
      if (!files.includes(chunk)) {
        missingChunks.add(chunk);
        continue;
      }
      if (reachableChunks.has(chunk)) continue;
      reachableChunks.add(chunk);
      pending.push(chunk);
    }
  }
  if (missingChunks.size > 0) {
    throw new Error(
      `Build artifacts reference missing shared chunks:\n${[...missingChunks].join('\n')}`,
    );
  }
  if (chunks.length === 0) {
    throw new Error('Build artifacts contain no shared chunks');
  }
  const orphanedChunks = chunks.filter((path) => !reachableChunks.has(path));
  if (orphanedChunks.length > 0) {
    throw new Error(
      `Build artifacts contain orphaned shared chunks:\n${orphanedChunks.join('\n')}`,
    );
  }
  if (
    requiresRepositoryExecutableMode(process.platform) &&
    ((await stat('dist/bin/cc-safety-net.js')).mode & 0o777) !== 0o755
  ) {
    throw new Error('dist/bin/cc-safety-net.js must have mode 0755');
  }
  if (!(await readFile('dist/bin/cc-safety-net.js', 'utf8')).startsWith('#!/usr/bin/env node\n')) {
    throw new Error('dist/bin/cc-safety-net.js has the wrong shebang');
  }
  const unresolvedShellQuoteImports = (
    await Promise.all(
      files
        .filter((path) => path.endsWith('.js'))
        .map(async (path) =>
          hasUnresolvedShellQuoteImport(await readFile(path, 'utf8')) ? path : null,
        ),
    )
  ).filter((path) => path !== null);
  if (unresolvedShellQuoteImports.length > 0) {
    throw new Error(
      `Build artifacts contain unresolved shell-quote imports:\n${unresolvedShellQuoteImports.join('\n')}`,
    );
  }
  await verifyAmpArtifact(await readFile(AMP_ARTIFACT, 'utf8'));
  return files;
}

/** @internal */
export function verifyAmpArtifact(source: string): void {
  if (!source.startsWith(AMP_MANAGED_HEADER)) {
    throw new Error('Amp artifact is missing the managed-file header');
  }
  if (!source.includes(`// version: ${pkg.version}`)) {
    throw new Error(`Amp artifact is missing the package version ${pkg.version}`);
  }
  const unresolved = unbundledRuntimeImports(source);
  if (unresolved.length > 0) {
    throw new Error(`Amp artifact has unresolved runtime imports:\n${unresolved.join('\n')}`);
  }
}
