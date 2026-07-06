/*
 * Rainbow rendering and animation behavior ported from lolcat:
 * https://github.com/busyloop/lolcat
 *
 * Copyright (c) 2016, moe@busyloop.net
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of the lolcat nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

export type LolcatOutput = {
  readonly isTTY?: boolean;
  write(chunk: string): unknown;
};

export type LolcatSleep = (milliseconds: number) => Promise<void>;

/** @internal Exported for deterministic renderer tests. */
export type LolcatRenderOptions = {
  frequency?: number;
  seed?: number;
  spread?: number;
};

export type LolcatAnimationOptions = LolcatRenderOptions & {
  duration?: number;
  output?: LolcatOutput;
  sleep?: LolcatSleep;
  speed?: number;
};

const ANSI_RESET = '\x1b[0m';
const ANSI_RESET_FOREGROUND = '\x1b[39m';
const DEFAULT_DURATION = 12;
const DEFAULT_FREQUENCY = 0.1;
const DEFAULT_SPEED = 20;
const DEFAULT_SPREAD = 3;
const HIDE_CURSOR = '\x1b[?25l';
const RESTORE_CURSOR = '\x1b8';
const SAVE_CURSOR = '\x1b7';
const SHOW_CURSOR = '\x1b[?25h';

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function positiveOrDefault(value: number | undefined, fallback: number) {
  return value && value > 0 ? value : fallback;
}

function byte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rainbow(frequency: number, offset: number) {
  return {
    blue: byte(Math.sin(frequency * offset + (4 * Math.PI) / 3) * 127 + 128),
    green: byte(Math.sin(frequency * offset + (2 * Math.PI) / 3) * 127 + 128),
    red: byte(Math.sin(frequency * offset) * 127 + 128),
  };
}

function colorizeCharacter(character: string, frequency: number, offset: number) {
  const color = rainbow(frequency, offset);
  return `\x1b[38;2;${color.red};${color.green};${color.blue}m${character}${ANSI_RESET_FOREGROUND}`;
}

/** @internal Exported for deterministic renderer tests. */
export function renderLolcat(text: string, options: LolcatRenderOptions = {}) {
  if (!text) return '';

  const frequency = positiveOrDefault(options.frequency, DEFAULT_FREQUENCY);
  const seed = options.seed ?? 0;
  const spread = positiveOrDefault(options.spread, DEFAULT_SPREAD);

  return `${text
    .split('\n')
    .map((line, lineIndex) =>
      Array.from(line)
        .map((character, characterIndex) =>
          colorizeCharacter(character, frequency, seed + lineIndex + characterIndex / spread),
        )
        .join(''),
    )
    .join('\n')}${ANSI_RESET}`;
}

/** @internal Exported for deterministic animation tests. */
export function createLolcatAnimationFrames(text: string, options: LolcatAnimationOptions = {}) {
  const duration = Math.max(1, Math.floor(positiveOrDefault(options.duration, DEFAULT_DURATION)));
  const spread = positiveOrDefault(options.spread, DEFAULT_SPREAD);

  return Array.from({ length: duration }, (_value, index) =>
    renderLolcat(text, {
      frequency: options.frequency,
      seed: (options.seed ?? 0) + (index + 1) * spread,
      spread,
    }),
  );
}

export async function writeAnimatedLolcat(text: string, options: LolcatAnimationOptions = {}) {
  if (!text) return;

  const output = options.output ?? process.stdout;
  const sleep = options.sleep ?? wait;
  const speed = positiveOrDefault(options.speed, DEFAULT_SPEED);

  output.write(HIDE_CURSOR);
  output.write(SAVE_CURSOR);

  try {
    for (const frame of createLolcatAnimationFrames(text, options)) {
      output.write(RESTORE_CURSOR);
      output.write(`${frame}\n`);
      await sleep(1000 / speed);
    }
  } finally {
    output.write(`${ANSI_RESET}${SHOW_CURSOR}`);
  }
}
