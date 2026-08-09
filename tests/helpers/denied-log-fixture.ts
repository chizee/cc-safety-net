import { writeJsonlFixture } from '../helpers';

/** @internal */
export function writeDeniedLogFixture(filePath: string, command: string): void {
  writeJsonlFixture(filePath, [
    {
      ts: new Date().toISOString(),
      decision: 'deny',
      command,
      segment: command,
      reason: 'blocked',
    },
  ]);
}
