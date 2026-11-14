import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

/*
 * A person allows their agent one more kind (a new delegation, in the person's own log), and the agent signs an event
 * of that kind right away. The two travel apart, so a peer may get the event before the delegation that allows it.
 * It must count there as soon as the delegation has come, not only after a restart.
 */

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-kind-order-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

const syncAll = (nodes: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

const ids = (node: WeaveNode) => new Set(node.replica.events().map((e) => e.id));

describe('an agent signing a kind it was just allowed', () => {
  it('counts on a peer that got the event before the delegation: sealed, in a project', async () => {
    const martl = person('martl');
    const ola = person('Ola');
    await martl.createProject({ name: 'Team' });
    await ola.joinSpace(await martl.invite('Team'));
    await martl.addAgent('claude', ['weave.post']);
    const card = await martl.submit({ space: 'Team', board: 'ideas', title: 'A card', as: 'claude' });
    syncAll([martl, ola]);
    // Ola has decoded everything once, so what comes next takes the path of events arriving one by one.
    expect((await ola.posts({ space: 'Team' })).map((p) => p.title)).toEqual(['A card']);

    const before = ids(martl);
    await martl.updateAgent({ name: 'claude', permissions: ['weave.post', 'kanban.move'] });
    const delegation = martl.replica.events().filter((e) => !before.has(e.id));
    expect(delegation.map((e) => e.kind)).toEqual(['weave.delegate']);
    const moved = await martl.publish({ kind: 'kanban.move', body: { target: card.id, column: 'Doing' }, space: 'Team', as: 'claude' });
    const move = martl.replica.events().filter((e) => e.id === moved.id);
    expect(move).toHaveLength(1);

    // The event first: Ola's node keeps it, but can't count it yet.
    expect(ola.replica.ingest(move[0]).status).toBe('accepted');
    expect((await ola.feed({ space: 'Team', kinds: ['kanban.move'] })).map((i) => i.id)).toEqual([]);
    // Then the delegation: now it counts, without a restart.
    expect(ola.replica.ingest(delegation[0]).status).toBe('accepted');
    expect((await ola.feed({ space: 'Team', kinds: ['kanban.move'] })).map((i) => i.id)).toEqual([moved.id]);
    // And what her node kept up to date equals decoding from scratch.
    const kept = ola._decodedIds();
    expect(ola._decodedIds(true)).toEqual(kept);
  });

  it('counts on a peer that got the event before the delegation: in the open', async () => {
    const martl = person('martl');
    const ola = person('Ola');
    await martl.addAgent('claude', ['weave.post']);
    await martl.publish({ kind: 'weave.post', body: { title: 'Hello' }, as: 'claude' });
    syncAll([martl, ola]);
    expect((await ola.feed({ author: martl.identity.author, kinds: ['weave.post'] })).length).toBe(1);

    const before = ids(martl);
    await martl.updateAgent({ name: 'claude', permissions: ['weave.post', 'tiles.move'] });
    const delegation = martl.replica.events().filter((e) => !before.has(e.id));
    const moved = await martl.publish({ kind: 'tiles.move', body: { tile: 'A' }, as: 'claude' });
    const move = martl.replica.events().filter((e) => e.id === moved.id);

    // The event first: it waits for the delegation that allows it, instead of being dropped for good.
    expect(ola.replica.ingest(move[0])).toEqual({ status: 'pending', reason: 'signer may not sign tiles.move' });
    expect((await ola.feed({ author: martl.identity.author, kinds: ['tiles.move'] })).map((i) => i.id)).toEqual([]);
    expect(ola.replica.ingest(delegation[0]).status).toBe('accepted');
    expect((await ola.feed({ author: martl.identity.author, kinds: ['tiles.move'] })).map((i) => i.id)).toEqual([moved.id]);
  });
});
