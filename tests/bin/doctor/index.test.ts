import { describe, expect, spyOn, test } from 'bun:test';
import * as os from 'node:os';
import { runDoctor } from '@/bin/doctor';
import * as selfTest from '@/integrations/self-test';
import { withEnv, withTempDir } from '../../helpers.ts';

describe('doctor report verification ownership', () => {
  test('runs one shared engine self-test and keeps its failure separate from integrations', async () => {
    await withTempDir('doctor-report-', async (cwd) => {
      const runSelfTest = spyOn(selfTest, 'runIntegrationSelfTest').mockReturnValue({
        passed: 2,
        failed: 1,
        total: 3,
        results: [],
      });
      const homeDir = spyOn(os, 'homedir').mockReturnValue(cwd);
      const output: string[] = [];
      const log = spyOn(console, 'log').mockImplementation((value) => {
        output.push(String(value));
      });

      try {
        const exitCode = await withEnv(
          {
            HOME: cwd,
            PATH: '',
            COPILOT_HOME: `${cwd}/copilot`,
            KIMI_CODE_HOME: `${cwd}/kimi`,
          },
          () => runDoctor({ cwd, json: true, skipUpdateCheck: true }),
        );

        expect(exitCode).toBe(1);
        expect(runSelfTest).toHaveBeenCalledTimes(1);
        const report = JSON.parse(output.join('\n')) as Record<string, unknown>;
        expect(report.engineSelfTest).toMatchObject({ passed: 2, failed: 1, total: 3 });
        expect(report.hooks).toBeArray();
        for (const hook of report.hooks as Record<string, unknown>[]) {
          expect(hook).not.toHaveProperty('selfTest');
          expect(hook).toHaveProperty('detected');
          expect(hook).toHaveProperty('configured');
        }
        expect(
          (report.hooks as Record<string, unknown>[]).map((hook) => ({
            platform: hook.platform,
            inspectionStatus: hook.inspectionStatus,
          })),
        ).toEqual([
          { platform: 'claude-code', inspectionStatus: 'not-applicable' },
          { platform: 'antigravity-cli', inspectionStatus: 'not-applicable' },
          { platform: 'codex', inspectionStatus: 'not-applicable' },
          { platform: 'copilot-cli', inspectionStatus: 'not-applicable' },
          { platform: 'gemini-cli', inspectionStatus: 'not-applicable' },
          { platform: 'kimi-code', inspectionStatus: 'not-applicable' },
          { platform: 'opencode', inspectionStatus: 'not-applicable' },
          { platform: 'pi', inspectionStatus: 'not-applicable' },
        ]);
      } finally {
        log.mockRestore();
        homeDir.mockRestore();
        runSelfTest.mockRestore();
      }
    });
  });
});
