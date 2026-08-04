import { integrationDisplayNames } from '@/integrations/catalog';
import { customCss, faviconSvg, logoSvg, pageHtml, pageScriptJs } from './assets';

export function renderPolicyGuiHtml(token: string): string {
  return pageHtml
    .replace('/* __CC_SAFETY_NET_CUSTOM_CSS__ */', customCss)
    .replace('__CC_SAFETY_NET_FAVICON__', `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`)
    .replace('<!-- __CC_SAFETY_NET_LOGO__ -->', () => logoSvg)
    .replace('/* __CC_SAFETY_NET_SCRIPT__ */', () => pageScriptJs)
    .replace('__CC_SAFETY_NET_AGENT_LABELS__', () => JSON.stringify(integrationDisplayNames))
    .replace('__CC_SAFETY_NET_TOKEN__', JSON.stringify(token));
}
