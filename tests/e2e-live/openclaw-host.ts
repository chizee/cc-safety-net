/**
 * Drivers for the real `openclaw` binary.
 *
 * State isolation: OpenClaw resolves its state root from `OPENCLAW_STATE_DIR` before falling back
 * to `OPENCLAW_CONFIG_PATH` and only then to `$HOME/.openclaw` (`src/utils.ts` `resolveConfigDir`
 * in the OpenClaw source). All three are pinned at the temporary home so a developer who exports
 * either variable cannot redirect a test at their real installation.
 *
 * Enforcement is driven by a gateway agent turn rather than a tool-invoke RPC: OpenClaw's
 * `POST /tools/invoke` surface never exposes `exec` (it is on `DEFAULT_GATEWAY_HTTP_TOOL_DENY`,
 * and the HTTP tool catalog does not build a shell tool at all), and the loopback MCP surface
 * only mediates `exec` for grants minted for Gateway-launched CLI backends. A turn against a
 * loopback stub model is the only model-free path that reaches a real `before_tool_call`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const HEALTH_POLL_MS = 250;

/** Where OpenClaw keeps config, the state database, and installed plugins. */
function getOpenClawStateDir(home: string): string {
  return join(home, '.openclaw');
}

/** Env keys that pin every OpenClaw process at the temporary home. */
export function openClawEnv(home: string): Record<string, string> {
  const stateDir = getOpenClawStateDir(home);
  return {
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: join(stateDir, 'openclaw.json'),
  };
}

function sseChunk(delta: Record<string, unknown>, finishReason: string | null) {
  return `data: ${JSON.stringify({
    id: 'chatcmpl-stub',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'stub-model',
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

function execToolCallBody(command: string) {
  return `${sseChunk(
    {
      role: 'assistant',
      tool_calls: [
        {
          index: 0,
          id: 'call_1',
          type: 'function',
          function: { name: 'exec', arguments: JSON.stringify({ command }) },
        },
      ],
    },
    null,
  )}${sseChunk({}, 'tool_calls')}data: [DONE]\n\n`;
}

function finalTextBody() {
  return `${sseChunk({ role: 'assistant', content: 'stub turn complete' }, null)}${sseChunk(
    {},
    'stop',
  )}data: [DONE]\n\n`;
}

function boundPort(server: { port: number | undefined }): number {
  if (server.port === undefined) throw new Error('Bun.serve did not bind a loopback port');
  return server.port;
}

/**
 * A loopback OpenAI-compatible endpoint that asks for one `exec` tool call and then stops. It
 * replaces the model, not the agent: OpenClaw's own runtime still builds the tool, dispatches
 * `before_tool_call`, and executes the result.
 */
export function startStubModelServer() {
  let command = '';
  let toolCallIssued = true;
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      await request.text();
      const issueToolCall = !toolCallIssued;
      toolCallIssued = true;
      return new Response(issueToolCall ? execToolCallBody(command) : finalTextBody(), {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    },
  });
  return {
    port: boundPort(server),
    /** Arm the next turn to request `exec` with this command exactly once. */
    armExec(next: string) {
      command = next;
      toolCallIssued = false;
    },
    stop() {
      server.stop(true);
    },
  };
}

/** Claim a free loopback port by binding one and releasing it. */
export function reserveLoopbackPort(): number {
  const probe = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => new Response('') });
  const port = boundPort(probe);
  probe.stop(true);
  return port;
}

/**
 * Write the whole config in one write. OpenClaw validates the file as a unit and rejects a
 * custom model provider that does not declare both `baseUrl` and `models`, so building it up
 * with `openclaw config set` calls fails on the first key.
 */
export function writeOpenClawConfig(
  home: string,
  options: { modelPort: number; gatewayPort: number; token: string; workspace: string },
): void {
  const stateDir = getOpenClawStateDir(home);
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    join(stateDir, 'openclaw.json'),
    JSON.stringify(
      {
        // Bonjour advertises the gateway over mDNS; a test gateway must stay off the network.
        plugins: { entries: { bonjour: { enabled: false } } },
        gateway: { port: options.gatewayPort, auth: { mode: 'token', token: options.token } },
        agents: {
          entries: {
            main: { default: true, workspace: options.workspace, model: 'stub/stub-model' },
          },
        },
        models: {
          providers: {
            stub: {
              baseUrl: `http://127.0.0.1:${options.modelPort}/v1`,
              api: 'openai-completions',
              apiKey: 'stub-key-not-a-secret',
              models: [{ id: 'stub-model', name: 'Stub', contextWindow: 128000, maxTokens: 4096 }],
            },
          },
        },
      },
      null,
      2,
    ),
  );
}

/**
 * Spawn an OpenClaw process under the isolated home, killed at `timeoutMs` so a wedged gateway
 * or agent turn cannot outlive the suite.
 */
export async function runOpenClaw(
  args: readonly string[],
  options: { cwd: string; env: Record<string, string>; timeoutMs: number },
) {
  const proc = Bun.spawn(['openclaw', ...args], {
    cwd: options.cwd,
    env: options.env,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const timer = setTimeout(() => proc.kill('SIGKILL'), options.timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { stdout, stderr, exitCode };
}

/**
 * Run the gateway in the foreground until `stop()`. The gateway owns the agent worker it spawns,
 * so killing it reaps the whole turn; `stop` awaits the exit rather than leaving a zombie.
 */
export async function startOpenClawGateway(options: {
  cwd: string;
  env: Record<string, string>;
  port: number;
  token: string;
  readyTimeoutMs: number;
}) {
  const proc = Bun.spawn(
    [
      'openclaw',
      'gateway',
      'run',
      '--port',
      String(options.port),
      '--auth',
      'token',
      '--token',
      options.token,
      '--allow-unconfigured',
    ],
    {
      cwd: options.cwd,
      env: options.env,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  const log = new Response(proc.stdout).text();
  const errorLog = new Response(proc.stderr).text();
  const stop = async () => {
    proc.kill('SIGTERM');
    await proc.exited;
  };

  const deadline = Date.now() + options.readyTimeoutMs;
  while (Date.now() < deadline) {
    const live = await fetch(`http://127.0.0.1:${options.port}/health`)
      .then((response) => response.ok)
      .catch(() => false);
    if (live) return { stop, log, errorLog };
    await Bun.sleep(HEALTH_POLL_MS);
  }
  await stop();
  throw new Error(
    `OpenClaw gateway never became healthy on port ${options.port}:\n${await log}\n${await errorLog}`,
  );
}
