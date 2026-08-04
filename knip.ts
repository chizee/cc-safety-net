import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/index.ts!',
    'src/bin/cc-safety-net.ts!',
    'src/pi/index.ts!',
    'src/amp/index.ts!',
    // Built for the browser by src/bin/gui/assets.ts, so no module imports it.
    'src/bin/gui/frontend/main.ts!',
    // scripts invoked directly by package.json scripts or GitHub workflows
    'scripts/build.ts!',
    'scripts/build-schema.ts!',
    'scripts/prepare-release-files.ts!',
    'scripts/release-assets.ts!',
    'scripts/release-transaction.ts!',
    'scripts/verify-coverage.ts!',
    'scripts/verify-deterministic-build.ts!',
    'scripts/verify-package.ts!',
    'scripts/verify-repository-plugin.ts!',
  ],
  project: ['src/**/*.ts!', 'scripts/**/*.ts!'],
  // Workflow-invoked scripts are declared in `entry` above; the plugin would
  // re-claim them as dev-only entries and hide their imports from --production.
  'github-actions': false,
  ignoreBinaries: ['gh', 'tsc'],
  ignoreDependencies: ['@opencode-ai/plugin'],
};

export default config;
