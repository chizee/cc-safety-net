import { expect } from 'bun:test';
import type { CommandProgram } from '@/ir/command';
import { walkCommandViews } from '@/parser/traversal';

export function expectProgramSpans(program: CommandProgram, source: string) {
  expect(program.span.start).toBeGreaterThanOrEqual(0);
  expect(program.span.end).toBeLessThanOrEqual(source.length);
  for (const view of walkCommandViews(program)) {
    expect(source.slice(view.span.start, view.span.end)).toBe(view.source);
    for (const word of view.words) {
      expect(source.slice(word.span.start, word.span.end)).toBe(word.raw);
    }
  }
  for (const node of program.nodes) {
    if (node.kind === 'group' || node.kind === 'function') {
      expectProgramSpans(node.body, source);
    }
  }
}
