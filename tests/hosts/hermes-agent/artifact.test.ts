import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import {
  buildHermesAgentPluginFiles,
  HERMES_AGENT_MANAGED_HEADER,
  HERMES_AGENT_PLUGIN_NAME,
} from '@/hosts/hermes-agent/artifact';
import { writeFakeCommands } from '../../helpers/fake-commands';
import { createTempRoot, removeTempRoots } from '../../helpers/temp-home';

describe('the Hermes Agent plugin artifact', () => {
  test.each(['dev', '9.9.9'])('builds the shipped files at version %s', (version) => {
    const files = buildHermesAgentPluginFiles(version);
    const stamp = `${HERMES_AGENT_MANAGED_HEADER}\n# version: ${version}\n`;

    expect(files.map((file) => file.name)).toEqual(['__init__.py', 'plugin.yaml']);
    for (const file of files) expect(file.content, file.name).toStartWith(stamp);
    expect(files[1]?.content).toBe(
      `${stamp}name: cc-safety-net
version: "${version}"
description: "Block destructive commands and secret-file access before Hermes runs a tool."
author: "cc-safety-net"
provides_hooks:
  - pre_tool_call
`,
    );
  });

  test('keeps the ownership marker and the directory name the installer writes to', () => {
    expect(HERMES_AGENT_MANAGED_HEADER).toBe(
      '# cc-safety-net managed Hermes Agent plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --hermes-agent',
    );
    expect(HERMES_AGENT_PLUGIN_NAME).toBe('cc-safety-net');
  });

  test('spawns the analyzer through the argv the Hermes adapter answers on', () => {
    const shim = buildHermesAgentPluginFiles('dev')[0];

    expect(shim?.name).toBe('__init__.py');
    expect(shim?.content.split('\n')).toContain(
      'ANALYZER = ["npx", "-y", "cc-safety-net", "hook", "--hermes-agent"]',
    );
    expect(shim?.content.split('\n')).toContain('HOOK_EVENT = "pre_tool_call"');
    expect(shim?.content.split('\n')).toContain(
      'SUPPORTED_TOOLS = ("patch", "read_file", "terminal", "write_file")',
    );
    expect(shim?.content).toEndWith('ctx.register_hook("pre_tool_call", _pre_tool_call)\n');
  });
});

const python3Bin = Bun.which('python3');

const PLUGIN_HOST = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("ccsn_hermes_plugin", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
hooks = {}
class Ctx:
    def register_hook(self, name, callback):
        hooks[name] = callback
module.register(Ctx())
json.dump({"directive": hooks["pre_tool_call"](**json.loads(sys.argv[2]))}, sys.stdout)
`;

const TERMINAL_TOOL_STUB = `RECORDS = {"recorded-task": "/records/recorded-task"}


def get_session_cwd(session_key):
    return RECORDS.get(session_key)
`;

const FILE_TOOLS_PATHS_STUB = `from pathlib import PurePosixPath


def _resolve_base_dir(task_id="default", *, container_paths=None):
    return PurePosixPath("/workspaces") / task_id
`;

function runPlugin(
  call: { tool_name: string; args: Record<string, unknown>; task_id: string },
  options: { fileToolsPaths: boolean; terminalCwd?: string },
) {
  const root = createTempRoot('ccsn-hermes-plugin-');
  const pluginPath = join(root, '__init__.py');
  writeFileSync(pluginPath, buildHermesAgentPluginFiles('dev')[0]?.content ?? '');
  const tools = join(root, 'modules', 'tools');
  mkdirSync(tools, { recursive: true });
  writeFileSync(join(tools, '__init__.py'), '');
  writeFileSync(
    join(tools, 'approval.py'),
    'def get_current_session_key(default="default"):\n    return default\n',
  );
  writeFileSync(join(tools, 'terminal_tool.py'), TERMINAL_TOOL_STUB);
  if (options.fileToolsPaths)
    writeFileSync(join(tools, 'file_tools_paths.py'), FILE_TOOLS_PATHS_STUB);
  const payloadPath = join(root, 'payload.json');
  const binDir = writeFakeCommands(root, {
    npx: 'writeFileSync(process.env.CCSN_TEST_PAYLOAD ?? "", await Bun.stdin.text());',
  });
  const result = Bun.spawnSync(
    [
      python3Bin ?? 'python3',
      '-c',
      PLUGIN_HOST,
      pluginPath,
      JSON.stringify({ ...call, session_id: 'session-1' }),
    ],
    {
      cwd: root,
      env: {
        HOME: root,
        PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
        PYTHONPATH: join(root, 'modules'),
        CCSN_TEST_PAYLOAD: payloadPath,
        ...(options.terminalCwd ? { TERMINAL_CWD: options.terminalCwd } : {}),
      },
    },
  );
  return {
    stderr: result.stderr.toString(),
    directive: JSON.parse(result.stdout.toString()).directive,
    payload: existsSync(payloadPath) ? JSON.parse(readFileSync(payloadPath, 'utf8')) : null,
  };
}

describe.skipIf(!python3Bin)('the Hermes Agent plugin under python3', () => {
  afterEach(removeTempRoots);

  test.each([
    {
      name: 'a first terminal command runs in TERMINAL_CWD',
      call: { tool_name: 'terminal', args: { command: 'ls' }, task_id: 'new-task' },
      terminalCwd: '/configured/terminal',
      cwd: '/configured/terminal',
    },
    {
      name: 'a terminal command runs in the session cwd record',
      call: { tool_name: 'terminal', args: { command: 'ls' }, task_id: 'recorded-task' },
      terminalCwd: '/configured/terminal',
      cwd: '/records/recorded-task',
    },
    {
      name: 'read_file resolves against the task base directory',
      call: { tool_name: 'read_file', args: { path: 'notes.txt' }, task_id: 'task-7' },
      cwd: '/workspaces/task-7',
    },
    {
      name: 'write_file without a task id resolves against the default task',
      call: { tool_name: 'write_file', args: { path: 'notes.txt', content: '' }, task_id: '' },
      cwd: '/workspaces/default',
    },
    {
      name: 'patch resolves against the task base directory',
      call: { tool_name: 'patch', args: { path: 'notes.txt' }, task_id: 'task-9' },
      cwd: '/workspaces/task-9',
    },
  ])('sends the directory Hermes uses: $name', (row) => {
    const result = runPlugin(row.call, { fileToolsPaths: true, terminalCwd: row.terminalCwd });

    expect(result.stderr).toBe('');
    expect(result.directive).toBeNull();
    expect(result.payload?.cwd).toBe(row.cwd);
  });

  test('blocks a file tool when the Hermes file tool directory cannot be read', () => {
    const result = runPlugin(
      { tool_name: 'read_file', args: { path: 'notes.txt' }, task_id: 'task-7' },
      { fileToolsPaths: false },
    );

    expect(result.stderr).toBe('');
    expect(result.payload).toBeNull();
    expect(result.directive).toEqual({
      action: 'block',
      message:
        "CC Safety Net failed closed: the Hermes file tool directory could not be read (No module named 'tools.file_tools_paths'). Update cc-safety-net and reinstall the plugin with: npx -y cc-safety-net install --hermes-agent.",
    });
  });
});
