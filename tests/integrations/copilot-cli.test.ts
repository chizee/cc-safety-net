import { describe, expect, test } from 'bun:test';
import { hasCopilotMarketplace, hasCopilotSafetyNetPlugin } from '@/integrations/copilot-cli';

describe('Copilot CLI installation output', () => {
  test('matches complete plugin and marketplace identifiers without substring false positives', () => {
    expect(hasCopilotSafetyNetPlugin('Installed safety-net@cc-marketplace (v1.0.0)')).toBeTrue();
    expect(hasCopilotSafetyNetPlugin('not-safety-net@cc-marketplace-extra')).toBeFalse();
    expect(hasCopilotSafetyNetPlugin(null)).toBeFalse();

    expect(hasCopilotMarketplace('cc-marketplace\nother-marketplace')).toBeTrue();
    expect(hasCopilotMarketplace('not-cc-marketplace-extra')).toBeFalse();
    expect(hasCopilotMarketplace(null)).toBeFalse();
  });
});
