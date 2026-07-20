import { describe, expect, spyOn, test } from 'bun:test';
import * as os from 'node:os';
import { runDoctor } from '@/bin/doctor';
import * as hookDetection from '@/bin/doctor/hooks';
import * as selfTest from '@/integrations/self-test';
import { withEnv, withTempDir } from '../../helpers.ts';

function captureConsoleLog() {
  const output: string[] = [];
  const log = spyOn(console, 'log').mockImplementation((value) => {
    output.push(String(value ?? ''));
  });
  return { output, log };
}

async function withoutTtyStdout<T>(fn: () => Promise<T>): Promise<T> {
  const originalIsTTY = process.stdout.isTTY;
  Object.defineProperty(process.stdout, 'isTTY', {
    value: false,
    writable: true,
    configurable: true,
  });
  try {
    return await fn();
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      writable: true,
      configurable: true,
    });
  }
}

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
      const captured = captureConsoleLog();

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
        const report = JSON.parse(captured.output.join('\n')) as Record<string, unknown>;
        expect(report.engineSelfTest).toMatchObject({ passed: 2, failed: 1, total: 3 });
        expect(report.posture).toHaveProperty('directories');
        expect(report.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ checkId: 'integration.none-configured', severity: 'error' }),
          ]),
        );
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
        captured.log.mockRestore();
        homeDir.mockRestore();
        runSelfTest.mockRestore();
      }
    });
  });

  test('uses the same empty findings for JSON and human output without changing exit behavior', async () => {
    await withTempDir('doctor-report-', async (cwd) => {
      const detectHooks = spyOn(hookDetection, 'detectAllHooks').mockReturnValue([
        {
          platform: 'claude-code',
          detected: true,
          configured: true,
          inspectionStatus: 'verified',
        },
      ]);
      const runSelfTest = spyOn(selfTest, 'runIntegrationSelfTest');
      runSelfTest.mockReturnValue({
        passed: 3,
        failed: 0,
        total: 3,
        results: [],
      });
      const homeDir = spyOn(os, 'homedir').mockReturnValue(cwd);
      const captured = captureConsoleLog();

      try {
        const jsonExit = await withEnv(
          {
            HOME: cwd,
            CC_SAFETY_NET_HOME: `${cwd}/safety-net`,
            PATH: '',
            COPILOT_HOME: `${cwd}/copilot`,
            KIMI_CODE_HOME: `${cwd}/kimi`,
          },
          () => runDoctor({ cwd, json: true, skipUpdateCheck: true }),
        );
        const report = JSON.parse(captured.output.join('\n')) as { findings: unknown[] };

        captured.output.length = 0;
        const humanExit = await withoutTtyStdout(() =>
          withEnv(
            {
              HOME: cwd,
              CC_SAFETY_NET_HOME: `${cwd}/safety-net`,
              PATH: '',
              COPILOT_HOME: `${cwd}/copilot`,
              KIMI_CODE_HOME: `${cwd}/kimi`,
            },
            () => runDoctor({ cwd, skipUpdateCheck: true }),
          ),
        );
        const human = captured.output.join('\n');

        expect(jsonExit).toBe(0);
        expect(humanExit).toBe(0);
        expect(report.findings).toEqual([]);
        expect(human).toContain('No findings from inspected doctor facts.');
      } finally {
        captured.log.mockRestore();
        homeDir.mockRestore();
        runSelfTest.mockRestore();
        detectHooks.mockRestore();
      }
    });
  });
});
