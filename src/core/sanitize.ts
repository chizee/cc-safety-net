// Provider/API token formats. Length floors favour recall; distinctive prefixes limit false positives.
const PROVIDER_TOKENS = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[abeprs]-[A-Za-z0-9-]{20,}\b/g,
  /\bnpm_[A-Za-z0-9_]{20,}\b/g,
  /\bpypi-[A-Za-z0-9_-]{20,}\b/g,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk_[A-Za-z0-9]{20,}\b/g,
  /\bgsk_[A-Za-z0-9]{52,}\b/g,
  /\bxai-[A-Za-z0-9_-]{80,}\b/g,
  /\bpplx-[A-Za-z0-9_-]{20,}\b/g,
  /\bbastn_[A-Za-z0-9]{16,}\b/g,
  /\btgp_v1_[A-Za-z0-9_-]{43,}\b/g,
  /\bflp_[A-Za-z0-9]{10,}\b/g,
  /\bwfr_[A-Za-z0-9]{20,}\b/g,
  /\bfwp?_[A-Za-z0-9_-]{20,}\b/g,
  /\btp-[A-Za-z0-9_-]{20,}\b/g,
  /\bpsk-[A-Za-z0-9_-]{8,}-[A-Za-z0-9_-]{8,}\b/g,
  /\b[a-f0-9]{32}\.[A-Za-z0-9]{16}\b/g,
];

/** Sanitize secrets from text before it is retained in diagnostics or logs. */
export function redactSecrets(text: string): string {
  const result = text
    .replace(
      /\b((?:DATABASE|POSTGRES|POSTGRESQL|MYSQL|MARIADB|REDIS|MONGO(?:DB)?|DB)_DSN|CONNECTION_STRING)=("[^"]*"|'[^']*'|[^\s]+(?:\s+[A-Z_][A-Z0-9_]*=[^\s]+)*)/gi,
      '$1=<redacted>',
    )
    .replace(
      /\b((?:DATABASE|POSTGRES|POSTGRESQL|MYSQL|MARIADB|REDIS|MONGO(?:DB)?|DB)_(?:URL|URI|CONNECTION_STRING))=("[^"]*"|'[^']*'|[^\s]+)/gi,
      '$1=<redacted>',
    )
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIALS)[A-Z0-9_]*)=("[^"]*"|'[^']*'|[^\s]+)/gi,
      '$1=<redacted>',
    );
  return redactNonAssignmentSecrets(result);
}

/** @internal Sanitizes non-assignment secrets in an already structured diagnostic payload. */
export function redactNonAssignmentSecrets(text: string): string {
  let result = text
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi,
      '<redacted>',
    )
    .replace(
      /((?:(['"])(?:authorization|cookie|x-api-key|api-key)\2|(?:authorization|cookie|x-api-key|api-key))\s*:\s*)(['"])(?:\\[^\r\n]|(?!\3)[^\\\r\n])*\3/gi,
      '$1$3<redacted>$3',
    )
    .replace(
      /(['"]?\s*(?:authorization|cookie|x-api-key|api-key)\s*:(?!\s*(?:"<redacted>"|'<redacted>'))\s*)([^'"\r\n]+)(['"]?)/gi,
      '$1<redacted>$3',
    )
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s@/]+)@/gi, '$1<redacted>:<redacted>@')
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+)@/gi, '$1<redacted>@')
    .replace(
      /(^|[\s?&;|])((?:x-amz-signature|x-goog-signature|sig|signature)=)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^&#\s'"`;|<>()]*)/gi,
      '$1$2<redacted>',
    )
    .replace(/(^|\s)((?:-u|--user)(?:\s+|=))([^\s:]+):([^\s]+)/g, '$1$2<redacted>:<redacted>');

  for (const pattern of PROVIDER_TOKENS) result = result.replace(pattern, '<redacted>');

  return result
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, '<redacted>')
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '<redacted>');
}

/** @internal Redacts assignment values without running provider-token patterns. */
export function redactEnvAssignmentValues(text: string): string {
  const assignments = findEnvAssignments(text);
  return assignments.reduceRight(
    (value, assignment) =>
      `${value.slice(0, assignment.valueStart)}<redacted>${value.slice(assignment.valueEnd)}`,
    text,
  );
}

/** @internal Canonical sanitizer for user-visible diagnostic text. */
export function sanitizeDiagnosticText(text: string): string {
  return redactNonAssignmentSecrets(redactEnvAssignmentValues(text));
}

/** @internal Returns assignment values so trace recorders can redact derived parser events. */
export function getEnvAssignmentValues(text: string): readonly string[] {
  return findEnvAssignments(text).map((assignment) =>
    text.slice(assignment.valueStart, assignment.valueEnd),
  );
}

/** @internal Fast gate for whether assignment scanning is worth running. */
export function mightContainEnvAssignment(text: string): boolean {
  return /[A-Za-z_][A-Za-z0-9_]*=/.test(text);
}

type EnvAssignment = { valueStart: number; valueEnd: number };

function findEnvAssignments(text: string): EnvAssignment[] {
  const assignments: EnvAssignment[] = [];
  const pattern = /[A-Za-z_][A-Za-z0-9_]*=/g;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    const previous = text[start - 1];
    if (start > 0 && previous && !/[\s"'([{]/.test(previous)) continue;
    const valueStart = start + match[0].length;
    if (valueStart >= text.length) continue;
    assignments.push({ valueStart, valueEnd: findAssignmentValueEnd(text, valueStart) });
  }
  return assignments;
}

function findAssignmentValueEnd(text: string, start: number): number {
  if (text.startsWith('$(', start)) return findBalancedCommandSubstitutionEnd(text, start);
  const quote = text[start];
  if (quote === '"' || quote === "'") {
    for (let index = start + 1; index < text.length; index++) {
      if (quote === '"' && text[index] === '\\') index++;
      else if (text[index] === quote) return index + 1;
    }
  }
  let end = start;
  while (end < text.length && !/\s/.test(text[end] ?? '')) end++;
  return end;
}

function findBalancedCommandSubstitutionEnd(text: string, start: number): number {
  let depth = 0;
  let quote: '"' | "'" | undefined;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (quote === '"' && char === '\\') index++;
      else if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '$' && text[index + 1] === '(') {
      depth++;
      index++;
      continue;
    }
    if (char !== ')') continue;
    depth--;
    if (depth === 0) return index + 1;
  }
  return text.length;
}
