import { describe, expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import { toNamespacedPath } from 'node:path';
import { resolveContainedCwd } from '@/core/cwd-containment';

describe('cwd containment', () => {
  test.skipIf(process.platform !== 'win32')(
    '[windows] rejects an untrusted Windows namespace operand but supports a trusted namespaced root',
    () => {
      const namespacedRoot = toNamespacedPath(process.cwd());

      expect(resolveContainedCwd(namespacedRoot, [process.cwd()])).toBeUndefined();
      expect(resolveContainedCwd('.', [namespacedRoot])).toBe(realpathSync(namespacedRoot));
    },
  );
});
