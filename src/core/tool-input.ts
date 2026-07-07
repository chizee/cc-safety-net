export function getCommandFromToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const command = (input as Record<string, unknown>).command;
  return typeof command === 'string' && command !== '' ? command : undefined;
}

export function extractPathLikeToolValues(
  input: unknown,
  pathLikeKeys: ReadonlySet<string>,
): string[] {
  if (!input || typeof input !== 'object') return [];
  if (Array.isArray(input)) {
    return input.flatMap((value) => extractPathLikeToolValues(value, pathLikeKeys));
  }

  return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) => {
    if (typeof value === 'string' && pathLikeKeys.has(normalizeToolInputKey(key))) return [value];
    if (value && typeof value === 'object') return extractPathLikeToolValues(value, pathLikeKeys);
    return [];
  });
}

function normalizeToolInputKey(key: string): string {
  return key.replace(/-/g, '_').toLowerCase();
}
