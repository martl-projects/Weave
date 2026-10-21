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

/** What each node keeps up to date as events arrive must equal decoding everything from scratch. */
function same(nodes: WeaveNode[]): void {
  for (const node of nodes) {
    const kept = node._decodedIds();
    expect(node._decodedIds(true)).toEqual(kept);
  }
}

describe('decoding as events arrive', () => {
  it('keeps the decoded events equal to decoding from scratch, through keys, boards, agents, removals and late events', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const kofi = person('Kofi');
    const all = [martin, lena, kofi];
    // Decode once, so later events take the incremental path.
    same(all);

    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll(all);
    same(all);

    await martin.submit({ space: 'Weave', title: 'First idea', text: 'one' });
    await lena.submit({ space: 'Weave', title: 'Second idea' });
    await kofi.say({ space: 'Weave', text: 'hello all' });
    // One at a time, in different orders, decoding in between.
    pass(lena, martin);
    same(all);
    pass(kofi, martin);
    pass(martin, lena);
    same(all);
    syncAll(all);
    same(all);

    // A read-limited board: its key reaches readers, which makes more events readable.
    await martin.setBoard({ project: 'Weave', name: 'core', title: 'Core', type: 'posts' });
    await martin.setBoardAccess({ project: 'Weave', board: 'core', read: ['Martin', 'Lena'] });
    await martin.submit({ space: 'Weave', board: 'core', title: 'Only for readers' });
    syncAll(all);
    await lena.reconcile();
    syncAll(all);
    same(all);

    // An agent: a key event, then what it signs.
    await martin.addAgent('helper', ['weave.post', 'weave.msg']);
    await martin.submit({ space: 'Weave', title: 'From the helper', as: 'helper' });
    syncAll(all);
    same(all);

    // Direct chats and private notes.
    await lena.say({ space: 'Kofi', text: 'just between us' }).catch(() => undefined);
    const idea = (await martin.posts({ space: 'Weave' })).find((p) => p.title === 'First idea')!;
    await martin.save({ target: idea.id, mode: 'saved' });
    syncAll(all);
    same(all);

    // Removal rotates the key; what comes after is for the rest.
    await martin.removeMember('Weave', 'Kofi');
    await martin.submit({ space: 'Weave', title: 'After Kofi left' });
    syncAll(all);
    same(all);

    // And the views agree with what people should see.
    expect((await lena.posts({ space: 'Weave' })).map((p) => p.title)).toContain('After Kofi left');
    expect((await kofi.posts({ space: 'Weave' }).catch(() => [])).map((p) => p.title)).not.toContain('After Kofi left');
    for (const node of all) await node.close();
  });
});
