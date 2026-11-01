import { describe, expect, it } from 'vitest';
import { duplexPair, PeerSession2 } from '@weave/net';
import { WeaveNode } from '../src/index.ts';
import { people, stored } from './helpers/people.ts';

/*
 * Julian (1.11.2026): a project whose newcomers read from their invite on gets a new key with every invite. Julian
 * joined, and before his join reached martl (finding each other takes a few seconds), martl invited the next one:
 * that key went to the members martl knew, without Julian. Then martl's node saw a peer holding only an older key,
 * sent it the rekeys (none for Julian) and synced nothing else, so Julian's join never arrived and he never got a key.
 */

const { person } = people('joinsync');

function link(a: WeaveNode, b: WeaveNode) {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: a.sessionAccess() });
  const right = new PeerSession2(b.replica, sb, { access: b.sessionAccess() });
  return { sessions: [left, right] as const, close: () => (left.close(), right.close()) };
}
const settle = (ms = 1500) => new Promise((resolve) => setTimeout(resolve, ms));
const texts = async (node: WeaveNode) => (await node.messages('Race')).map((m) => m.text);

describe('someone whose join reaches the maintainer only after the next new key', () => {
  it('still gets in: the join arrives, the newer keys follow, and they read each other', async () => {
    const [martl, julian, nic] = [person('martl'), person('julian'), person('nic')];
    await martl.createProject({ name: 'Race' });
    await martl.setHistory({ space: 'Race', history: 'joining' });
    await julian.joinSpace(await martl.invite('Race'));
    // Before Julian's join is there: the next invite, the next key, without him.
    await nic.joinSpace(await martl.invite('Race'));
    expect(Object.keys(stored(julian, 'Race').keys).length).toBeLessThan(Object.keys(stored(martl, 'Race').keys).length);
    const { sessions, close } = link(martl, julian);
    try {
      await settle();
      expect((await martl.members('Race')).map((m) => m.did)).toContain(julian.identity.author);
      // martl's node hands him the key he missed (the daemon does this as new events come in).
      expect(await martl.reconcile()).toBeGreaterThan(0);
      await settle();
      // Julian's node says hello again with what it got (over the network the swarm does this; here by hand).
      sessions[1].announce();
      sessions[0].announce();
      await settle();
      expect(Object.keys(stored(julian, 'Race').keys)).toEqual(Object.keys(stored(martl, 'Race').keys).filter((e) => Number(e) >= Number(Object.keys(stored(julian, 'Race').keys)[0])));
      await martl.say({ space: 'Race', text: 'hello julian' });
      await julian.say({ space: 'Race', text: 'hallo' });
      await settle();
      expect(await texts(julian)).toContain('hello julian');
      expect(await texts(martl)).toContain('hallo');
    } finally {
      close();
    }
  });
});
