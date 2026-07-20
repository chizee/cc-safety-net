export const COPILOT_PLUGIN_ID = 'safety-net@cc-marketplace';
const COPILOT_MARKETPLACE_ID = 'cc-marketplace';

function hasIdentifier(output: string | null, identifier: string): boolean {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9-])${escaped}([^a-z0-9-]|$)`, 'm').test(output ?? '');
}

export function hasCopilotSafetyNetPlugin(output: string | null): boolean {
  return hasIdentifier(output, COPILOT_PLUGIN_ID);
}

export function hasCopilotMarketplace(output: string | null): boolean {
  return hasIdentifier(output, COPILOT_MARKETPLACE_ID);
}
