import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getRulesConfigSchema, getRulesConfigValidation } from '@/config/schema';
import { DEFAULT_CONFIG, type RulesConfig, type SyncRulesConfigResult } from './types';

export function validateRulesConfig(config: unknown): { errors: string[]; sources: Set<string> } {
  const parsed = getRulesConfigSchema().safeParse(config);
  const validation = getRulesConfigValidation(config);
  return {
    errors: parsed.success ? [] : validation.errors,
    sources: validation.sources,
  };
}

export function readRulesConfig(path: string): { config: RulesConfig | null; errors: string[] } {
  if (!existsSync(path)) {
    return { config: null, errors: [] };
  }

  try {
    const content = readFileSync(path, 'utf-8');
    if (!content.trim()) {
      return { config: null, errors: ['Config file is empty'] };
    }

    const parsed = JSON.parse(content) as unknown;
    const validation = validateRulesConfig(parsed);
    if (validation.errors.length > 0) {
      return { config: null, errors: validation.errors };
    }
    const cfg = getRulesConfigSchema().parse(parsed);
    return {
      config: {
        version: 1,
        rules: cfg.rules ?? [],
        overrides: cfg.overrides ?? {},
        transparent_wrappers: cfg.transparent_wrappers ?? [],
      },
      errors: [],
    };
  } catch (error) {
    return {
      config: null,
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export function readScopeRulesConfig(
  path: string,
): { ok: true; config: RulesConfig } | { ok: false; result: SyncRulesConfigResult } {
  const loaded = readRulesConfig(path);
  if (loaded.errors.length > 0) {
    return { ok: false, result: { ok: false, errors: loaded.errors, warnings: [], entries: [] } };
  }
  return { ok: true, config: loaded.config ?? DEFAULT_CONFIG };
}

export function writeDefaultRulesConfig(path: string, rules: string[] = []): void {
  writeJsonAtomic(path, { version: 1, rules, overrides: {}, transparent_wrappers: [] });
}

export function writeStarterRulebook(path: string, name = 'project-rules'): void {
  writeJsonAtomic(path, {
    rulebook_version: 1,
    name,
    version: '1.0.0',
    description:
      name === 'project-rules'
        ? 'Project-specific CC Safety Net rules.'
        : 'User-specific CC Safety Net rules.',
    author: name === 'project-rules' ? 'project' : 'user',
    allowed_commands: ['docker'],
    rules: [
      {
        name: 'block-docker-system-prune',
        command: 'docker',
        subcommand: 'system',
        block_args: ['prune'],
        reason: 'Use targeted cleanup instead.',
      },
    ],
    tests: [
      {
        command: 'docker system prune',
        expect: 'blocked',
        rule: 'block-docker-system-prune',
      },
    ],
  });
}

/** @internal */
export function createAtomicTempPath(path: string): string {
  return `${path}.${randomBytes(8).toString('hex')}.tmp`;
}

export function writeJsonAtomic(path: string, value: unknown, mode?: number): void {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = createAtomicTempPath(path);
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf-8',
      flag: 'wx',
      mode,
    });
    renameSync(tempPath, path);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }
}
