import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFile } from '@/bin/hook/install/atomic-write';
import type { InstallResult } from '@/bin/hook/install/types';
import { AMP_MANAGED_HEADER } from '@/integrations/amp';

const AMP_ARTIFACT_RELATIVE = join('amp', 'cc-safety-net.ts');

export function getAmpPluginPath(homeDir: string): string {
  return join(homeDir, '.config', 'amp', 'plugins', 'cc-safety-net.ts');
}

/**
 * Candidate locations of the packaged Amp artifact, resolved relative to the
 * installed CLI module (never the user's project). The bundled CLI and its
 * chunks sit one directory under `dist/`; the dev entrypoint runs from
 * `src/bin/hook/install/`.
 * @internal
 */
export function ampArtifactCandidates(): string[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return [
    join(moduleDir, '..', AMP_ARTIFACT_RELATIVE),
    join(moduleDir, '..', '..', '..', '..', 'dist', AMP_ARTIFACT_RELATIVE),
  ];
}

/** @internal */
export function resolveAmpArtifactPath(
  candidates: readonly string[] = ampArtifactCandidates(),
): string {
  const found = candidates.find((path) => existsSync(path) && lstatSync(path).isFile());
  if (!found)
    throw new Error(
      'Packaged Amp plugin artifact not found. Reinstall cc-safety-net and try again.',
    );
  return found;
}

function lstatOrUndefined(path: string) {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

function isManagedAmpArtifact(content: Buffer): boolean {
  return (
    content.subarray(0, Buffer.byteLength(AMP_MANAGED_HEADER)).toString('utf-8') ===
    AMP_MANAGED_HEADER
  );
}

export function installAmp(
  homeDir: string,
  artifactPath: string = resolveAmpArtifactPath(),
): InstallResult {
  const artifact = readFileSync(artifactPath);
  const dest = getAmpPluginPath(homeDir);
  const info = lstatOrUndefined(dest);

  if (!info) {
    mkdirSync(dirname(dest), { recursive: true });
    atomicWriteFile(dest, artifact);
    return { path: dest, alreadyInstalled: false };
  }
  if (info.isSymbolicLink() || !info.isFile())
    throw new Error(
      `Refusing to overwrite ${dest}: not a regular file. Move or remove it and rerun install --amp.`,
    );

  const current = readFileSync(dest);
  if (current.equals(artifact)) return { path: dest, alreadyInstalled: true };
  if (isManagedAmpArtifact(current)) {
    atomicWriteFile(dest, artifact);
    return { path: dest, alreadyInstalled: false };
  }
  throw new Error(
    `Refusing to overwrite unmanaged file at ${dest}. Move or remove it and rerun install --amp.`,
  );
}

export function uninstallAmp(homeDir: string): InstallResult {
  const dest = getAmpPluginPath(homeDir);
  const info = lstatOrUndefined(dest);
  if (!info) return { path: dest, alreadyInstalled: false };
  if (info.isSymbolicLink() || !info.isFile())
    throw new Error(`Refusing to remove ${dest}: not a regular file. Move or remove it manually.`);
  if (!isManagedAmpArtifact(readFileSync(dest)))
    throw new Error(`Refusing to remove unmanaged file at ${dest}. Move or remove it manually.`);

  rmSync(dest);
  return { path: dest, alreadyInstalled: true };
}
