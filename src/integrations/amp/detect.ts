/**
 * Amp Code hook detection.
 */

import { lstatSync, readFileSync } from 'node:fs';
import { AMP_MANAGED_HEADER } from '@/integrations/amp/artifact';
import { getAmpPluginPath } from '@/integrations/amp/install';
import type { DetectContext, HookDetection } from '@/integrations/detect/context';
import { getPackageVersion } from '@/integrations/system-info';

function _ampArtifactVersion(content: string): string | undefined {
  return /^\/\/ version:\s*(.+)$/m.exec(content)?.[1]?.trim();
}

export function detect(context: DetectContext): HookDetection {
  const configPath = getAmpPluginPath(context.homeDir);

  const info = (() => {
    try {
      return lstatSync(configPath);
    } catch {
      return undefined;
    }
  })();
  if (!info) return { platform: 'amp', status: 'n/a', configPath };

  if (info.isSymbolicLink() || !info.isFile()) {
    return {
      platform: 'amp',
      status: 'n/a',
      configPath,
      errors: [
        `${configPath} is a symlink or not a regular file; move or remove it before installing`,
      ],
    };
  }

  let content: string;
  try {
    content = readFileSync(configPath, 'utf-8');
  } catch (e) {
    return {
      platform: 'amp',
      status: 'n/a',
      configPath,
      errors: [`Failed to read ${configPath}: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (!content.startsWith(AMP_MANAGED_HEADER)) {
    return {
      platform: 'amp',
      status: 'n/a',
      configPath,
      errors: [`Unmanaged file occupies ${configPath}; move or remove it before installing`],
    };
  }

  const outdated = _ampArtifactVersion(content) !== getPackageVersion();
  return {
    platform: 'amp',
    status: 'configured',
    method: 'plugin file',
    configPath,
    errors: outdated
      ? ['Installed Amp plugin is outdated; run install --amp to update']
      : undefined,
  };
}
