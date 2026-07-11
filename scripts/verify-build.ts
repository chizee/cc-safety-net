import { readdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

export const BUILD_ARTIFACTS = [
  'dist/bin/cc-safety-net.js',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/pi/index.js',
] as const;

export function requiresRepositoryExecutableMode(platform: NodeJS.Platform): boolean {
  return platform !== 'win32';
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

export async function verifyBuildArtifacts(): Promise<string[]> {
  const files = await listFiles(resolve('dist'));
  if (JSON.stringify(files) !== JSON.stringify(BUILD_ARTIFACTS)) {
    throw new Error(`Unexpected build artifacts:\n${files.join('\n')}`);
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
  return files;
}
