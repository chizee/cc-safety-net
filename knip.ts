import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/entries/bin.ts!',
    'src/entries/cli.ts!',
    'src/entries/index.ts!',
    'src/entries/opencode-v2.ts!',
    'src/entries/api.ts!',
    'src/entries/pi/index.ts!',
    'src/entries/amp.ts!',
    'src/entries/openclaw.ts!',
    'src/gui/frontend/main.ts!',
    'scripts/build.ts!',
    'scripts/project-bun.ts!',
    'scripts/prepare-release-files.ts!',
    'scripts/release-assets.ts!',
    'scripts/release-transaction.ts!',
    'scripts/verify-coverage.ts!',
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
