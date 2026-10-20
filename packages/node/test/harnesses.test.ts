import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

/** A user folder with Claude Code, Codex and Cursor set up, each with something of its own in the config. */
function userFolder(): string {
  const home = tempDir('weave-harness-home-');
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ numStartups: 7, mcpServers: { other: { type: 'stdio', command: 'other' } }, projects: { x: {} } }, null, 2));
  mkdirSync(join(home, '.codex'));
  writeFileSync(join(home, '.codex', 'config.toml'), 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "other"\n');
  mkdirSync(join(home, '.cursor'));
  return home;
}

function node(home: string): WeaveNode {
  const n = WeaveNode.init('martl', tempDir('weave-harness-node-'));
  n.harnessHome = home;
  n.mcpLaunch = () => ({ command: 'C:\\Program Files\\Weave\\Weave.exe', args: ['C:\\Program Files\\Weave\\resources\\daemon\\weave.mjs'], env: { ELECTRON_RUN_AS_NODE: '1' } });
  return n;
}

describe('telling agent harnesses about Weave', () => {
  it('finds the harnesses installed, and adds Weave to each only when asked', async () => {
    const home = userFolder();
    const martl = node(home);
    const before = await martl.harnesses();
    expect(before.offered).toBe(false);
    expect(before.harnesses.map((h) => `${h.id}:${h.state}`)).toEqual(['claude-code:none', 'codex:none', 'cursor:none']);

    // Claude Code: an agent "claude" is made, and only the weave entry is added.
    const after = await martl.connectHarness({ harness: 'claude-code', on: true });
    expect(after.offered).toBe(true);
    expect(after.harnesses.find((h) => h.id === 'claude-code')?.state).toBe('ours');
    const claude = JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8'));
    expect(claude.numStartups).toBe(7);
    expect(claude.mcpServers.other).toEqual({ type: 'stdio', command: 'other' });
    expect(claude.mcpServers.weave).toEqual({ type: 'stdio', command: 'C:\\Program Files\\Weave\\Weave.exe', args: ['C:\\Program Files\\Weave\\resources\\daemon\\weave.mjs', 'mcp', '--as', 'claude'], env: { ELECTRON_RUN_AS_NODE: '1' } });
    expect(existsSync(join(home, '.claude.json.weave-backup'))).toBe(true);
    expect((await martl.whoami()).agents.map((a) => [a.name, a.permissions.join(',')])).toEqual([['claude', 'weave.post,weave.reply,weave.msg,weave.react']]);

    // Codex (TOML): its own agent, the other server untouched; adding twice doesn't duplicate.
    await martl.connectHarness({ harness: 'codex', on: true });
    await martl.connectHarness({ harness: 'codex', on: true });
    const toml = readFileSync(join(home, '.codex', 'config.toml'), 'utf8');
    expect(toml).toContain('model = "gpt-5"');
    expect(toml).toContain('[mcp_servers.other]\ncommand = "other"');
    expect(toml.match(/\[mcp_servers\.weave\]/g)).toHaveLength(1);
    expect(toml).toContain('args = ["C:\\\\Program Files\\\\Weave\\\\resources\\\\daemon\\\\weave.mjs", "mcp", "--as", "codex"]');
    expect(toml).toContain('env = { ELECTRON_RUN_AS_NODE = "1" }');
    expect((await martl.harnesses()).harnesses.find((h) => h.id === 'codex')?.state).toBe('ours');

    // Cursor had no config yet: it gets one.
    await martl.connectHarness({ harness: 'cursor', on: true });
    expect(JSON.parse(readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8')).mcpServers.weave.args.at(-1)).toBe('cursor');

    // Taking Weave out removes only its entry.
    await martl.connectHarness({ harness: 'codex', on: false });
    expect(readFileSync(join(home, '.codex', 'config.toml'), 'utf8')).not.toContain('mcp_servers.weave');
    expect(readFileSync(join(home, '.codex', 'config.toml'), 'utf8')).toContain('[mcp_servers.other]');
  });

  it('notices an old weave entry, and replaces it when asked', async () => {
    const home = userFolder();
    const claudeFile = join(home, '.claude.json');
    writeFileSync(claudeFile, JSON.stringify({ mcpServers: { weave: { type: 'stdio', command: 'node', args: ['main.ts', 'mcp', '--as', 'forge'] } } }));
    const martl = node(home);
    expect((await martl.harnesses()).harnesses.find((h) => h.id === 'claude-code')?.state).toBe('other');
    await martl.connectHarness({ harness: 'claude-code', on: true });
    expect(JSON.parse(readFileSync(claudeFile, 'utf8')).mcpServers.weave.args.at(-1)).toBe('claude');
    await expect(martl.connectHarness({ harness: 'claude-desktop', on: true })).rejects.toThrow(/isn't installed/);
  });

  it('asks once: "not now" is remembered', async () => {
    const martl = node(userFolder());
    await martl.dismissHarnesses();
    expect((await martl.harnesses()).offered).toBe(true);
  });
});
