/** Sanitize secrets from text before it is retained in diagnostics or logs. */
export declare function redactSecrets(text: string): string;
/** @internal Sanitizes non-assignment secrets in an already structured diagnostic payload. */
export declare function redactNonAssignmentSecrets(text: string): string;
/** @internal Redacts assignment values without running provider-token patterns. */
export declare function redactEnvAssignmentValues(text: string): string;
/** @internal Canonical sanitizer for user-visible diagnostic text. */
export declare function sanitizeDiagnosticText(text: string): string;
/** @internal Returns assignment values so trace recorders can redact derived parser events. */
export declare function getEnvAssignmentValues(text: string): readonly string[];
