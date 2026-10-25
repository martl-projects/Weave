import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-decoding-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

/** Hand `to` everything `from` holds, newest first, so older events keep arriving after newer ones. */
function pass(from: WeaveNode, to: WeaveNode): void {
  for (const e of from.replica.events().reverse()) to.replica.ingest(e);
}

/** Everyone gets everyone's events, as if they had all been online together. */
function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) pass(from, to);
}

/** What people see, from one node: posts and members of the project, if they're in it. */
async function view(node: WeaveNode): Promise<string> {
  const posts = await node.posts({ space: 'Weave' }).catch(() => []);
  const members = await node.members('Weave').catch(() => []);
  return JSON.stringify({ posts: posts.map((p) => [p.id, p.title, p.board, p.score, p.chat]), members: members.map((m) => [m.did, m.name]) });
}

/** What each node keeps up to date as events arrive (and caches) must equal decoding everything from scratch. */
async function same(nodes: WeaveNode[]): Promise<void> {
  for (const node of nodes) {
    const kept = node._decodedIds();
    const seen = await view(node);
    expect(node._decodedIds(true)).toEqual(kept);
    expect(await view(node)).toBe(seen);
  }
}

describe('decoding as events arrive', () => {
  it('keeps the decoded events equal to decoding from scratch, through keys, boards, agents, removals and late events', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const kofi = person('Kofi');
    const all = [martin, lena, kofi];
    // Decode once, so later events take the incremental path.
    await same(all);

    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll(all);
    await same(all);

    await martin.submit({ space: 'Weave', title: 'First idea', text: 'one' });
    await lena.submit({ space: 'Weave', title: 'Second idea' });
    await kofi.say({ space: 'Weave', text: 'hello all' });
    // One at a time, in different orders, decoding in between.
    pass(lena, martin);
    await same(all);
    pass(kofi, martin);
    pass(martin, lena);
    await same(all);
    syncAll(all);
    await same(all);

    // A new name reaches everyone, through the kept person index too.
    expect(martin.nameOf(lena.identity.author)).toBe('Lena');
    await lena.setProfile({ name: 'Lena B.' });
    syncAll(all);
    expect(martin.nameOf(lena.identity.author)).toBe('Lena B.');
    expect((await martin.members('Weave')).map((m) => m.name).sort()).toEqual(['Kofi', 'Lena B.', 'Martin']);
    await same(all);

    // A read-limited board: its key reaches readers, which makes more events readable.
    await martin.setBoard({ project: 'Weave', name: 'core', title: 'Core', type: 'posts' });
    await martin.setBoardAccess({ project: 'Weave', board: 'core', read: ['Martin', 'Lena'] });
    await martin.submit({ space: 'Weave', board: 'core', title: 'Only for readers' });
    syncAll(all);
    await lena.reconcile();
    syncAll(all);
    await same(all);

    // An agent: a key event, then what it signs.
    await martin.addAgent('helper', ['weave.post', 'weave.msg']);
    await martin.submit({ space: 'Weave', title: 'From the helper', as: 'helper' });
    syncAll(all);
    await same(all);

    // Direct chats and private notes.
    await lena.say({ space: 'Kofi', text: 'just between us' }).catch(() => undefined);
    const idea = (await martin.posts({ space: 'Weave' })).find((p) => p.title === 'First idea')!;
    await martin.save({ target: idea.id, mode: 'saved' });
    syncAll(all);
    await same(all);

    // Removal rotates the key; what comes after is for the rest.
    await martin.removeMember('Weave', 'Kofi');
    await martin.submit({ space: 'Weave', title: 'After Kofi left' });
    syncAll(all);
    await same(all);

    // And the views agree with what people should see.
    expect((await lena.posts({ space: 'Weave' })).map((p) => p.title)).toContain('After Kofi left');
    expect((await kofi.posts({ space: 'Weave' }).catch(() => [])).map((p) => p.title)).not.toContain('After Kofi left');
    for (const node of all) await node.close();
  });
});
