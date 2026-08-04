/**
 * Entry point for the explain command module.
 * Re-exports analysis function and formatting utilities.
 */

// Flag parsing
export { parseExplainFlags } from '@/bin/explain/flags';
// Formatting utilities
export { formatTraceHuman, formatTraceJson } from '@/bin/explain/format';
// Core analysis logic
export { explainCommand } from '@/engine/facade';
