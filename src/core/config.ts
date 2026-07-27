import { resolve } from 'node:path';
import type { ValidationResult } from '@/types';
import { iterateCustomRuleErrors } from './rules/custom-rule-validation';
import { validateRulesConfig } from './rules/policy/config-file';
import {
  bindDelegatedPolicyFilesystemTarget,
  PolicyFilesystemError,
  type PolicyFilesystemTarget,
  readPolicyFile,
} from './rules/policy/filesystem';

/** @internal Exported for testing */
export function validateConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const ruleNames = new Set<string>();

  if (!config || typeof config !== 'object') {
    errors.push('Config must be an object');
    return { errors, ruleNames };
  }

  const cfg = config as Record<string, unknown>;

  if (cfg.version !== 1) {
    errors.push('version must be 1');
  }

  if (cfg.rules !== undefined) {
    if (!Array.isArray(cfg.rules)) {
      errors.push('rules must be an array');
    } else {
      for (let i = 0; i < cfg.rules.length; i++) {
        errors.push(...iterateCustomRuleErrors(cfg.rules[i], i, ruleNames));
      }
    }
  }

  return { errors, ruleNames };
}

export function validateConfigFile(path: string | PolicyFilesystemTarget): ValidationResult {
  const loaded = readConfigFileInput(path);
  if (!loaded.ok) return loaded.result;
  return validateConfig(loaded.parsed);
}

type ConfigFileInput = { ok: true; parsed: unknown } | { ok: false; result: ValidationResult };

function readConfigFileInput(path: string | PolicyFilesystemTarget): ConfigFileInput {
  const errors: string[] = [];
  const ruleNames = new Set<string>();

  try {
    const target = typeof path === 'string' ? bindDelegatedPolicyFilesystemTarget(path) : path;
    const content = readPolicyFile(target);
    if (content === null) {
      errors.push(`File not found: ${target.path}`);
      return { ok: false, result: { errors, ruleNames } };
    }
    if (!content.trim()) {
      errors.push('Config file is empty');
      return { ok: false, result: { errors, ruleNames } };
    }

    return { ok: true, parsed: JSON.parse(content) as unknown };
  } catch (error) {
    errors.push(error instanceof PolicyFilesystemError ? error.message : 'Invalid JSON');
    return { ok: false, result: { errors, ruleNames } };
  }
}

export function getLegacyProjectConfigPath(cwd?: string): string {
  return resolve(cwd ?? process.cwd(), '.safety-net.json');
}

export function validateRulesConfigFile(path: string | PolicyFilesystemTarget): ValidationResult {
  const loaded = readConfigFileInput(path);
  if (!loaded.ok) return loaded.result;
  const result = validateRulesConfig(loaded.parsed);
  return { errors: result.errors, ruleNames: result.sources };
}

export type { ValidationResult };
