import type { Context, Plugin } from '@opencode/plugin/effect/plugin';
import type { ToolHooks } from '@opencode/plugin/effect/tool';
import { Tool } from '@opencode/schema/tool';
import { Effect } from 'effect';
import { getNonCommandToolInputKind } from '@/core/tool-input';
import { loadBuiltinCommands } from './builtin-commands/commands';
import { evaluateOpenCodeTool, resolveOpenCodeShellRoute } from './plugin';

type V2Context = Pick<Context, 'options' | 'shell'> & {
  location: Pick<Context['location'], 'directory'>;
  tool: {
    hook: (
      name: 'execute.before',
      callback: (event: ToolHooks['execute.before']) => Effect.Effect<void, Tool.Error>,
    ) => ReturnType<Context['tool']['hook']>;
  };
  command: Pick<Context['command'], 'transform' | 'list'>;
  session: Pick<Context['session'], 'prompt'>;
};

export function createOpenCodeV2Plugin() {
  return {
    id: 'cc-safety-net',
    effect: (ctx: V2Context) =>
      Effect.gen(function* () {
        const shell = ctx.options.shell ?? (process.platform === 'win32' ? 'powershell' : 'posix');
        if (shell !== 'posix' && shell !== 'powershell') {
          return yield* Effect.die(
            new Error('CC Safety Net: plugin option shell must be posix or powershell.'),
          );
        }
        yield* ctx.tool.hook('execute.before', (event) =>
          Effect.try({
            try: () =>
              evaluateOpenCodeTool({
                configCwd: ctx.location.directory,
                tool: event.tool,
                sessionID: event.sessionID,
                toolInput: event.input,
                route:
                  event.tool === 'shell'
                    ? { kind: 'command', shell }
                    : { kind: getNonCommandToolInputKind(event.tool) },
              }),
            catch: (error) =>
              new Tool.Error({ message: error instanceof Error ? error.message : String(error) }),
          }),
        );
        // The tool event does not expose the resolved executable.
        yield* ctx.shell.hook('create.before', (event) => {
          if (resolveOpenCodeShellRoute(event.shell) === shell) return Effect.void;
          return Effect.die(
            new Error(
              `CC Safety Net: actual shell "${event.shell}" does not match plugin option shell "${shell}". Configure the plugin's shell option to match OpenCode; supported dialects are posix and powershell.`,
            ),
          );
        });
        const commands = yield* ctx.command.list().pipe(Effect.orDie);
        if (commands.data.some((command) => command.name === 'cc-safety-net')) return;
        yield* ctx.command.transform((editor) => {
          const command = loadBuiltinCommands()['cc-safety-net'];
          if (!command) return;
          editor.add({
            name: 'cc-safety-net',
            description: command.description,
            execute: (input) =>
              ctx.session
                .prompt({
                  // oxlint-disable-next-line typescript/no-misused-spread -- forwarded as data; OpenCode reads the prompt's fields, never its prototype.
                  ...input.prompt,
                  sessionID: input.sessionID,
                  delivery: input.delivery,
                  text: `${command.template}\n\n${input.prompt.text}`,
                })
                .pipe(Effect.asVoid),
          });
        });
      }),
  } satisfies Plugin;
}
