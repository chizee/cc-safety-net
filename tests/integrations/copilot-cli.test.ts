import { describe, expect, test } from 'bun:test';
import {
  hasCopilotLegacyPlugin,
  hasCopilotMarketplace,
  hasCopilotSafetyNetPlugin,
} from '@/integrations/copilot-cli';

describe('Copilot CLI installation output', () => {
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
  });
});
