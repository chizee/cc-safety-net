import { describe, expect, test } from 'bun:test';
import { resolveCwdAfterCommandView } from '@/analyzer/segment';
import { parseCommand } from '@/parser/command';
import { projectCommandViews } from '@/parser/traversal';
import { TEST_ENVIRONMENT } from '../helpers/environment';

function powerShellCommand(source: string) {
  const view = projectCommandViews(parseCommand(source, 'powershell'))[0];
  if (!view) throw new Error(`Expected a PowerShell command view for: ${source}`);
  return view;
}

describe('command working-directory tracking', () => {
  test('tracks PowerShell location commands only while the resulting directory stays known', () => {
    for (const command of ['Set-Location /tmp', '& Set-Location /tmp']) {
      expect(
        resolveCwdAfterCommandView(powerShellCommand(command), '/tmp', TEST_ENVIRONMENT),
        command,
      ).toBe('/tmp');
    }

    for (const command of [
      'Set-Location /other',
      'Set-Location Registry::HKLM',
      'Pop-Location',
      'Set-Location -Unknown value',
      'Set-Location -- /tmp',
      'Microsoft.PowerShell.Management\\Set-Location /tmp',
      'Set-Location FileSystem::/tmp',
      'Set-Location -LiteralPath:/tmp -Verbose -ErrorAction Stop',
      'Set-Location -StackName work',
    ]) {
      expect(
        resolveCwdAfterCommandView(powerShellCommand(command), '/tmp', TEST_ENVIRONMENT),
        command,
      ).toBeNull();
    }
  });

  test('uses literal pipeline input only when no explicit PowerShell path is present', () => {
    expect(
      resolveCwdAfterCommandView(
        powerShellCommand('Set-Location'),
        '/tmp',
        TEST_ENVIRONMENT,
        '/tmp',
      ),
    ).toBe('/tmp');
    expect(
      resolveCwdAfterCommandView(
        powerShellCommand('Set-Location /other'),
        '/tmp',
        TEST_ENVIRONMENT,
        '/tmp',
      ),
    ).toBeNull();
  });
});
