import type { LolcatOutput } from '@/bin/utils/lolcat';

export function createLolcatOutput(isTTY = true) {
  const chunks: string[] = [];
  const output = {
    isTTY,
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
  } satisfies LolcatOutput;

  return { chunks, output };
}

export function stripAnsi(value: string) {
  const esc = String.fromCharCode(27);
  return value.replace(new RegExp(`${esc}\\[[0-?]*[ -/]*[@-~]|${esc}[78]`, 'g'), '');
}
