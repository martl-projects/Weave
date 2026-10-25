import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openIn } from '@weave/core';
import { closeOpenStores, loadSpaces, resolveHome, SqliteStore, WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  for (const dir of dirs) for (const path of [dir, ...siblings(dir)]) rmSync(path, { recursive: true, force: true });
});

/** The backups made next to a home. */
const siblings = (dir: string) => {
  const parent = join(dir, '..');
  const base = dir.slice(parent.length + 1);
  return readdirSync(parent).filter((f) => f.startsWith(`${base}-backup`)).map((f) => join(parent, f));
};

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'weave-migration-'));
  dirs.push(dir);
  return dir;
}

/** Make a home look as if v0.3 had written it: not marked as moved to v0.4. */
function asBefore(dir: string): void {
  const store = new SqliteStore(join(dir, 'weave.db'));
  store.setMeta('migrated', '');
  store.close();
}

const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));

/** What a person sees, to compare before and after. */
async function view(node: WeaveNode) {
  const posts = await node.posts({ space: 'Weave' });
  return {
    posts: posts.map((p) => [p.id, p.title, p.score, p.chat]),
    members: (await node.members('Weave')).map((m) => [m.did, m.name]),
    chat: (await node.feed({ space: 'Weave', kinds: ['weave.msg'] })).map((i) => [i.id, i.body]),
    saved: (await node.feed({ kinds: ['weave.post'] })).length,
  };
}

describe('moving a home to v0.4', () => {
  it('signs its history again as v2 with the same ids and views, keeps a backup, and says goodbye to v0.3 peers', async () => {
    const [martinDir, lenaDir] = [home(), home()];
    // A v0.3 world: a project, posts, chat, upvotes, an agent.
    let martin = WeaveNode.init('Martin', martinDir, { writeVersion: 1 });
    const lena = WeaveNode.init('Lena', lenaDir, { writeVersion: 1 });
    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    sync(martin, lena);
    sync(lena, martin);
    const idea = await martin.submit({ space: 'Weave', title: 'First idea', text: 'one' });
    await martin.addAgent('helper', ['weave.post', 'weave.msg']);
    await martin.submit({ space: 'Weave', title: 'From the helper', as: 'helper' });
    sync(martin, lena);
    await lena.upvote({ target: idea.id, value: 1 });
    await lena.say({ space: 'Weave', text: 'hello all' });
    sync(lena, martin);
    await martin.say({ space: 'Weave', text: `about ${idea.id}`, post: idea.id });
    sync(martin, lena);
    const before = await view(martin);
    expect(martin.replica.events().every((r) => r.v === 1)).toBe(true);
    await martin.close();
    asBefore(martinDir);

    // The first start of v0.4.
    martin = WeaveNode.open(martinDir);
    const backups = siblings(martinDir);
    expect(backups).toHaveLength(1);
    expect(existsSync(join(backups[0], 'weave.db'))).toBe(true);
    expect(await view(martin)).toEqual(before);
    const device = martin.identity.did;
    const mine = martin.replica.events((r) => r.author === martin.identity.author && r.signer !== martin.identity.author);
    // Everything the device and the agent signed is v2 now, but the farewell to v0.3.
    expect(mine.filter((r) => r.v === 1).map((r) => r.kind)).toEqual(['weave.sealed']);
    expect(mine.filter((r) => r.v === 2).length).toBeGreaterThan(5);
    expect(martin.replica.store.number2(device)).toBe(martin.replica.store.head(device)!.seq - 1);

    // A v0.3 peer gets the farewell in the project's chat (v0.4 doesn't show it: it's for v0.3).
    const farewell = martin.replica.store.head(device)!;
    lena.replica.ingest(farewell);
    expect(lena.replica.store.head(device)).toEqual(farewell);
    const project = loadSpaces(resolveHome(lenaDir)).find((s) => s.name === 'Weave')!;
    expect(openIn(project, farewell)).toMatchObject({ kind: 'weave.msg', body: { text: expect.stringMatching(/moved to Weave 0\.4.*releases\/latest/) } });
    expect((await martin.feed({ space: 'Weave', kinds: ['weave.msg'] })).map((i) => (i.body as { text: string }).text).join()).not.toMatch(/moved/);

    // Writing goes on after the last number; a second start does nothing more.
    await martin.say({ space: 'Weave', text: 'on v0.4' });
    await martin.close();
    martin = WeaveNode.open(martinDir);
    expect(siblings(martinDir)).toHaveLength(1);
    expect((await martin.feed({ space: 'Weave', kinds: ['weave.msg'] })).map((i) => (i.body as { text: string }).text)).toContain('on v0.4');

    // Lena moves too: then both are on v2 and see the same.
    await lena.close();
    asBefore(lenaDir);
    const lena4 = WeaveNode.open(lenaDir);
    sync(martin, lena4);
    sync(lena4, martin);
    expect((await view(lena4)).posts).toEqual((await view(martin)).posts);
    expect((await martin.post(idea.id)).score).toBe(1);
    for (const node of [martin, lena4]) await node.close();
  });

  it('marks a new home as moved without copying anything', async () => {
    const dir = home();
    const node = WeaveNode.init('Kofi', dir);
    await node.close();
    WeaveNode.open(dir).close();
    expect(siblings(dir)).toHaveLength(0);
  });
});
