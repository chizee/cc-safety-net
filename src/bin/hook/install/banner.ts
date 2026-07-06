import {
  type LolcatAnimationOptions,
  type LolcatOutput,
  writeAnimatedLolcat,
} from '@/bin/utils/lolcat';

type InstallBannerOptions = Pick<
  LolcatAnimationOptions,
  'duration' | 'frequency' | 'seed' | 'sleep' | 'speed' | 'spread'
> & {
  output?: LolcatOutput;
};

const INSTALL_ASCII_ART = [
  '┏━┛┏━┛  ┏━┛┏━┃┏━┛┏━┛━┏┛┃ ┃  ┏━ ┏━┛━┏┛',
  '┃  ┃    ━━┃┏━┃┏━┛┏━┛ ┃ ━┏┛  ┃ ┃┏━┛ ┃ ',
  '━━┛━━┛  ━━┛┛ ┛┛  ━━┛ ┛  ┛   ┛ ┛━━┛ ┛ ',
].join('\n');

function shouldPrintInstallBanner(output: LolcatOutput) {
  return Boolean(output.isTTY);
}

export async function printInstallBanner(options: InstallBannerOptions = {}) {
  const output = options.output ?? process.stdout;
  if (!shouldPrintInstallBanner(output)) return;

  await writeAnimatedLolcat(INSTALL_ASCII_ART, {
    duration: options.duration,
    frequency: options.frequency,
    output,
    seed: options.seed ?? Math.random() * 8192,
    sleep: options.sleep,
    speed: options.speed,
    spread: options.spread,
  });
}
