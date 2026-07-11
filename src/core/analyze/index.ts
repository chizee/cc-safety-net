import { analyzeCommandWithProgram } from '@/core/analyze/with-program';
import type { AnalyzeOptions, AnalyzeResult } from '../../types.js';

export function analyzeCommand(command: string, options: AnalyzeOptions): AnalyzeResult | null {
  return analyzeCommandWithProgram(command, options);
}
