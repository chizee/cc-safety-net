import { describe, expect, test } from 'bun:test';
import { AMP_MANAGED_HEADER, buildAmpArtifactHeader } from '@/integrations/amp';
import pkg from '../../package.json';

describe('Amp package manifest', () => {
  test('pins @ampcode/plugin as a development-only type dependency', () => {
    expect((pkg.devDependencies as Record<string, string>)['@ampcode/plugin']).toBe(
      '0.0.0-20260724002649-ga3413e7',
    );
    // The type dependency must never ship in the installed artifact.
    expect((pkg.dependencies as Record<string, string>)['@ampcode/plugin']).toBeUndefined();
    expect((pkg.peerDependencies as Record<string, string>)['@ampcode/plugin']).toBeUndefined();
  });

  test('stamps the managed header with the package version', () => {
    expect(buildAmpArtifactHeader(pkg.version)).toBe(
      `${AMP_MANAGED_HEADER}\n// version: ${pkg.version}\n`,
    );
  });
});
