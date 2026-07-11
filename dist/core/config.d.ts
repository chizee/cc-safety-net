import type { ValidationResult } from '@/types';
/** @internal Exported for testing */
export declare function validateConfig(config: unknown): ValidationResult;
export declare function validateConfigFile(path: string): ValidationResult;
export declare function getLegacyProjectConfigPath(cwd?: string): string;
export declare function validateRulesConfigFile(path: string): ValidationResult;
export type { ValidationResult };
