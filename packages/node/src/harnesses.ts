import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

/*
 * Agent harnesses on this computer (Claude Code, Claude Desktop, Codex,
 * Cursor) and telling them about Weave: an MCP server entry named "weave"
 * that runs this installation's own CLI as one of the person's agents.
 * Weave only writes there when the person says so, keeps a backup of the
 * file it changes, and touches nothing but its own entry.
 */

export interface McpLaunch {
  command: string;
  /** The CLI (and --home when not the default); "mcp --as <agent>" is added. */
  args: string[];
  env: Record<string, string>;
}

export interface Harness {
  id: 'claude-code' | 'claude-desktop' | 'codex' | 'cursor';
  name: string;
  /** The agent it acts as. */
  agent: string;
  /** Its MCP config file. */
  file: string;
  /** It's installed here (its folder exists). */
  found: boolean;
  format: 'json' | 'toml';
  /** For JSON: entries need "type": "stdio". */
  typed?: boolean;
  /** What to do so it notices. */
  restart: string;
}

export function harnessesIn(home: string, platform: string = process.platform, appData = process.env.APPDATA): Harness[] {
  const desktopDir =
    platform === 'win32' ? join(appData ?? join(home, 'AppData', 'Roaming'), 'Claude') : platform === 'darwin' ? join(home, 'Library', 'Application Support', 'Claude') : join(home, '.config', 'Claude');
  return [
    { id: 'claude-code', name: 'Claude Code', agent: 'claude', file: join(home, '.claude.json'), found: existsSync(join(home, '.claude.json')), format: 'json', typed: true, restart: 'New Claude Code sessions see it.' },
    { id: 'claude-desktop', name: 'Claude Desktop', agent: 'claude', file: join(desktopDir, 'claude_desktop_config.json'), found: existsSync(desktopDir), format: 'json', restart: 'Restart Claude Desktop.' },
    { id: 'codex', name: 'Codex', agent: 'codex', file: join(home, '.codex', 'config.toml'), found: existsSync(join(home, '.codex')), format: 'toml', restart: 'New Codex sessions see it.' },
    { id: 'cursor', name: 'Cursor', agent: 'cursor', file: join(home, '.cursor', 'mcp.json'), found: existsSync(join(home, '.cursor')), format: 'json', restart: 'Restart Cursor.' },
  ];
}

/** The entry Weave writes for one agent. */
export const weaveEntry = (launch: McpLaunch, agent: string) => ({ command: launch.command, args: [...launch.args, 'mcp', '--as', agent], env: launch.env });

/** Weave's entry in a harness's config as it is now: missing, ours (this installation, this agent), or something else. */
export function entryState(h: Harness, launch: McpLaunch): 'none' | 'ours' | 'other' {
  if (!existsSync(h.file)) return 'none';
  const text = readFileSync(h.file, 'utf8');
  const want = weaveEntry(launch, h.agent);
  if (h.format === 'toml') {
    const section = tomlSection(text, 'mcp_servers.weave');
    if (!section) return 'none';
    return section.includes(tomlString(want.command)) && section.includes(`${tomlString('--as')}, ${tomlString(h.agent)}`) && want.args.every((a) => section.includes(tomlString(a))) ? 'ours' : 'other';
  }
  let entry: { command?: string; args?: string[] } | undefined;
  try {
    entry = (JSON.parse(text) as { mcpServers?: Record<string, { command?: string; args?: string[] }> }).mcpServers?.weave;
  } catch {
    return 'other'; // a file we can't read: don't claim it's ours
  }
  if (!entry) return 'none';
  return entry.command === want.command && JSON.stringify(entry.args) === JSON.stringify(want.args) ? 'ours' : 'other';
}

