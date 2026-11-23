import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ArchivedSessions } from '../src/claudecode.ts';

/*
 * Which machine a Claude Code session runs on, from the Claude app's files (issue 4Vxe): its session file names the
 * environment it started in, a preset whose target says local or remote. Read only, and robust to what's missing.
 */

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function appData(presets: unknown, sessions: Array<Record<string, unknown>>): string {
  const root = mkdtempSync(join(tmpdir(), 'weave-machines-'));
  dirs.push(root);
  const folder = join(root, 'claude-code-sessions', 'account', 'org');
  mkdirSync(folder, { recursive: true });
  if (presets !== undefined) writeFileSync(join(root, 'ccd-session-presets.json'), typeof presets === 'string' ? presets : JSON.stringify(presets));
  sessions.forEach((s, i) => writeFileSync(join(folder, `local_${i}.json`), JSON.stringify(s)));
  return join(root, 'claude-code-sessions');
}

const presets = {
  byAccount: {
    a: {
      presets: [
        { id: 'p-local', name: 'Weave', target: { kind: 'local', cwd: 'C:\\dev\\weave' } },
        { id: 'p-ssh', name: 'build-vm-1', target: { kind: 'ssh', host: 'julian@10.0.0.12', cwd: '/home/julian/app' } },
        { id: 'p-odd', target: { kind: 'container' } },
      ],
    },
  },
};

describe('the machine a session runs on', () => {
  it('reads it from the session’s environment and its preset', () => {
    const dir = appData(presets, [
      { cliSessionId: 'a', envScopeId: 'p-ssh' },
      { cliSessionId: 'b', startedFromEnvironmentId: 'p-local' },
      { cliSessionId: 'c', envScopeId: 'builtin_local' },
      { cliSessionId: 'd' },
      { cliSessionId: 'e', envScopeId: 'p-odd' },
      { cliSessionId: 'f', envScopeId: 'p-gone' },
    ]);
    const app = new ArchivedSessions(() => [dir]);
    expect(app.machineOf('a')).toEqual({ id: 'preset:p-ssh', name: 'build-vm-1', kind: 'ssh', host: 'julian@10.0.0.12' });
    for (const id of ['b', 'c', 'd', 'f', 'unknown']) expect(app.machineOf(id)).toMatchObject({ id: 'local', kind: 'local' });
    expect(app.machineOf('e')).toEqual({ id: 'preset:p-odd', name: 'container', kind: 'container' });
  });

  it('is this computer when the app’s files are missing or not what it knows', () => {
    const broken = new ArchivedSessions(() => [appData('{not json', [{ cliSessionId: 'a', envScopeId: 'p-ssh' }])]);
    expect(broken.machineOf('a').id).toBe('local');
    const none = new ArchivedSessions(() => [appData(undefined, [{ cliSessionId: 'a', envScopeId: 'p-ssh' }])]);
    expect(none.machineOf('a').id).toBe('local');
  });
});
