import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-launch-'));
  dirs.push(dir);
  return dir;
};

async function until<T>(get: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await get();
    if (ok(value)) return value;
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const manifest = (command: string[]) => ({ app: 'band-ab', name: 'BAND AB!', services: [{ id: 'show', port: 3999 }], start: { hint: 'node server.js', command } });

describe('starting a project app', () => {
  it('runs the start command in your copy of the app, only once you approved it, and stops it', async () => {
    const node = WeaveNode.init('Martin', temp());
    await node.createProject({ name: 'Gameshow' });
    const folder = temp();
    writeFileSync(join(folder, 'weave.app.json'), JSON.stringify(manifest(['node', 'server.js'])));
    writeFileSync(join(folder, 'server.js'), "console.log('stage is up'); setInterval(() => {}, 1000);");

    await node.publishApp({ project: 'Gameshow', manifest: manifest(['node', 'server.js']), folder });
    expect(await node.appLaunch('Gameshow')).toMatchObject({ command: ['node', 'server.js'], folder, approved: false, running: false });
    await expect(node.launchApp({ project: 'Gameshow' })).rejects.toThrow(/approve the command first/);

    await node.launchApp({ project: 'Gameshow', approve: true });
    const running = await until(() => node.appLaunch('Gameshow'), (i) => i.log.includes('stage is up'));
    expect(running).toMatchObject({ approved: true, running: true });
    await expect(node.launchApp({ project: 'Gameshow' })).rejects.toThrow(/running already/);

    const stopped = await until(() => node.stopApp('Gameshow'), (i) => !i.running);
    expect(stopped.exit).toMatchObject({ stopped: true });
    // Approved once: starts again without asking.
    await node.launchApp({ project: 'Gameshow' });
    await node.stopApp('Gameshow');

    // A different command needs a new approval.
    await node.publishApp({ project: 'Gameshow', manifest: manifest(['node', 'other.js']) });
    expect((await node.appLaunch('Gameshow')).approved).toBe(false);
    await expect(node.launchApp({ project: 'Gameshow' })).rejects.toThrow(/approve/);
    await node.close();
  });

  it("only accepts a folder that holds this project's app", async () => {
    const node = WeaveNode.init('Martin', temp());
    await node.createProject({ name: 'Gameshow' });
    await node.publishApp({ project: 'Gameshow', manifest: manifest(['node', 'server.js']) });
    const empty = temp();
    await expect(node.setAppFolder({ project: 'Gameshow', folder: empty })).rejects.toThrow(/no weave.app.json/);
    const other = temp();
    writeFileSync(join(other, 'weave.app.json'), JSON.stringify({ app: 'something-else', services: [{ port: 1 }] }));
    await expect(node.setAppFolder({ project: 'Gameshow', folder: other })).rejects.toThrow(/holds the app "something-else"/);
    await expect(node.launchApp({ project: 'Gameshow', approve: true })).rejects.toThrow(/choose where/);
    await node.close();
  });
});