/** Weave's entry in a harness's config as written (its program and arguments), whoever wrote it. */
function readEntry(h: Harness): { command?: string; args?: string[] } | undefined {
  if (!existsSync(h.file)) return undefined;
  const text = readFileSync(h.file, 'utf8');
  try {
    if (h.format === 'toml') {
      const section = tomlSection(text, 'mcp_servers.weave');
      const value = (key: string) => section?.split('\n').find((l) => l.trim().startsWith(`${key} =`))?.split('=').slice(1).join('=').trim();
      const command = value('command');
      const args = value('args');
      return section ? { ...(command ? { command: JSON.parse(command) as string } : {}), ...(args ? { args: JSON.parse(args) as string[] } : {}) } : undefined;
    }
    return (JSON.parse(text) as { mcpServers?: Record<string, { command?: string; args?: string[] }> }).mcpServers?.weave;
  } catch {
    return undefined;
  }
}

/**
 * A Weave entry that can only fail: it starts `weave mcp`, but its program or script is gone (the app was
 * uninstalled, the checkout moved). Commands found on the PATH ("node") count as there.
 */
export function staleEntry(h: Harness): boolean {
  const entry = readEntry(h);
  const args = entry?.args ?? [];
  if (!entry?.command || !args.includes('mcp') || !args.includes('--as')) return false;
  const gone = (p: string | undefined) => !!p && isAbsolute(p) && !existsSync(p);
  return gone(entry.command) || gone(args[0] === 'mcp' ? undefined : args[0]);
}

/** The home an entry starts Weave with (--home), if it names one. */
export function entryHome(h: Harness): string | undefined {
  const args = readEntry(h)?.args ?? [];
  const at = args.indexOf('--home');
  return at >= 0 ? args[at + 1] : undefined;
}

/** Add (or replace) Weave's entry, or remove it; the file is backed up first. */
export function writeEntry(h: Harness, launch: McpLaunch | null): void {
  const exists = existsSync(h.file);
  if (!exists && !launch) return;
  const before = exists ? readFileSync(h.file, 'utf8') : '';
  if (exists) copyFileSync(h.file, `${h.file}.weave-backup`);
  else mkdirSync(dirname(h.file), { recursive: true });
  let after: string;
  if (h.format === 'toml') {
    let text = removeTomlSection(removeTomlSection(before, 'mcp_servers.weave.env'), 'mcp_servers.weave');
    if (launch) {
      const e = weaveEntry(launch, h.agent);
      const env = Object.entries(e.env);
      text = `${text.trimEnd()}${text.trim() ? '\n\n' : ''}[mcp_servers.weave]\ncommand = ${tomlString(e.command)}\nargs = [${e.args.map(tomlString).join(', ')}]\n${env.length ? `env = { ${env.map(([k, v]) => `${k} = ${tomlString(v)}`).join(', ')} }\n` : ''}`;
    }
    after = text;
  } else {
    let data: Record<string, unknown>;
    try {
      data = before.trim() ? (JSON.parse(before) as Record<string, unknown>) : {};
    } catch {
      throw new Error(`${h.file} isn't valid JSON, so Weave leaves it alone: add the entry by hand`);
    }
    const servers = { ...((data.mcpServers as Record<string, unknown>) ?? {}) };
    if (launch) servers.weave = { ...(h.typed ? { type: 'stdio' } : {}), ...weaveEntry(launch, h.agent) };
    else delete servers.weave;
    data.mcpServers = servers;
    const indent = /^\{\n( +)"/.exec(before)?.[1].length ?? 2;
    after = JSON.stringify(data, null, indent) + (before.endsWith('\n') || !exists ? '\n' : '');
  }
  writeFileSync(h.file, after);
}

/** A TOML basic string (JSON's escaping is valid TOML). */
const tomlString = (s: string) => JSON.stringify(s);

/** The lines of one [table], up to the next header. */
function tomlSection(text: string, table: string): string | undefined {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === `[${table}]`);
  if (start < 0) return undefined;
  const end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

function removeTomlSection(text: string, table: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === `[${table}]`);
  if (start < 0) return text;
  const end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l));
  lines.splice(start, (end < 0 ? lines.length : end) - start);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
