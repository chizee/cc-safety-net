import type { AnalyzeOptions } from '@/ir/analysis';

/** @internal */
export type AnalyzeCall = { command: string; cwd?: string; shell?: string };

/** @internal */
export function captureAnalyzeCalls(calls: AnalyzeCall[]) {
  return (command: string, options: AnalyzeOptions) => {
    calls.push({ command, cwd: options.cwd, shell: options.shell });
    return null;
  };
}
