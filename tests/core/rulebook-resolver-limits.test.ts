import { describe, expect, test } from 'bun:test';
import {
  fetchGitHubResource,
  GITHUB_FETCH_LIMITS,
  readGitHubResponseText,
} from '@/core/rules/policy/resolver';

function streamedResponse(chunks: Uint8Array[], headers?: Record<string, string>): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    { headers },
  );
}

function cancelTrackedResponse(
  chunks: Uint8Array[],
  options: { headers?: Record<string, string>; status?: number } = {},
) {
  let cancelled = false;
  return {
    response: new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      }),
      options,
    ),
    wasCancelled: () => cancelled,
  };
}

describe('bounded GitHub rulebook responses', () => {
  test('rejects Content-Length before reading and headerless streaming overflow', async () => {
    const headerOversize = cancelTrackedResponse([new Uint8Array(1)], {
      headers: { 'Content-Length': String(GITHUB_FETCH_LIMITS.rawBytes + 1) },
    });
    await expect(readGitHubResponseText(headerOversize.response, 'raw')).rejects.toThrow(
      'GitHub raw response exceeds',
    );
    expect(headerOversize.wasCancelled()).toBeTrue();

    const streamedOversize = cancelTrackedResponse([
      new Uint8Array(GITHUB_FETCH_LIMITS.metadataBytes),
      new Uint8Array(1),
    ]);
    await expect(readGitHubResponseText(streamedOversize.response, 'metadata')).rejects.toThrow(
      'GitHub metadata response exceeds',
    );
    expect(streamedOversize.wasCancelled()).toBeTrue();
  });

  test('cancels non-OK response bodies and safely handles an absent body', async () => {
    const nonOk = cancelTrackedResponse([new Uint8Array(1)], { status: 500 });
    const fetchNonOk = (() => Promise.resolve(nonOk.response)) as unknown as typeof fetch;

    expect(
      await fetchGitHubResource('https://example.test/non-ok', 'metadata', { fetch: fetchNonOk }),
    ).toEqual({ response: nonOk.response, content: '' });
    expect(nonOk.wasCancelled()).toBeTrue();

    const noBody = new Response(null, { status: 500 });
    await expect(
      fetchGitHubResource('https://example.test/no-body', 'metadata', {
        fetch: (() => Promise.resolve(noBody)) as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ response: noBody, content: '' });
  });

  test('accepts exact byte limits and preserves multibyte text across chunks', async () => {
    expect(
      await readGitHubResponseText(
        streamedResponse([new Uint8Array(GITHUB_FETCH_LIMITS.commitBytes)]),
        'commit',
      ),
    ).toHaveLength(GITHUB_FETCH_LIMITS.commitBytes);
    expect(
      await readGitHubResponseText(
        streamedResponse([new Uint8Array([0xf0, 0x9f]), new Uint8Array([0x98, 0x80])]),
        'raw',
      ),
    ).toBe('😀');
  });

  test('times out and aborts stalled fetches', async () => {
    let observedAbort = false;
    const stalledFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          observedAbort = true;
          reject(new DOMException('aborted', 'AbortError'));
        });
      })) as unknown as typeof fetch;

    await expect(
      fetchGitHubResource('https://example.test/stalled', 'metadata', {
        fetch: stalledFetch,
        timeoutMs: 1,
      }),
    ).rejects.toThrow('GitHub request timed out');
    expect(observedAbort).toBeTrue();
  });

  test('keeps the timeout active while streaming the response body', async () => {
    const stalledBodyFetch = ((_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('aborted', 'AbortError')),
              );
            },
          }),
        ),
      )) as unknown as typeof fetch;

    await expect(
      fetchGitHubResource('https://example.test/stalled-body', 'raw', {
        fetch: stalledBodyFetch,
        timeoutMs: 1,
      }),
    ).rejects.toThrow('GitHub request timed out');
  });
});
