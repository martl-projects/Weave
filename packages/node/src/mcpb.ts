import { crc32 } from 'node:zlib';

/**
 * Weave for the Claude desktop app's chat: an MCP bundle (.mcpb, a zip with a
 * manifest.json) that Claude installs and manages itself. Opening the file
 * shows Claude's install dialog. Editing claude_desktop_config.json by hand
 * doesn't last: the app rewrites that file from memory while it runs.
 *
 * The bundle carries no Weave code. Its server is a small launcher that starts
 * this computer's Weave MCP server (`weave mcp --as <agent>`), as found when
 * the bundle was made, with Claude's stdin and stdout passed straight through.
 */
export interface ClaudeBundleOptions {
  /** The agent the chat acts as. */
  agent: string;
  /** How to start Weave here: the program, the arguments before `mcp`, and its environment. */
  launch: { command: string; args: string[]; env?: Record<string, string> };
  version: string;
  /** A PNG for Claude's extension list. */
  icon?: Uint8Array;
}

// Pipes, not inherited handles: Claude runs bundle servers in its own Node process,
// whose stdio a child can't simply take over (Weave would never hear Claude).
const LAUNCHER = (target: { command: string; args: string[]; env: Record<string, string> }) => `// Starts this computer's Weave MCP server and passes Claude's stdio through to it.
const { spawn } = require('node:child_process');
const target = ${JSON.stringify(target, null, 2)};
const child = spawn(target.command, target.args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, ...target.env },
  windowsHide: true,
});
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
process.stdin.on('end', () => child.stdin.end());
child.on('error', (error) => {
  process.stderr.write('weave: could not start Weave (' + target.command + '): ' + error.message + '\\n');
  process.exit(1);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
`;

/** The .mcpb file's bytes. */
export function claudeBundle(options: ClaudeBundleOptions): Buffer {
  const manifest = {
    manifest_version: '0.3',
    name: 'weave',
    display_name: 'Weave',
    version: options.version,
    description: `Weave, as your agent "${options.agent}": your projects, boards, posts, issues and chats, on your own computer. Needs the Weave app (or weave daemon) running.`,
    author: { name: 'Weave' },
    ...(options.icon ? { icon: 'icon.png' } : {}),
    server: {
      type: 'node',
      entry_point: 'server/launch.js',
      mcp_config: { command: 'node', args: ['${__dirname}/server/launch.js'], env: {} },
    },
    compatibility: { platforms: ['darwin', 'win32', 'linux'] },
  };
  const target = { command: options.launch.command, args: [...options.launch.args, 'mcp', '--as', options.agent], env: options.launch.env ?? {} };
  return zip([
    ['manifest.json', Buffer.from(JSON.stringify(manifest, null, 2))],
    ['server/launch.js', Buffer.from(LAUNCHER(target))],
    ...(options.icon ? ([['icon.png', Buffer.from(options.icon)]] as Array<[string, Buffer]>) : []),
  ]);
}

/** A zip of stored (uncompressed) files: all a bundle this small needs. */
export function zip(files: Array<[string, Buffer]>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  // 1980-01-01 00:00 in DOS time: no timestamps, so the same input gives the same bytes.
  const date = (1 << 5) | 1;
  for (const [name, data] of files) {
    const path = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(path.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, path, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(0, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(date, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(path.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, path);
    offset += local.length + path.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}
