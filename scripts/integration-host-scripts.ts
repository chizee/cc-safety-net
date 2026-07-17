/** @internal */
export const PI_HOST_SCRIPT = `
import { pathToFileURL } from 'node:url';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const events = new Map();
const commands = new Map();
const sentMessages = [];
const pi = {
  on(name, handler) {
    events.set(name, handler);
  },
  registerCommand(name, command) {
    commands.set(name, command);
  },
  sendUserMessage(content, options) {
    sentMessages.push({ content, options });
  },
};
const extension = (await import(pathToFileURL(process.argv[1]).href)).default;
await extension(pi);

if (request.kind === 'registration') {
  await commands.get('cc-safety-net').handler(request.commandArgs, {
    isIdle: () => request.idle,
  });
  process.stdout.write(JSON.stringify({
    eventNames: [...events.keys()],
    commandNames: [...commands.keys()],
    commandDescription: commands.get('cc-safety-net').description,
    sentMessages,
  }));
} else {
  const result = await events.get('tool_call')(request.event, {
    cwd: process.cwd(),
    sessionManager: { getSessionId: () => request.sessionId },
  });
  process.stdout.write(JSON.stringify({ result: result ?? null }));
}
`;

/** @internal */
export const OPENCODE_HOST_SCRIPT = `
import { pathToFileURL } from 'node:url';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const pluginModule = await import(pathToFileURL(process.argv[1]).href);
const factories = Object.values(pluginModule).filter((value) => typeof value === 'function');
const pluginInput = {
  client: {},
  project: {},
  directory: process.cwd(),
  worktree: process.cwd(),
  experimental_workspace: { register() {} },
  serverUrl: new URL('http://127.0.0.1:4096'),
  $: () => {},
};
const hooks = await Promise.all(factories.map((factory) => factory(pluginInput)));

if (request.kind === 'config') {
  for (const hook of hooks) await hook.config?.(request.config);
  process.stdout.write(JSON.stringify({
    exportNames: Object.keys(pluginModule),
    pluginCount: hooks.length,
    commandNames: Object.keys(request.config.command ?? {}),
    existingCommand: request.config.command?.existing,
  }));
} else {
  try {
    for (const hook of hooks) {
      await hook['tool.execute.before']?.(
        { tool: request.tool, sessionID: request.sessionId, callID: request.sessionId + '-call' },
        { args: request.args },
      );
    }
    process.stdout.write(JSON.stringify({ allowed: true }));
  } catch (error) {
    process.stdout.write(JSON.stringify({
      allowed: false,
      reason: error instanceof Error ? error.message : String(error),
    }));
  }
}
`;
