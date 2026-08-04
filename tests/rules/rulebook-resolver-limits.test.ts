import { describe, expect, test } from 'bun:test';
import { fetchGitHubResource, GITHUB_FETCH_LIMITS } from '@/rules/policy/resolver';
import { withLoopbackServer } from '../helpers/loopback-server';

describe('bounded GitHub rulebook responses', () => {
  test('rejects declared and streamed overflow through real loopback transport', async () => {
    await withLoopbackServer(
      (request, response) => {
        if (request.url === '/declared') {
          response.writeHead(200, {
            'content-length': String(GITHUB_FETCH_LIMITS.rawBytes + 1),
          });
          response.end(Buffer.alloc(1));
          return;
        }
        response.write(Buffer.alloc(GITHUB_FETCH_LIMITS.metadataBytes));
        response.end(Buffer.alloc(1));
      },
      async (origin) => {
        await expect(fetchGitHubResource(`${origin}/declared`, 'raw')).rejects.toThrow(
          'GitHub raw response exceeds',
        );
        await expect(fetchGitHubResource(`${origin}/streamed`, 'metadata')).rejects.toThrow(
          'GitHub metadata response exceeds',
        );
      },
    );
  });

  test('charges non-OK requests without consuming their response bodies', async () => {
    await withLoopbackServer(
      (request, response) => {
        response.writeHead(500);
        response.end(request.url === '/body' ? 'unread' : undefined);
      },
      async (origin) => {
        const withBody = await fetchGitHubResource(`${origin}/body`, 'metadata');
        expect(withBody.response.status).toBe(500);
        expect(withBody.content).toBe('');

        const withoutBody = await fetchGitHubResource(`${origin}/no-body`, 'metadata');
        expect(withoutBody.response.status).toBe(500);
        expect(withoutBody.content).toBe('');
      },
    );
  });

  test('accepts exact byte limits and preserves multibyte text across writes', async () => {
    await withLoopbackServer(
      (request, response) => {
        if (request.url === '/exact') {
          response.end(Buffer.alloc(GITHUB_FETCH_LIMITS.commitBytes));
          return;
        }
        response.write(Buffer.from([0xf0, 0x9f]));
        response.end(Buffer.from([0x98, 0x80]));
      },
      async (origin) => {
        expect((await fetchGitHubResource(`${origin}/exact`, 'commit')).content).toHaveLength(
          GITHUB_FETCH_LIMITS.commitBytes,
        );
        expect((await fetchGitHubResource(`${origin}/multibyte`, 'raw')).content).toBe('😀');
      },
    );
  });

  test('times out stalled response headers and stalled response bodies', async () => {
    await withLoopbackServer(
      (request, response) => {
        if (request.url === '/body') response.flushHeaders();
      },
      async (origin) => {
        await expect(
          fetchGitHubResource(`${origin}/headers`, 'metadata', { timeoutMs: 10 }),
        ).rejects.toThrow('GitHub request timed out');
        await expect(
          fetchGitHubResource(`${origin}/body`, 'raw', { timeoutMs: 10 }),
        ).rejects.toThrow('GitHub request timed out');
      },
    );
  });
});
