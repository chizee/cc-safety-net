import { describe, expect, test } from 'bun:test';
import { isPublicDeclarationOutput } from '../../scripts/build-output';

describe('isPublicDeclarationOutput', () => {
  test('keeps both public declarations with Windows paths', () => {
    expect(isPublicDeclarationOutput('dist\\entries\\index.d.ts')).toBeTrue();
    expect(isPublicDeclarationOutput('dist\\entries\\api.d.ts')).toBeTrue();
    expect(isPublicDeclarationOutput('dist\\api.d.ts')).toBeFalse();
    expect(isPublicDeclarationOutput('dist\\entries\\pi\\index.d.ts')).toBeFalse();
  });
});
