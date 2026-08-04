import { type LolcatOutput, type LolcatSleep, rainbowColorEscape } from '@/cli/utils/lolcat';

type DeferredStartupWork<T> = {
  ready?: Promise<unknown>;
  finish: () => Promise<T>;
};

type StartupBannerOptions = {
  loadingMessage?: string;
  output?: LolcatOutput;
  sleep?: LolcatSleep;
};

const CLEAR_LINE = '\r\x1b[2K';
const HIDE_CURSOR = '\x1b[?25l';
const RESET_FOREGROUND = '\x1b[39m';
const SHOW_CURSOR = '\x1b[?25h';
const SPINNER_DELAY = 100;
const SPINNER_HUE_STEP = 0.55;
const SPINNER_INTERVAL = 80;
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForReady(ready: Promise<unknown>, options: StartupBannerOptions) {
  const output = options.output ?? process.stdout;
  if (!output.isTTY) {
    await ready;
    return;
  }

  const sleep = options.sleep ?? wait;
  let settled = false;
  const trackedReady = ready.then(
    (value) => {
      settled = true;
      return value;
    },
    (error: unknown) => {
      settled = true;
      throw error;
    },
  );
  const readyBeforeSpinner = await Promise.race([
    trackedReady.then(() => true),
    sleep(SPINNER_DELAY).then(() => false),
  ]);
  if (readyBeforeSpinner) return;

  output.write(HIDE_CURSOR);
  try {
    for (let frameIndex = 0; !settled; frameIndex += 1) {
      output.write(
        `${CLEAR_LINE}${rainbowColorEscape(frameIndex * SPINNER_HUE_STEP)}${SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]}${RESET_FOREGROUND} ${options.loadingMessage ?? 'Loading…'}`,
      );
      await Promise.race([trackedReady, sleep(SPINNER_INTERVAL)]);
    }
    await trackedReady;
  } finally {
    output.write(`${CLEAR_LINE}${SHOW_CURSOR}`);
  }
}

export async function resolveAfterOptionalBanner<T>(
  showBanner: boolean,
  startWork: () => DeferredStartupWork<T>,
  printBanner: () => Promise<void>,
  options: StartupBannerOptions = {},
) {
  const work = startWork();
  if (showBanner) await printBanner();
  if (showBanner && work.ready) await waitForReady(work.ready, options);
  return work.finish();
}
