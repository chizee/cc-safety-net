type DeferredStartupWork<T> = {
  finish: () => Promise<T>;
};

export async function resolveAfterOptionalBanner<T>(
  showBanner: boolean,
  startWork: () => DeferredStartupWork<T>,
  printBanner: () => Promise<void>,
) {
  const work = startWork();
  if (showBanner) await printBanner();
  return work.finish();
}
