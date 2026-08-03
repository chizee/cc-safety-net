import { homedir, tmpdir } from 'node:os';
import { processPathResolver } from '@/core/environment';
import type { EnvironmentContext } from '@/domain/analysis';

/**
 * Process state for analysis tests: an empty env map, so developer-machine variables
 * cannot leak into assertions, over the real home, tmpdir and filesystem, so every
 * existing path expectation still holds.
 */
export const TEST_ENVIRONMENT: EnvironmentContext = {
  env: new Map(),
  home: homedir(),
  tmpdir: tmpdir(),
  paths: processPathResolver,
};
