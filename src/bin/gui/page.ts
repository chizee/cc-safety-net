import { guiDocument } from './assets';

export function renderPolicyGuiHtml(token: string): string {
  // The placeholder is quoted so the data tag holds valid JSON before it is
  // filled in, so the quotes go with it. Escaping `<` keeps the payload from
  // closing the tag whatever the token holds; JSON.parse reads it back as `<`.
  return guiDocument.replace('"__CC_SAFETY_NET_DATA__"', () =>
    JSON.stringify({ token }).replaceAll('<', '\\u003c'),
  );
}
