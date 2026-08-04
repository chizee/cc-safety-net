import { describe, expect, test } from 'bun:test';
import { renderPolicyGuiHtml } from '@/gui/page';

describe('renderPolicyGuiHtml', () => {
  test('keeps a script-closing token inside the data tag', () => {
    const token = '</script><script>alert(1)</script>';
    const payload = /<script id="ccsn-data" type="application\/json">(.*?)<\/script>/.exec(
      renderPolicyGuiHtml(token),
    )?.[1];

    // A payload that closed the tag would be truncated here, so parsing it back
    // to the original token proves the whole token stayed inside the tag.
    expect(payload).toBeDefined();
    expect(JSON.parse(payload as string)).toEqual({ token });
  });
});
