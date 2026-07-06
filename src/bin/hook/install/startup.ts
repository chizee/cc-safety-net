type StartupAction = 'install' | 'uninstall';

type DeferredResolution<T> = {
  finish: () => Promise<T>;
};

export async function resolveAfterOptionalInstallBanner<T>(
  action: StartupAction,
  startResolution: () => DeferredResolution<T>,
  printBanner: () => Promise<void>,
) {
  const resolution = startResolution();
  if (action === 'install') await printBanner();
  return resolution.finish();
}
