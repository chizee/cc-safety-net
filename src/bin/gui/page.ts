import customCss from './custom.css' with { type: 'text' };
import logoSvg from './logo.svg' with { type: 'text' };
import pageHtml from './page.html' with { type: 'text' };
import pageScript from './page-script.js' with { type: 'text' };

export function renderPolicyGuiHtml(token: string): string {
  return (pageHtml as unknown as string)
    .replace('/* __CC_SAFETY_NET_CUSTOM_CSS__ */', customCss)
    .replace('<!-- __CC_SAFETY_NET_LOGO__ -->', () => logoSvg as unknown as string)
    .replace('/* __CC_SAFETY_NET_SCRIPT__ */', () => pageScript as unknown as string)
    .replace('__CC_SAFETY_NET_TOKEN__', JSON.stringify(token));
}
