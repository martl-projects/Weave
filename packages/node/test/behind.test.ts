import { describe, expect, it } from 'vitest';
import { duplexPair, PeerSession2 } from '@weave/net';
import { WeaveNode } from '../src/index.ts';
import { people, stored, sync } from './helpers/people.ts';

/*
 * Phil's report (1.11.2026): two people removed from the project one after the
 * other, six seconds apart, while he was offline. His node held only the key
 * from before both rotations, the others announced the two newest keys only,
 * so the project wasn't shared between them at all: no posts, and no rekeys
 * to catch up with either. A node now announces every key it holds.
 */

const { person, nodes } = people('behind');

/** Two nodes connected as over the network. */
function link(a: WeaveNode, b: WeaveNode): { sessions: [PeerSession2, PeerSession2]; close: () => void } {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: a.sessionAccess() });
  const right = new PeerSession2(b.replica, sb, { access: b.sessionAccess() });
  return { sessions: [left, right], close: () => (left.close(), right.close()) };
}

const settle = (ms = 1500) => new Promise((resolve) => setTimeout(resolve, ms));
const texts = async (node: WeaveNode) => (await node.messages('Studio')).map((m) => m.text);

describe('a member who missed more than one rotation', () => {
  it('still meets the others on an old key, takes the rekeys and reads what came after', async () => {
    const [martin, phil, ada, bea] = [person('Martin'), person('Phil'), person('Ada'), person('Bea')];
    await martin.createProject({ name: 'Studio' });
    for (const n of [phil, ada, bea]) await n.joinSpace(await martin.invite('Studio'));
    for (const n of [phil, ada, bea]) sync(n, martin);
    sync(martin, phil);
    await martin.say({ space: 'Studio', text: 'before' });
    sync(martin, phil);
    expect(await texts(phil)).toEqual(['before']);
    // Phil is away: two removals in a row, two new keys, and a post under the newest.
    await martin.removeMember('Studio', 'Ada');
    await martin.removeMember('Studio', 'Bea');
    await martin.say({ space: 'Studio', text: 'after both rotations' });
    expect(Object.keys(stored(martin, 'Studio').keys)).toHaveLength(3);
    expect(Object.keys(stored(phil, 'Studio').keys)).toHaveLength(1);
    // Phil is back: Martin's node sees his old key, hands him the rekeys, and Phil's node takes both.
    const { sessions, close } = link(martin, phil);
    try {
      await settle();
      expect(Object.keys(stored(phil, 'Studio').keys)).toHaveLength(3);
      // His node says hello again with the new keys (over the network the swarm does this; here by hand), then syncs fully.
      sessions[1].announce();
      await settle();
      expect(await texts(phil)).toEqual(expect.arrayContaining(['before', 'after both rotations']));
    } finally {
      close();
    }
  });
});

void nodes;
