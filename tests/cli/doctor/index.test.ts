import { describe, expect, spyOn, test } from 'bun:test';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import { join } from 'node:path';
import { runDoctor } from '@/cli/doctor';
import * as hookDetection from '@/integrations/detect';
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

/** Healthy host mocks shared by the exit-code tests: one configured hook, a
 *  passing self-test, and an isolated home. */
function mockHealthyDoctorHost(cwd: string) {
  const detectHooks = spyOn(hookDetection, 'detectAllHooks').mockReturnValue([
    {
      platform: 'claude-code',
      detected: true,
      configured: true,
      inspectionStatus: 'verified',
    },
  ]);
  const runSelfTest = spyOn(selfTest, 'runIntegrationSelfTest');
  runSelfTest.mockReturnValue({ passed: 3, failed: 0, total: 3, results: [] });
  const homeDir = spyOn(os, 'homedir').mockReturnValue(cwd);
  const captured = captureConsoleLog();
  return {
    captured,
    env: {
      HOME: cwd,
      CC_SAFETY_NET_HOME: `${cwd}/safety-net`,
      PATH: '',
      COPILOT_HOME: `${cwd}/copilot`,
      KIMI_CODE_HOME: `${cwd}/kimi`,
    },
    restore: () => {
      captured.log.mockRestore();
      homeDir.mockRestore();
      runSelfTest.mockRestore();
      detectHooks.mockRestore();
    },
  };
}

/** Runs doctor once as JSON and once as human output under the mocked host,
 *  returning both exit codes with the parsed report and rendered text. */
async function runDoctorBothModes(cwd: string, host: ReturnType<typeof mockHealthyDoctorHost>) {
  const jsonExit = await withEnv(host.env, () =>
    runDoctor({ cwd, json: true, skipUpdateCheck: true }),
  );
  const report = JSON.parse(host.captured.output.join('\n')) as { findings: unknown[] };

  host.captured.output.length = 0;
  const humanExit = await withoutTtyStdout(() =>
    withEnv(host.env, () => runDoctor({ cwd, skipUpdateCheck: true })),
  );
  return { jsonExit, humanExit, report, human: host.captured.output.join('\n') };
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
          { platform: 'amp', inspectionStatus: 'not-applicable' },
          { platform: 'antigravity-cli', inspectionStatus: 'not-applicable' },
          { platform: 'codex', inspectionStatus: 'not-applicable' },
          { platform: 'cursor', inspectionStatus: 'not-applicable' },
          { platform: 'gemini-cli', inspectionStatus: 'not-applicable' },
          { platform: 'copilot-cli', inspectionStatus: 'not-applicable' },
          { platform: 'hermes-agent', inspectionStatus: 'not-applicable' },
          { platform: 'kimi-code', inspectionStatus: 'not-applicable' },
          { platform: 'openclaw', inspectionStatus: 'not-applicable' },
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
      const host = mockHealthyDoctorHost(cwd);

      try {
        const run = await runDoctorBothModes(cwd, host);

        expect(run.jsonExit).toBe(0);
        expect(run.humanExit).toBe(0);
        expect(run.report.findings).toEqual([]);
        expect(run.human).toContain('No findings from inspected doctor facts.');
      } finally {
        host.restore();
      }
    });
  });

  test('an unsafe protected directory fails the run for JSON and human output', async () => {
    await withTempDir('doctor-report-', async (cwd) => {
      const host = mockHealthyDoctorHost(cwd);

      try {
        mkdirSync(join(cwd, 'safety-net'));
        chmodSync(join(cwd, 'safety-net'), 0o777);
        const run = await runDoctorBothModes(cwd, host);

        expect(run.report.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: 'posture.policy-directory-unsafe',
              severity: 'error',
            }),
          ]),
        );
        expect(run.jsonExit).toBe(1);
        expect(run.humanExit).toBe(1);
      } finally {
        host.restore();
      }
    });
  });

  test('reports the runtime configuration state the guard would enforce', async () => {
    await withTempDir('doctor-config-state-', async (cwd) => {
      mkdirSync(join(cwd, '.cc-safety-net', 'rules'), { recursive: true });
      writeFileSync(join(cwd, '.cc-safety-net', 'rules', 'rule.json'), '{ "version": 1,');
      const homeDir = spyOn(os, 'homedir').mockReturnValue(cwd);
      const captured = captureConsoleLog();

      try {
        await withEnv({ HOME: cwd, PATH: '' }, () =>
          runDoctor({ cwd, json: true, skipUpdateCheck: true }),
        );
        const report = JSON.parse(captured.output.join('\n')) as {
          configState: { state: string; reason: string };
          findings: unknown[];
        };

        expect(report.configState.state).toBe('degraded');
        // The reason carries the failing file, the rejected condition, and what is
        // no longer active through to the finding detail.
        expect(report.configState.reason).toContain('Those rule sources are not active');
        expect(report.findings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              checkId: 'config.runtime-degraded',
              severity: 'warning',
              detail: expect.stringContaining('Those rule sources are not active') as string,
            }),
          ]),
        );
      } finally {
        captured.log.mockRestore();
        homeDir.mockRestore();
      }
    });
  });
});
