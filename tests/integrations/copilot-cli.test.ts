import { describe, expect, test } from 'bun:test';
import {
  hasCopilotLegacyPlugin,
  hasCopilotMarketplace,
  hasCopilotPreRenamePlugin,
  hasCopilotSafetyNetPlugin,
} from '@/integrations/copilot-cli/plugin-id';

describe('GitHub Copilot CLI installation output', () => {
  test('matches complete plugin and marketplace identifiers without substring false positives', () => {
    expect(hasCopilotSafetyNetPlugin('Installed cc-safety-net@cc-marketplace (v1.0.0)')).toBeTrue();
    expect(hasCopilotSafetyNetPlugin('not-cc-safety-net@cc-marketplace-extra')).toBeFalse();
    expect(hasCopilotSafetyNetPlugin(null)).toBeFalse();

    expect(hasCopilotMarketplace('cc-marketplace\nother-marketplace')).toBeTrue();
    expect(hasCopilotMarketplace('not-cc-marketplace-extra')).toBeFalse();
    expect(hasCopilotMarketplace(null)).toBeFalse();

    expect(hasCopilotLegacyPlugin('Installed plugins:\n  copilot-safety-net (v1.0.0)')).toBeTrue();
    expect(hasCopilotLegacyPlugin('my-copilot-safety-net-fork')).toBeFalse();
    expect(hasCopilotLegacyPlugin(null)).toBeFalse();

    expect(
      hasCopilotPreRenamePlugin('Installed plugins:\n  • safety-net@cc-marketplace (v1.0.6)'),
    ).toBeTrue();
    expect(
      hasCopilotPreRenamePlugin('Installed plugins:\n  • cc-safety-net@cc-marketplace (v2.0.0)'),
    ).toBeFalse();
    expect(hasCopilotPreRenamePlugin(null)).toBeFalse();
  });
});
